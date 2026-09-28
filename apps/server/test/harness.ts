import { expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  legalBids,
  newGame,
  seededRng,
  takeOptions,
  type GameState,
  type Rng,
} from '@cardauction/engine';
import {
  PROTOCOL_VERSION,
  stateFromView,
  type ClientToServerEvents,
  type GameUpdate,
  type Reply,
  type ServerToClientEvents,
  type Welcome,
  type WireView,
} from '@cardauction/protocol';
import { io as connect, type Socket } from 'socket.io-client';
import type { AiPlayer } from '../src/ai.js';
import { ManualClock } from '../src/clock.js';
import { loadConfig, type Config } from '../src/config.js';
import { createGameServer, type GameServer } from '../src/server.js';

export interface TestServer {
  readonly url: string;
  readonly clock: ManualClock;
  readonly server: GameServer;
  close(): Promise<void>;
}

export interface TestServerOptions {
  readonly config?: Partial<Config>;
  readonly ai?: AiPlayer;
  readonly deal?: () => GameState;
  readonly random?: Rng;
}

/** A real server on a free port, with a manual clock and reproducible deals and seat draws. */
export async function startServer(options: TestServerOptions = {}): Promise<TestServer> {
  const config: Config = {
    ...loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 's'.repeat(40), LOG_LEVEL: 'silent' }),
    maxConnectionsPerIp: 1000,
    ...options.config,
  };
  const clock = new ManualClock();
  let seed = 1;
  const server = createGameServer({
    config,
    clock,
    deal: options.deal ?? (() => newGame(seededRng(seed++))),
    random: options.random ?? seededRng(99),
    flushMs: 30,
    ...(options.ai ? { ai: options.ai } : {}),
  });
  const port = await server.listen(0, '127.0.0.1');
  return { url: `http://127.0.0.1:${port}`, clock, server, close: () => server.close() };
}

type Message = { readonly event: string; readonly payload: unknown };
type ServerEvent = keyof ServerToClientEvents;
type Payload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

/** A test client: every server event lands in an inbox that tests take from in order. */
export class TestClient {
  readonly inbox: Message[] = [];
  private waiters: (() => void)[] = [];
  playerId = '';
  nickname = '';
  token: string | null = null;
  /** Latest view per game. */
  readonly views = new Map<string, WireView>();

  private constructor(
    readonly url: string,
    public socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  ) {
    this.listen();
  }

  static async connect(
    url: string,
    options: { token?: string | null; nickname?: string } = {},
  ): Promise<TestClient> {
    const client = new TestClient(url, openSocket(url, options.token ?? null));
    await client.whenConnected();
    const welcome = await client.hello(options.nickname);
    if (!welcome.ok) throw new Error(`hello failed: ${welcome.code}`);
    return client;
  }

  async hello(nickname?: string): Promise<Reply<Welcome>> {
    const reply = await this.emit('session.hello', {
      protocol: PROTOCOL_VERSION,
      build: 'test',
      ...(nickname !== undefined ? { nickname } : {}),
    });
    if (reply.ok) {
      this.playerId = reply.playerId;
      this.nickname = reply.nickname;
      if (reply.token) this.token = reply.token;
    }
    return reply;
  }

  emit<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<Parameters<Parameters<ClientToServerEvents[E]>[1]>[0]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply to ${event}`)), 3000);
      (this.socket.emit as (e: string, p: unknown, ack: (r: unknown) => void) => void)(
        event,
        payload,
        (reply: unknown) => {
          clearTimeout(timer);
          resolve(reply as Parameters<Parameters<ClientToServerEvents[E]>[1]>[0]);
        },
      );
    });
  }

  /** Takes the first unread event of this name (matching `where`), waiting up to 3 s. */
  async take<E extends ServerEvent>(
    event: E,
    where: (payload: Payload<E>) => boolean = () => true,
  ): Promise<Payload<E>> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const index = this.inbox.findIndex(
        (m) => m.event === event && where(m.payload as Payload<E>),
      );
      if (index >= 0) {
        const [message] = this.inbox.splice(index, 1);
        return (message as Message).payload as Payload<E>;
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        const seen = this.inbox.map((m) => m.event).join(', ') || 'nothing';
        throw new Error(`${this.nickname || 'client'} did not receive ${event} (inbox: ${seen})`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Waits for the next game.update of a game (optionally one satisfying `where`). */
  update(gameId: string, where: (u: GameUpdate) => boolean = () => true): Promise<GameUpdate> {
    return this.take('game.update', (u) => u.gameId === gameId && where(u));
  }

  has(event: ServerEvent): boolean {
    return this.inbox.some((m) => m.event === event);
  }

  view(gameId: string): WireView {
    const view = this.views.get(gameId);
    if (!view) throw new Error(`no view of ${gameId}`);
    return view;
  }

  /** Plays some legal move for this client in its current view (the first legal bid, a pass). */
  async playLegal(gameId: string): Promise<Reply<{ readonly version: number }>> {
    const view = this.view(gameId);
    if (view.phase === 'exchange') {
      return this.emit('game.exchange', {
        gameId,
        cmdId: randomUUID(),
        expectedVersion: view.version,
      });
    }
    const state = stateFromView(view);
    const [bid] = legalBids(state);
    if (!bid) throw new Error('no legal bid');
    const [take] = takeOptions(state, bid);
    return this.emit('game.turn', {
      gameId,
      cmdId: randomUUID(),
      expectedVersion: view.version,
      tens: bid.tens,
      units: bid.units,
      ...(bid.action ? { action: bid.action } : {}),
      ...(take !== undefined ? { take } : {}),
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket.connected) return;
    await new Promise<void>((resolve) => {
      this.socket.once('disconnect', () => resolve());
      this.socket.disconnect();
    });
  }

  /** A new connection with the same token, as after a page reload or a network drop. */
  async reconnect(): Promise<Reply<Welcome>> {
    await this.disconnect();
    this.inbox.length = 0;
    this.socket = openSocket(this.url, this.token);
    this.listen();
    await this.whenConnected();
    return this.hello();
  }

  private whenConnected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connection not accepted')), 2000);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private listen(): void {
    this.socket.onAny((event: string, payload: unknown) => {
      if (event === 'game.update') {
        const update = payload as GameUpdate;
        this.views.set(update.gameId, update.view);
      }
      this.inbox.push({ event, payload });
      const waiters = this.waiters;
      this.waiters = [];
      for (const wake of waiters) wake();
    });
  }
}

function openSocket(
  url: string,
  token: string | null,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  return connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: token ? { token } : {},
  });
}

/** Polls until `check` stops throwing (or returns true), for server-side effects of socket events. */
export async function until(check: () => boolean | void, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  for (;;) {
    try {
      if (check() !== false) return;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      throw lastError instanceof Error ? lastError : new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export interface Match {
  readonly gameId: string;
  /** p1 plays seat P1, p2 seat P2. */
  readonly p1: TestClient;
  readonly p2: TestClient;
}

/** Two players quick-match; returns them by seat, after both received the first state. */
export async function quickMatch(
  t: TestServer,
  names: [string, string] = ['Ada', 'Bob'],
): Promise<Match> {
  const a = await TestClient.connect(t.url, { nickname: names[0] });
  const b = await TestClient.connect(t.url, { nickname: names[1] });
  expect((await a.emit('lobby.quick.join', {})).ok).toBe(true);
  expect((await b.emit('lobby.quick.join', {})).ok).toBe(true);
  const matchedA = await a.take('lobby.matched');
  const matchedB = await b.take('lobby.matched');
  expect(matchedA.gameId).toBe(matchedB.gameId);
  const gameId = matchedA.gameId;
  await a.update(gameId);
  await b.update(gameId);
  return matchedA.seat === 'P1' ? { gameId, p1: a, p2: b } : { gameId, p1: b, p2: a };
}

/** Quick match plus the start handshake: the clock is running, P2 to exchange. */
export async function startedGame(t: TestServer, names?: [string, string]): Promise<Match> {
  const match = await quickMatch(t, names);
  const { gameId, p1, p2 } = match;
  expect((await p1.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
  expect((await p2.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
  await p1.update(gameId, (u) => u.view.status === 'playing');
  await p2.update(gameId, (u) => u.view.status === 'playing');
  return match;
}

export function closeAll(...clients: (TestClient | undefined)[]): Promise<void[]> {
  return Promise.all(clients.map((c) => c?.disconnect() ?? Promise.resolve()));
}
