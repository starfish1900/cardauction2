import type { ErrorCode } from './errors.js';
import type {
  AiStartPayload,
  EmptyPayload,
  ExchangePayload,
  GameRefPayload,
  HelloPayload,
  PrivateJoinPayload,
  ReadyPayload,
  RematchPayload,
  ResignPayload,
  TurnPayload,
} from './schemas.js';
import type {
  EndedGame,
  GameUpdate,
  NoticeKind,
  PresenceUpdate,
  WireSeat,
  WireView,
} from './wire.js';

/** Every client event is acknowledged: {ok: true, ...} or {ok: false, code}. */
export type Failure = {
  readonly ok: false;
  readonly code: ErrorCode;
  /** With STALE (and some game errors): the current view, to resynchronise at once. */
  readonly view?: WireView;
};
export type Reply<T extends object = object> = ({ readonly ok: true } & T) | Failure;
export type Ack<T extends object = object> = (reply: Reply<T>) => void;

export interface Welcome {
  readonly playerId: string;
  readonly nickname: string;
  /** Present when a token was issued or renewed: store it and send it in the next handshake. */
  readonly token?: string;
  /** A game in progress or on its result screen; its full view follows as a game.update. */
  readonly activeGameId?: string;
  /** A game that was deleted while this player was away (kept 10 minutes). */
  readonly endedGame?: EndedGame;
  /** Waiting in the quick-match queue since then (for example after opening a new tab). */
  readonly queuedSince?: number;
  /** This player's open private code. */
  readonly privateCode?: { readonly code: string; readonly expiresAt: number };
  readonly serverNow: number;
}

export interface ClientToServerEvents {
  /** First message on every connection: protocol version, client build, optional nickname. */
  'session.hello': (payload: HelloPayload, ack: Ack<Welcome>) => void;
  'lobby.quick.join': (payload: EmptyPayload, ack: Ack<{ readonly since: number }>) => void;
  'lobby.quick.leave': (payload: EmptyPayload, ack: Ack) => void;
  'lobby.private.create': (
    payload: EmptyPayload,
    ack: Ack<{ readonly code: string; readonly expiresAt: number }>,
  ) => void;
  'lobby.private.cancel': (payload: EmptyPayload, ack: Ack) => void;
  'lobby.private.join': (
    payload: PrivateJoinPayload,
    ack: Ack<{ readonly gameId: string }>,
  ) => void;
  'lobby.ai.start': (payload: AiStartPayload, ack: Ack<{ readonly gameId: string }>) => void;
  /** The start handshake: this client has the game's first state. */
  'game.ready': (payload: ReadyPayload, ack: Ack) => void;
  'game.exchange': (payload: ExchangePayload, ack: Ack<{ readonly version: number }>) => void;
  'game.turn': (payload: TurnPayload, ack: Ack<{ readonly version: number }>) => void;
  'game.resign': (payload: ResignPayload, ack: Ack<{ readonly version: number }>) => void;
  'game.rematch': (payload: RematchPayload, ack: Ack) => void;
  /** Leave a finished game's result screen. */
  'game.leave': (payload: GameRefPayload, ack: Ack) => void;
  /** Ask for the full view and history again. */
  'game.sync': (payload: GameRefPayload, ack: Ack<{ readonly update: GameUpdate }>) => void;
}

export interface ServerToClientEvents {
  /** A game was created for this player; its first game.update follows. */
  'lobby.matched': (payload: {
    readonly gameId: string;
    readonly seat: WireSeat;
    readonly opponent: string;
    readonly vsAI: boolean;
  }) => void;
  /** Alone in the queue for 30 s: the client may offer a game against the AI. */
  'lobby.aiOffer': (payload: { readonly waitedMs: number }) => void;
  /** The matched opponent never confirmed the start; this player is back at the queue's front. */
  'lobby.requeued': (payload: { readonly since: number }) => void;
  /** This player's private code expired unused. */
  'lobby.private.expired': (payload: { readonly code: string }) => void;
  'game.update': (payload: GameUpdate) => void;
  'game.presence': (payload: PresenceUpdate) => void;
  /**
   * The game is gone without a result: it never started (the start handshake timed out), or a
   * server error broke it beyond repair.
   */
  'game.cancelled': (payload: {
    readonly gameId: string;
    readonly reason: 'start-timeout' | 'server-error';
  }) => void;
  /** The opponent asked for (or declined) a rematch. */
  'game.rematch': (payload: {
    readonly gameId: string;
    readonly seat: WireSeat;
    readonly accept: boolean;
  }) => void;
  'server.notice': (payload: { readonly kind: NoticeKind; readonly message: string }) => void;
}

/** Names of the client events, in the order the server registers them. */
export const CLIENT_EVENTS = [
  'session.hello',
  'lobby.quick.join',
  'lobby.quick.leave',
  'lobby.private.create',
  'lobby.private.cancel',
  'lobby.private.join',
  'lobby.ai.start',
  'game.ready',
  'game.exchange',
  'game.turn',
  'game.resign',
  'game.rematch',
  'game.leave',
  'game.sync',
] as const satisfies readonly (keyof ClientToServerEvents)[];

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
