import { randomUUID } from 'node:crypto';
import type { Move } from '@cardauction/engine';
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type Reply,
  type ServerToClientEvents,
  type Welcome,
  type WireView,
} from '@cardauction/protocol';
import { io, type Socket } from 'socket.io-client';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type Answer<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];

/** Sends a client event and waits for its acknowledgement. */
export function request<E extends keyof ClientToServerEvents>(
  socket: ClientSocket,
  event: E,
  payload: Payload<E>,
  timeoutMs = 10_000,
): Promise<Answer<E>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer to ${event}`)), timeoutMs);
    (socket.emit as (name: string, data: unknown, ack: (reply: unknown) => void) => void)(
      event,
      payload,
      (reply) => {
        clearTimeout(timer);
        resolve(reply as Answer<E>);
      },
    );
  });
}

export interface SessionOptions {
  readonly token?: string | null;
  readonly nickname?: string;
  readonly build: string;
  /** Reconnect automatically (interactive client) or not (bots, smoke test). */
  readonly reconnect?: boolean;
  /** Called with every welcome, including after automatic reconnections. */
  readonly onWelcome?: (welcome: Welcome) => void;
}

export interface Session {
  readonly socket: ClientSocket;
  welcome: Welcome;
  token: string | null;
}

/** Connects and says hello; with `reconnect`, says hello again after every reconnection. */
export async function openSession(url: string, options: SessionOptions): Promise<Session> {
  const socket: ClientSocket = io(url, {
    transports: ['websocket'],
    reconnection: options.reconnect ?? false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    auth: options.token ? { token: options.token } : {},
  });
  const session = { socket, token: options.token ?? null } as Session;
  const hello = async (): Promise<Welcome> => {
    const reply = await request(socket, 'session.hello', {
      protocol: PROTOCOL_VERSION,
      build: options.build,
      ...(options.nickname ? { nickname: options.nickname } : {}),
    });
    if (!reply.ok) throw new Error(`the server refused the session: ${reply.code}`);
    if (reply.token) {
      session.token = reply.token;
      socket.auth = { token: reply.token };
    }
    session.welcome = reply;
    options.onWelcome?.(reply);
    return reply;
  };
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) =>
      reject(new Error(`cannot connect to ${url}: ${error.message}`)),
    );
  });
  await hello();
  socket.io.on('reconnect', () => {
    hello().catch(() => undefined);
  });
  return session;
}

/** Sends a move as the matching game command. */
export function sendMove(
  socket: ClientSocket,
  view: WireView,
  move: Move,
): Promise<Reply<{ readonly version: number }>> {
  const base = { gameId: view.gameId, cmdId: randomUUID(), expectedVersion: view.version };
  switch (move.type) {
    case 'pass':
      return request(socket, 'game.exchange', base);
    case 'exchange':
      return request(socket, 'game.exchange', { ...base, give: move.give, take: move.take });
    case 'bid':
      return request(socket, 'game.turn', {
        ...base,
        tens: move.tens,
        units: move.units,
        ...(move.action ? { action: move.action } : {}),
        ...(move.take !== undefined ? { take: move.take } : {}),
      });
  }
}
