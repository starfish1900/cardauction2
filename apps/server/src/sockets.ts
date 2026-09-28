import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { clientAddress } from './address.js';
import {
  ACCEPTED_PROTOCOLS,
  aiStartSchema,
  emptySchema,
  exchangeSchema,
  gameRefSchema,
  helloSchema,
  MAX_MESSAGE_BYTES,
  privateJoinSchema,
  readySchema,
  rematchSchema,
  resignSchema,
  turnSchema,
  type ClientEventName,
  type ClientToServerEvents,
  type Failure,
  type Reply,
  type ServerToClientEvents,
  type Welcome,
} from '@cardauction/protocol';
import { Server } from 'socket.io';
import type { z } from 'zod';
import type { Clock } from './clock.js';
import type { Config } from './config.js';
import type { Games } from './games/manager.js';
import { MAX_REFUSALS_IN_A_ROW, SOCKET_RATE, TokenBucket } from './limits.js';
import type { Lobby } from './lobby.js';
import type { Logger } from './logger.js';
import type { Metrics } from './metrics.js';
import type { GameSocket, Players, SocketData } from './players.js';
import {
  guestNickname,
  newPlayerId,
  normalizeNickname,
  type Identity,
  type TokenSigner,
} from './session.js';

export type GameIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketDeps {
  readonly config: Config;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly players: Players;
  readonly games: Games;
  readonly lobby: Lobby;
  readonly metrics: Metrics;
  readonly signer: TokenSigner;
}

const SCHEMAS = {
  'session.hello': helloSchema,
  'lobby.quick.join': emptySchema,
  'lobby.quick.leave': emptySchema,
  'lobby.private.create': emptySchema,
  'lobby.private.cancel': emptySchema,
  'lobby.private.join': privateJoinSchema,
  'lobby.ai.start': aiStartSchema,
  'game.ready': readySchema,
  'game.exchange': exchangeSchema,
  'game.turn': turnSchema,
  'game.resign': resignSchema,
  'game.rematch': rematchSchema,
  'game.leave': gameRefSchema,
  'game.sync': gameRefSchema,
} as const satisfies Record<ClientEventName, z.ZodType>;

interface Context {
  readonly socket: GameSocket;
  /** Empty only for session.hello, which establishes it. */
  readonly playerId: string;
  /** Runs once the reply has been sent. */
  readonly after: (run: () => void) => void;
}

type Handler<E extends ClientEventName> = (
  context: Context,
  payload: z.infer<(typeof SCHEMAS)[E]>,
) => Reply<object>;

const fail = (code: Failure['code']): Failure => ({ ok: false, code });

/**
 * Socket.IO over WebSocket only. Every client event goes through the same gate: rate limit,
 * session check, schema validation, then its handler, whose reply is the event's acknowledgement.
 */
export function attachSockets(httpServer: HttpServer, deps: SocketDeps): GameIo {
  const { config, clock, logger, players, games, lobby, metrics, signer } = deps;
  const perAddress = new Map<string, number>();

  const io: GameIo = new Server(httpServer, {
    transports: ['websocket'],
    // Notice a silent network loss within 10 s instead of Socket.IO's default 45 s.
    pingInterval: 5_000,
    pingTimeout: 5_000,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
    cors: { origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.length > 0 && !config.corsOrigins.includes(origin)) {
        metrics.rejectedConnections += 1;
        callback('origin not allowed', false);
        return;
      }
      callback(null, true);
    },
  });

  // Connections per address are counted where the transport accepts them, so a connection that
  // never joins the namespace, or a burst of simultaneous ones, still counts.
  io.engine.on('connection', (connection: EngineConnection) => {
    const address = clientAddress(connection.request, config.clientIpHeader);
    const open = (perAddress.get(address) ?? 0) + 1;
    if (open > config.maxConnectionsPerIp) {
      metrics.rejectedConnections += 1;
      connection.close();
      return;
    }
    perAddress.set(address, open);
    connection.once('close', () => {
      const left = (perAddress.get(address) ?? 1) - 1;
      if (left > 0) perAddress.set(address, left);
      else perAddress.delete(address);
    });
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    socket.data.tokenIdentity = signer.verify(auth?.token);
    socket.data.identity = null;
    socket.data.ip = clientAddress(socket.request, config.clientIpHeader);
    socket.data.bucket = new TokenBucket(clock, SOCKET_RATE.capacity, SOCKET_RATE.perSecond);
    socket.data.refusalsInARow = 0;
    next();
  });

  io.on('connection', (socket) => {
    metrics.connections += 1;
    const ip = socket.data.ip;

    const route = <E extends ClientEventName>(event: E, handler: Handler<E>): void => {
      const listener = (...args: unknown[]): void => {
        const last = args[args.length - 1];
        const ack =
          typeof last === 'function' ? (args.pop() as (reply: Reply<object>) => void) : null;
        const reply = (answer: Reply<object>): void => {
          if (answer.ok) socket.data.refusalsInARow = 0;
          else if (++socket.data.refusalsInARow > MAX_REFUSALS_IN_A_ROW) {
            logger.warn({ ip, event }, 'too many refused messages: disconnecting');
            socket.disconnect(true);
          }
          ack?.(answer);
        };
        if (!socket.data.bucket.take()) {
          metrics.rateLimited += 1;
          reply(fail('RATE_LIMITED'));
          return;
        }
        const identity = socket.data.identity;
        if (event !== 'session.hello' && !identity) {
          reply(fail('NO_SESSION'));
          return;
        }
        const parsed = SCHEMAS[event].safeParse(args.length > 0 ? args[0] : {});
        if (!parsed.success) {
          metrics.badRequests += 1;
          reply(fail('BAD_REQUEST'));
          return;
        }
        const followUps: (() => void)[] = [];
        const context: Context = {
          socket,
          playerId: identity?.playerId ?? '',
          after: (run) => followUps.push(run),
        };
        try {
          reply(handler(context, parsed.data as z.infer<(typeof SCHEMAS)[E]>));
          for (const run of followUps) run();
        } catch (error) {
          metrics.internalErrors += 1;
          logger.error({ err: error, event, playerId: context.playerId }, 'handler failed');
          reply(fail('INTERNAL'));
        }
      };
      (socket as unknown as { on(name: string, fn: (...args: unknown[]) => void): void }).on(
        event,
        listener,
      );
    };

    route('session.hello', ({ socket: s, after }, payload): Reply<Welcome> => {
      if (!ACCEPTED_PROTOCOLS.includes(payload.protocol)) {
        s.emit('server.notice', {
          kind: 'update-required',
          message: 'A new version of CardAuction is available: please reload.',
        });
        return fail('UPDATE_REQUIRED');
      }
      let identity: Identity | null = s.data.identity ?? s.data.tokenIdentity;
      let issue = false;
      if (!identity) {
        identity = { playerId: newPlayerId(), nickname: guestNickname() };
        issue = true;
      }
      if (payload.nickname !== undefined) {
        const nickname = normalizeNickname(payload.nickname);
        if (!nickname) return fail('BAD_NICKNAME');
        if (nickname !== identity.nickname) {
          identity = { ...identity, nickname };
          issue = true;
        }
      }
      s.data.identity = identity;
      const replaced = players.attach(identity, s);
      if (replaced) {
        replaced.emit('server.notice', {
          kind: 'replaced',
          message: 'You opened CardAuction in another tab or window; it continues there.',
        });
        replaced.disconnect(true);
      }
      const playerId = identity.playerId;
      lobby.playerBack(playerId);
      const current = games.currentOf(playerId);
      const seat = current?.seatOf(playerId);
      const activeGameId = current && seat && !seat.left ? current.id : undefined;
      const endedGame = activeGameId ? null : games.takeTombstone(playerId);
      // The game's full view follows the welcome.
      if (activeGameId) after(() => games.connected(playerId));
      return {
        ok: true,
        playerId,
        nickname: identity.nickname,
        serverNow: clock.now(),
        ...(issue ? { token: signer.sign(identity, clock.now()) } : {}),
        ...(activeGameId ? { activeGameId } : {}),
        ...(endedGame ? { endedGame } : {}),
        ...lobby.status(playerId),
      };
    });

    route('lobby.quick.join', ({ playerId }) => lobby.quickJoin(playerId));
    route('lobby.quick.leave', ({ playerId }) => lobby.quickLeave(playerId));
    route('lobby.private.create', ({ playerId }) => lobby.privateCreate(playerId, ip));
    route('lobby.private.cancel', ({ playerId }) => lobby.privateCancel(playerId));
    route('lobby.private.join', ({ playerId }, { code }) => lobby.privateJoin(playerId, code, ip));
    route('lobby.ai.start', ({ playerId }, { level, seat }) =>
      lobby.aiStart(playerId, level, seat),
    );
    route('game.ready', ({ playerId }, { gameId }) => games.ready(playerId, gameId));
    route('game.exchange', ({ playerId }, payload) => games.exchange(playerId, payload));
    route('game.turn', ({ playerId }, payload) => games.turn(playerId, payload));
    route('game.resign', ({ playerId }, payload) => games.resign(playerId, payload));
    route('game.rematch', ({ playerId }, { gameId, accept }) =>
      games.rematch(playerId, gameId, accept),
    );
    route('game.leave', ({ playerId }, { gameId }) => games.leave(playerId, gameId));
    route('game.sync', ({ playerId }, { gameId }) => games.sync(playerId, gameId));

    socket.on('disconnect', () => {
      const identity = socket.data.identity;
      if (!identity || !players.detach(identity.playerId, socket)) return;
      try {
        lobby.playerGone(identity.playerId);
        games.disconnected(identity.playerId);
      } catch (error) {
        metrics.internalErrors += 1;
        logger.error({ err: error, playerId: identity.playerId }, 'disconnect handling failed');
      }
    });
  });

  return io;
}

/** The part of an engine.io connection used here. */
interface EngineConnection {
  readonly request: IncomingMessage;
  close(): void;
  once(event: 'close', listener: () => void): void;
}
