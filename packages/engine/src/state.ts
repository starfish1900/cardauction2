import type { CardId } from './cards.js';

/** Seat 0 is P1, seat 1 is P2. */
export type Seat = 0 | 1;
export const P1: Seat = 0;
export const P2: Seat = 1;

export function otherSeat(seat: Seat): Seat {
  return seat === P1 ? P2 : P1;
}

export function seatName(seat: Seat): 'P1' | 'P2' {
  return seat === P1 ? 'P1' : 'P2';
}

/**
 * - exchange: P2 may swap one hand card with one table card, or pass (once per game);
 * - firstBid: P1's opening bid, which must use exactly one table card;
 * - bid: ordinary bids from hand, alternating;
 * - over: the game has a result.
 */
export type Phase = 'exchange' | 'firstBid' | 'bid' | 'over';

/** Action-card column: 1 raises the latest bid by 10, 4 lowers it by 10. */
export type Column = 1 | 4;

/** An action card placed next to a bid row by the following bidder. */
export interface Modifier {
  readonly card: CardId;
  readonly column: Column;
  readonly by: Seat;
}

export interface BidRow {
  /** null for the starting number. */
  readonly by: Seat | null;
  readonly tens: CardId;
  readonly units: CardId;
  /** Value as placed, 0–99, before any action card set next to it later. */
  readonly value: number;
  readonly modifier?: Modifier;
}

export type EndReason =
  /** The player to move had no legal bid; the last bidder wins. */
  | 'noLegalBid'
  | 'resign'
  | 'timeout'
  /** A disconnected player did not return within the grace period. */
  | 'forfeit'
  /** Both players were away when a deadline passed: no winner. */
  | 'abandoned'
  /** Ended by the server (for example a restart that lost the game): no winner. */
  | 'aborted';

export interface GameResult {
  readonly winner: Seat | null;
  readonly reason: EndReason;
}

export interface GameState {
  readonly phase: Phase;
  readonly toMove: Seat;
  readonly hands: readonly [readonly CardId[], readonly CardId[]];
  /** Face-up table cards, visible to both players. */
  readonly table: readonly CardId[];
  /** The face-down cards left after setup (67); they never enter play. */
  readonly stock: readonly CardId[];
  /** Row 0 is the starting number. */
  readonly bids: readonly BidRow[];
  /** Cards in each hand that the other player has seen (taken from the table, not yet played). */
  readonly known: readonly [readonly CardId[], readonly CardId[]];
  readonly bidCount: readonly [number, number];
  readonly moveCount: number;
  readonly result: GameResult | null;
}
