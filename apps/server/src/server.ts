import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cryptoRng, newGame, type GameState, type Rng } from '@cardauction/engine';
import { PROTOCOL_VERSION, TIMING } from '@cardauction/protocol';
import { RandomAi, type AiPlayer } from './ai.js';
import { systemClock, type Clock, type TimerHandle } from './clock.js';
import type { Config } from './config.js';
import { Games } from './games/manager.js';
import { createHttpApp } from './http.js';
import { Lobby } from './lobby.js';
import { silentLogger, type Logger } from './logger.js';
import { Metrics } from './metrics.js';
import { Players } from './players.js';
import { TokenSigner } from './session.js';
import { attachSockets, type GameIo } from './sockets.js';
import { MemoryStore, type StateStore } from './store.js';

export interface ServerOptions {
  readonly config: Config;
  readonly clock?: Clock;
  readonly logger?: Logger;
  readonly ai?: AiPlayer;
  /** Deals each game; production shuffles with the cryptographic generator. */
  readonly deal?: () => GameState;
  /** Seat draws; production uses the cryptographic generator. */
  readonly random?: Rng;
  readonly store?: StateStore;
  /** Real time given to last messages before sockets close at shutdown. */
  readonly flushMs?: number;
}

export interface GameServer {
  readonly http: HttpServer;
  readonly io: GameIo;
  readonly games: Games;
  readonly lobby: Lobby;
  readonly players: Players;
  readonly metrics: Metrics;
  /** Starts listening; resolves with the bound port (useful with port 0). */
  listen(port: number, host?: string): Promise<number>;
  /** Stops taking games, tells every client, ends live games as aborted and closes. */
  close(reason?: string): Promise<void>;
  /** Runs the reaper's checks now; returns the number of repairs. */
  sweep(): number;
  health(): object;
  snapshot(): object;
}

const METRICS_LOG_MS = 60_000;

export function createGameServer(options: ServerOptions): GameServer {
  const { config } = options;
  const clock = options.clock ?? systemClock;
  const logger = options.logger ?? silentLogger;
  const random = options.random ?? cryptoRng();
  const store = options.store ?? new MemoryStore();
  const players = new Players();
  const metrics = new Metrics();
  const startedAt = clock.now();

  const games = new Games({
    clock,
    logger,
    players,
    metrics,
    store,
    ai: options.ai ?? new RandomAi(),
    deal: options.deal ?? (() => newGame(cryptoRng())),
    maxGames: config.maxGames,
    maxAiGames: config.maxAiGames,
  });
  const lobby = new Lobby({
    clock,
    logger,
    players,
    games,
    random,
    maxOpenCodes: Math.max(100, config.maxGames * 4),
  });
  const signer = new TokenSigner(config.sessionSecrets);

  const health = (): object => ({
    status: 'ok',
    protocol: PROTOCOL_VERSION,
    commit: config.commit,
    uptimeS: Math.round((clock.now() - startedAt) / 1000),
    draining: lobby.draining,
  });

  let io: GameIo | null = null;
  const snapshot = (): object => {
    const memory = process.memoryUsage();
    return {
      ...health(),
      store: store.kind,
      games: games.countsByStatus(),
      caps: { games: config.maxGames, aiGames: config.maxAiGames },
      players: players.count,
      sockets: io?.engine.clientsCount ?? 0,
      queue: lobby.queueLength,
      privateCodes: lobby.openCodes,
      timers: games.armedTimers,
      eventLoopMs: metrics.eventLoopDelay(false),
      heapMB: Math.round(memory.heapUsed / 1e6),
      rssMB: Math.round(memory.rss / 1e6),
      counters: metrics.counters(),
    };
  };

  const app = createHttpApp({
    config,
    health,
    metrics: snapshot,
    admin: {
      status: snapshot,
      drain: (on) => {
        lobby.draining = on;
        logger.warn({ draining: on }, 'drain mode changed');
      },
      abort: (gameId) => {
        const game = games.get(gameId);
        if (!game) return false;
        games.abort(game, 'aborted by an administrator');
        return true;
      },
    },
  });
  const http = createServer(app);
  io = attachSockets(http, { config, clock, logger, players, games, lobby, metrics, signer });
  const sockets = io;

  const sweep = (): number => {
    let fixes = 0;
    try {
      fixes = games.sweep() + lobby.sweep();
    } catch (error) {
      metrics.internalErrors += 1;
      logger.error({ err: error }, 'reaper failed');
    }
    metrics.reaperFixes += fixes;
    return fixes;
  };

  const repeating: TimerHandle[] = [];
  const every = (ms: number, run: () => void): void => {
    const slot = repeating.length;
    const tick = (): void => {
      run();
      repeating[slot] = clock.setTimeout(tick, ms);
    };
    repeating.push(clock.setTimeout(tick, ms));
  };
  every(TIMING.reaperIntervalMs, () => {
    sweep();
  });
  every(METRICS_LOG_MS, () => {
    logger.info({ ...snapshot(), eventLoopMs: metrics.eventLoopDelay(true) }, 'metrics');
  });

  let closing: Promise<void> | null = null;
  return {
    http,
    io: sockets,
    games,
    lobby,
    players,
    metrics,
    health,
    snapshot,
    sweep,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        metrics.startEventLoopMonitor();
        http.once('error', reject);
        http.listen(port, host, () => {
          http.off('error', reject);
          resolve((http.address() as AddressInfo).port);
        });
      }),
    close: (reason = 'server stopping') => {
      closing ??= (async () => {
        lobby.draining = true;
        for (const timer of repeating) clock.clearTimeout(timer);
        sockets.emit('server.notice', {
          kind: 'restarting',
          message: 'The server is restarting. Games in progress have ended without a result.',
        });
        games.abortAll(reason);
        lobby.clear();
        metrics.stopEventLoopMonitor();
        // Let the notice and the final game updates reach the clients before closing.
        await new Promise((resolve) => setTimeout(resolve, options.flushMs ?? 500));
        await sockets.close();
        await store.close();
      })();
      return closing;
    },
  };
}
