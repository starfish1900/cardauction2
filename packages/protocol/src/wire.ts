import type { CardId, Column, EndReason, Phase } from '@cardauction/engine';
import type { AiLevel } from './constants.js';

/**
 * What travels over the wire. Cards are bare ids (an id encodes its face: see the engine's
 * suitOf, rankOf and isAction), so a whole view is about 1 KB and the server can send complete
 * views instead of diffs.
 */
export type WireSeat = 'P1' | 'P2';

/**
 * - starting: dealt, waiting for both players to confirm (the start handshake); no clock yet;
 * - playing: the clock runs;
 * - over: the game has a result; it stays available for the result screen and a rematch.
 */
export type GameStatus = 'starting' | 'playing' | 'over';

export interface WireBidRow {
  /** 'start' for the starting number (row 0). */
  readonly by: 'start' | WireSeat;
  readonly tens: CardId;
  readonly units: CardId;
  /** The number as placed, 0–99. */
  readonly value: number;
  /** An action card the next bidder placed beside this row, and the value it produced. */
  readonly action?: {
    readonly card: CardId;
    readonly column: Column;
    readonly newValue: number;
    readonly by: WireSeat;
  };
}

export interface WireResult {
  /** null when nobody won: abandoned (both players away) or aborted by the server. */
  readonly winner: WireSeat | null;
  readonly reason: EndReason;
  /** Both hands, revealed at the end. */
  readonly hands: { readonly P1: readonly CardId[]; readonly P2: readonly CardId[] };
}

export interface WireView {
  readonly gameId: string;
  /** Rises with every change to the game (not with presence changes). */
  readonly version: number;
  readonly status: GameStatus;
  readonly phase: Phase;
  readonly toMove: WireSeat;
  /** Server epoch ms by which the player to move must act; null when no clock runs. */
  readonly turnDeadline: number | null;
  /** Server epoch ms when the view was built, to correct clock skew. */
  readonly serverNow: number;
  readonly you: {
    readonly seat: WireSeat;
    readonly nickname: string;
    /** Sorted: action cards, then rank, then suit. */
    readonly hand: readonly CardId[];
  };
  readonly opponent: {
    readonly seat: WireSeat;
    readonly nickname: string;
    readonly isAI: boolean;
    readonly level: AiLevel | null;
    readonly handCount: number;
    /** Cards the opponent took from the table and has not played yet. */
    readonly known: readonly CardId[];
    readonly connected: boolean;
    /** When the opponent forfeits unless they come back; null while connected. */
    readonly graceDeadline: number | null;
  };
  /** Face-up table cards, sorted like the hand. */
  readonly table: readonly CardId[];
  /** The face-down cards that never enter play (always 67). */
  readonly stockCount: number;
  /** Row 0 is the starting number. */
  readonly bids: readonly WireBidRow[];
  readonly result: WireResult | null;
  /** Open while a rematch can be requested after the game. */
  readonly rematch: {
    readonly deadline: number;
    readonly you: boolean;
    readonly opponent: boolean;
  } | null;
}

/**
 * What happened, in order, for animations and the move log. Everything here is public: in
 * CardAuction the cards of an exchange, a bid and a take are all seen by both players.
 */
export type GameEventBody =
  /** Both players confirmed the start; P2's clock for the exchange starts now. */
  | { readonly type: 'start' }
  /** P2 kept their hand (timeout: P2's clock ran out, which counts as a pass). */
  | { readonly type: 'pass'; readonly by: WireSeat; readonly timeout: boolean }
  /** P2 gave `give` to the table and took `take` from it. */
  | {
      readonly type: 'exchange';
      readonly by: WireSeat;
      readonly give: CardId;
      readonly take: CardId;
    }
  | {
      readonly type: 'bid';
      readonly by: WireSeat;
      readonly tens: CardId;
      readonly units: CardId;
      readonly value: number;
      /** An action card placed beside the previous row first. */
      readonly action?: {
        readonly card: CardId;
        readonly column: Column;
        readonly newValue: number;
      };
      /** P1's first bid: the table card used in the bid itself. */
      readonly tableCard?: CardId;
      /** The table card taken after the bid (absent once the table is empty). */
      readonly take?: CardId;
    }
  | { readonly type: 'end'; readonly winner: WireSeat | null; readonly reason: EndReason };

export type GameEvent = GameEventBody & {
  /** 1, 2, 3… within the game. */
  readonly seq: number;
  /** Server epoch ms. */
  readonly at: number;
  /** The game version this event produced. */
  readonly version: number;
};

export interface GameUpdate {
  readonly gameId: string;
  readonly version: number;
  readonly serverNow: number;
  readonly view: WireView;
  /** New events since the last update to this player; the whole history when `sync` is true. */
  readonly events: readonly GameEvent[];
  /** True on (re)connection and on request: replace local state instead of animating. */
  readonly sync: boolean;
}

export interface PresenceUpdate {
  readonly gameId: string;
  readonly seat: WireSeat;
  readonly connected: boolean;
  readonly graceDeadline: number | null;
  readonly serverNow: number;
}

/** A deleted game still answers its players for a while. */
export interface EndedGame {
  readonly gameId: string;
  readonly seat: WireSeat;
  readonly winner: WireSeat | null;
  readonly reason: EndReason;
}

export type NoticeKind = 'restarting' | 'busy' | 'update-required' | 'replaced';
