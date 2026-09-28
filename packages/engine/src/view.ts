import { sortCards, type CardId } from './cards.js';
import {
  otherSeat,
  type BidRow,
  type GameResult,
  type GameState,
  type Phase,
  type RuleSet,
  type Seat,
} from './state.js';

/**
 * What one seat is allowed to see. Built by a single function so that hidden information (the
 * opponent's unseen cards and the face-down stock) can only leak through one place, which the
 * tests check exhaustively.
 */
export interface PlayerView {
  /** Absent in real games: the standard rules. */
  readonly rules?: RuleSet;
  readonly seat: Seat;
  readonly phase: Phase;
  readonly toMove: Seat;
  readonly moveCount: number;
  /** Sorted: action cards, then rank, then suit. */
  readonly hand: readonly CardId[];
  readonly opponent: {
    readonly handCount: number;
    /** Opponent cards this seat has seen go into their hand and not yet played. */
    readonly known: readonly CardId[];
  };
  readonly table: readonly CardId[];
  readonly bids: readonly BidRow[];
  readonly bidCount: readonly [number, number];
  readonly stockCount: number;
  readonly result: GameResult | null;
  /** Both hands, revealed once the game is over. */
  readonly finalHands: readonly [readonly CardId[], readonly CardId[]] | null;
}

export function viewFor(state: GameState, seat: Seat): PlayerView {
  const opponent = otherSeat(seat);
  const over = state.result !== null;
  return {
    ...(state.rules ? { rules: state.rules } : {}),
    seat,
    phase: state.phase,
    toMove: state.toMove,
    moveCount: state.moveCount,
    hand: sortCards(state.hands[seat]),
    opponent: {
      handCount: state.hands[opponent].length,
      known: sortCards(state.known[opponent]),
    },
    table: sortCards(state.table),
    bids: state.bids,
    bidCount: state.bidCount,
    stockCount: state.stock.length,
    result: state.result,
    finalHands: over ? [sortCards(state.hands[0]), sortCards(state.hands[1])] : null,
  };
}

/** Every card id a view discloses, for leak checks. */
export function cardsInView(view: PlayerView): CardId[] {
  const ids: CardId[] = [...view.hand, ...view.opponent.known, ...view.table];
  for (const row of view.bids) {
    ids.push(row.tens, row.units);
    if (row.modifier) ids.push(row.modifier.card);
  }
  if (view.finalHands) ids.push(...view.finalHands[0], ...view.finalHands[1]);
  return ids;
}
