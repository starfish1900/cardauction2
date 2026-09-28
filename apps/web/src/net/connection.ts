import type { Move } from '@cardauction/engine';
import {
  PROTOCOL_VERSION,
  type AiLevel,
  type ClientToServerEvents,
  type Failure,
  type ServerToClientEvents,
  type WireView,
} from '@cardauction/protocol';
import { io, type Socket } from 'socket.io-client';
import { actions, useStore } from '../state/store';
import { readSetting, writeSetting } from '../state/storage';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type Answer<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];

/** The server: its own address in production, this page's origin (the dev proxy) otherwise. */
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
const BUILD = `web-${import.meta.env.MODE}`;

let socket: ClientSocket | null = null;
/** A private code from a /join/CODE link, joined once the session is ready. */
let pendingJoin: string | null = null;
/** "Play here" after another tab took over: the game shown here may simply be over there. */
let takingBack = false;
let commandCounter = 0;

const offline: Failure = { ok: false, code: 'INTERNAL' };

function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Payload<E>,
  timeoutMs = 10_000,
): Promise<Answer<E> | Failure> {
  const s = socket;
  if (!s?.connected) return Promise.resolve(offline);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(offline), timeoutMs);
    (s.emit as (name: string, data: unknown, ack: (reply: unknown) => void) => void)(
      event,
      payload,
      (reply) => {
        clearTimeout(timer);
        resolve(reply as Answer<E>);
      },
    );
  });
}

/**
 * Refusals the next view explains by itself: the game moved on (the opponent's move, the end
 * of the game) while this move was on its way.
 */
const OVERTAKEN = new Set(['STALE', 'NOT_YOUR_TURN', 'GAME_OVER', 'WRONG_PHASE']);

/** Shows the reason for a refusal, except the ones the UI already explains in place. */
function report(reply: { ok: boolean; code?: string }): boolean {
  if (reply.ok) return true;
  if (reply.code && !OVERTAKEN.has(reply.code)) actions.notify('error', { code: reply.code });
  return false;
}

async function hello(): Promise<void> {
  const nickname = readSetting('nickname');
  let reply = await request('session.hello', {
    protocol: PROTOCOL_VERSION,
    build: BUILD,
    ...(nickname ? { nickname } : {}),
  });
  if (!reply.ok && reply.code === 'BAD_NICKNAME') {
    writeSetting('nickname', null);
    reply = await request('session.hello', { protocol: PROTOCOL_VERSION, build: BUILD });
  }
  if (!reply.ok) {
    if (reply.code === 'UPDATE_REQUIRED') actions.notify('update');
    return;
  }
  if (reply.token && socket) {
    writeSetting('token', reply.token);
    socket.auth = { token: reply.token };
  }
  const before = useStore.getState();
  const wasQueued = before.queue !== null;
  const hosted = before.privateCode;
  const tookBack = takingBack;
  takingBack = false;
  actions.online(reply);
  const game = useStore.getState().game;
  if (reply.endedGame) {
    actions.notify('ended', { ended: reply.endedGame });
    if (game?.gameId === reply.endedGame.gameId) actions.leaveGame();
  } else if (game && game.gameId !== reply.activeGameId) {
    // The server no longer has the game this page was showing: finished in another tab, or,
    // if it was still being played, lost by a server restart.
    actions.leaveGame();
    if (game.view.status !== 'over' && !tookBack) actions.notify('serverError');
  }
  // The server drops a disconnected player from the queue: join again after a network blip.
  if (wasQueued && reply.queuedSince === undefined && !reply.activeGameId) void api.quickJoin();
  if (hosted && !reply.privateCode && !reply.activeGameId) {
    actions.notify('codeExpired', { params: { code: hosted.code } });
  }
  // An invitation link is joined once, whatever the player was doing: the server moves the
  // player off a finished game, and refuses (with a message) only during a game in progress.
  if (pendingJoin) {
    const code = pendingJoin;
    pendingJoin = null;
    void api.joinPrivate(code);
  }
}

export function connect(): void {
  if (socket) return;
  const token = readSetting('token');
  const path = /^\/join\/([A-Za-z0-9-]{4,12})\/?$/u.exec(window.location.pathname);
  if (path?.[1]) {
    pendingJoin = path[1];
    window.history.replaceState(null, '', '/');
  }
  const s: ClientSocket = io(SERVER_URL, {
    transports: ['websocket'],
    // 0.5 s, 1 s, 2 s, then up to 5 s between attempts.
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0,
    auth: token ? { token } : {},
  });
  socket = s;
  s.on('connect', () => {
    void hello();
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' && useStore.getState().connection === 'replaced') return;
    actions.offline();
  });
  s.on('server.notice', ({ kind }) => {
    if (kind === 'replaced') actions.replaced();
    else if (kind === 'update-required') actions.notify('update');
    else if (kind === 'restarting') actions.notify('restarting');
  });
  s.on('lobby.matched', () => {
    useStore.setState({ queue: null, privateCode: null });
  });
  s.on('lobby.aiOffer', () => actions.aiOffered());
  s.on('lobby.requeued', ({ since }) => {
    actions.queued(since);
    actions.notify('requeued');
  });
  s.on('lobby.private.expired', ({ code }) => {
    actions.home();
    actions.notify('codeExpired', { params: { code } });
  });
  s.on('game.update', (update) => {
    actions.update(update);
    // Confirm the start on every update that still says starting: a confirmation lost with a
    // dropped connection is sent again after the resync (the server accepts repeats).
    if (update.view.status === 'starting') {
      void request('game.ready', { gameId: update.gameId, version: update.view.version });
    }
  });
  s.on('game.presence', (p) => actions.presence(p));
  s.on('game.cancelled', ({ reason }) => {
    actions.leaveGame();
    actions.notify(reason === 'start-timeout' ? 'cancelled' : 'serverError');
  });
  s.on('game.rematch', ({ gameId, accept }) => actions.rematchOffer(gameId, accept));
}

/** After "replaced": take the game back in this tab. */
export function reconnect(): void {
  takingBack = true;
  useStore.setState({ connection: 'connecting' });
  socket?.connect();
}

const cmdId = (): string => `${Date.now().toString(36)}-${(++commandCounter).toString(36)}`;

export const api = {
  async setNickname(nickname: string): Promise<boolean> {
    const reply = await request('session.hello', {
      protocol: PROTOCOL_VERSION,
      build: BUILD,
      nickname,
    });
    if (!reply.ok) return report(reply);
    writeSetting('nickname', reply.nickname);
    if (reply.token && socket) {
      writeSetting('token', reply.token);
      socket.auth = { token: reply.token };
    }
    actions.online(reply);
    return true;
  },

  async quickJoin(): Promise<void> {
    const reply = await request('lobby.quick.join', {});
    if (report(reply) && reply.ok) {
      if (useStore.getState().screen !== 'game') actions.queued(reply.since);
    }
  },

  async quickLeave(): Promise<void> {
    await request('lobby.quick.leave', {});
    actions.home();
  },

  async aiStart(level: AiLevel, seat: 'P1' | 'P2' | 'random'): Promise<void> {
    await request('lobby.quick.leave', {});
    report(await request('lobby.ai.start', { level, seat }));
  },

  async createPrivate(): Promise<void> {
    const reply = await request('lobby.private.create', {});
    if (report(reply) && reply.ok) actions.hosting(reply.code, reply.expiresAt);
  },

  async cancelPrivate(): Promise<void> {
    await request('lobby.private.cancel', {});
    actions.home();
  },

  async joinPrivate(code: string): Promise<void> {
    const joined = report(await request('lobby.private.join', { code }));
    // A refused invitation stays in the code field, to try again.
    useStore.setState({ joinCode: joined ? null : code });
  },

  /** Sends a composed move; true when the server accepted it. */
  async move(view: WireView, move: Move): Promise<boolean> {
    const base = { gameId: view.gameId, cmdId: cmdId(), expectedVersion: view.version };
    const reply =
      move.type === 'pass'
        ? await request('game.exchange', base)
        : move.type === 'exchange'
          ? await request('game.exchange', { ...base, give: move.give, take: move.take })
          : await request('game.turn', {
              ...base,
              tens: move.tens,
              units: move.units,
              ...(move.action ? { action: move.action } : {}),
              ...(move.take !== undefined ? { take: move.take } : {}),
            });
    if (!reply.ok && OVERTAKEN.has(reply.code)) void api.sync(view.gameId);
    return report(reply);
  },

  async resign(gameId: string): Promise<void> {
    report(await request('game.resign', { gameId, cmdId: cmdId() }));
  },

  async rematch(gameId: string): Promise<boolean> {
    return report(await request('game.rematch', { gameId, accept: true }));
  },

  async leave(gameId: string): Promise<void> {
    await request('game.leave', { gameId });
    actions.leaveGame();
  },

  async sync(gameId: string): Promise<void> {
    const reply = await request('game.sync', { gameId });
    if (reply.ok) actions.update(reply.update);
  },
};
