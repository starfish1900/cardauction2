import { rankOf, suitOf, type CardId, type Suit } from './cards.js';
import type { BidRow, Column, GameState } from './state.js';

/** Shift an action card applies to the latest bid: +10 in column 1, −10 in column 4. */
export type Shift = 0 | 10 | -10;

export function columnShift(column: Column): Shift {
  return column === 1 ? 10 : -10;
}

/** Non-negative remainder modulo 100: numbers wrap from 99 to 00. */
export function mod100(n: number): number {
  return ((n % 100) + 100) % 100;
}

export function bidValue(tens: CardId, units: CardId): number {
  return rankOf(tens) * 10 + rankOf(units);
}

/** A row's value once any action card placed next to it is taken into account. */
export function effectiveValue(row: BidRow): number {
  return row.modifier ? mod100(row.value + columnShift(row.modifier.column)) : row.value;
}

export function latestBid(state: GameState): BidRow {
  const row = state.bids[state.bids.length - 1];
  if (!row) throw new Error('a game always has a starting number');
  return row;
}

/** How far `to` is above `from` on the 00–99 cycle (0–99). */
export function increase(from: number, to: number): number {
  return mod100(to - from);
}

/** Rule 7: the new number must be 1 to 10 above the (possibly modified) latest bid. */
export function inWindow(reference: number, value: number): boolean {
  const step = increase(reference, value);
  return step >= 1 && step <= 10;
}

export interface BidWindow {
  /** The latest bid's value after the shift. */
  readonly reference: number;
  readonly from: number;
  readonly to: number;
}

export function bidWindow(latest: BidRow, shift: Shift): BidWindow {
  const reference = mod100(latest.value + shift);
  return { reference, from: mod100(reference + 1), to: mod100(reference + 10) };
}

export function rowSuits(row: BidRow): readonly [Suit, Suit] {
  return [suitOf(row.tens), suitOf(row.units)];
}

/**
 * Rule 6.4 as settled in Q&A: a new bid must contain a color (suit) that neither card of the
 * latest bid has. With two different suits on each side, the unordered suit pair must change.
 */
export function hasNewColor(latest: BidRow, tens: CardId, units: CardId): boolean {
  const [a, b] = rowSuits(latest);
  const isOld = (suit: Suit): boolean => suit === a || suit === b;
  return !isOld(suitOf(tens)) || !isOld(suitOf(units));
}
