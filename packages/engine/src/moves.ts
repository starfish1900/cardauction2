import { isAction, isCardId, isDigit, type CardId } from './cards.js';
import { hasLegalBid, type ActionPlay } from './legal.js';
import { bidValue, columnShift, hasNewColor, inWindow, latestBid, mod100 } from './rules.js';
import { otherSeat, P1, type BidRow, type GameResult, type GameState, type Seat } from './state.js';

export type Move =
  /** P2's opening choice to keep their hand. */
  | { readonly type: 'pass' }
  /** P2 swaps one hand card with one table card (rule 6.1). */
  | { readonly type: 'exchange'; readonly give: CardId; readonly take: CardId }
  /**
   * A bid: two digit cards, an optional action card, then one card taken from the table.
   * `take` is required whenever cards remain on the table after the bid, and forbidden otherwise.
   */
  | {
      readonly type: 'bid';
      readonly tens: CardId;
      readonly units: CardId;
      readonly action?: ActionPlay;
      readonly take?: CardId;
    };

export type MoveError =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'NOT_A_CARD'
  | 'DUPLICATE_CARD'
  | 'NOT_A_DIGIT'
  | 'NOT_AN_ACTION'
  | 'BAD_COLUMN'
  /** The card is not in the mover's hand. Never says where the card actually is. */
  | 'CARD_NOT_IN_HAND'
  | 'CARD_NOT_ON_TABLE'
  /** P1's first bid must use exactly one table card (rule 6.2). */
  | 'TABLE_CARD_REQUIRED'
  | 'ONE_TABLE_CARD_ONLY'
  /** Only the first bid may use a table card (rules 6.2, 6.3). */
  | 'TABLE_CARD_NOT_ALLOWED'
  /** Neither digit card brings a suit absent from the latest bid (rule 6.4). */
  | 'NO_NEW_COLOR'
  /** Not 1 to 10 above the (possibly modified) latest bid (rules 7, 8, 9). */
  | 'OUT_OF_RANGE'
  | 'TAKE_REQUIRED'
  | 'TAKE_NOT_ALLOWED'
  | 'TAKE_NOT_ON_TABLE';

export type Validation = { readonly ok: true } | { readonly ok: false; readonly error: MoveError };

export class MoveRejectedError extends Error {
  constructor(readonly code: MoveError) {
    super(`move rejected: ${code}`);
    this.name = 'MoveRejectedError';
  }
}

const OK: Validation = { ok: true };
const fail = (error: MoveError): Validation => ({ ok: false, error });

export function validateMove(state: GameState, seat: Seat, move: Move): Validation {
  if (state.result !== null || state.phase === 'over') return fail('GAME_OVER');
  if (seat !== state.toMove) return fail('NOT_YOUR_TURN');
  switch (move.type) {
    case 'pass':
      return state.phase === 'exchange' ? OK : fail('WRONG_PHASE');
    case 'exchange':
      return validateExchange(state, seat, move.give, move.take);
    case 'bid':
      return validateBid(state, seat, move);
  }
}

function validateExchange(state: GameState, seat: Seat, give: CardId, take: CardId): Validation {
  if (state.phase !== 'exchange') return fail('WRONG_PHASE');
  if (!isCardId(give) || !isCardId(take)) return fail('NOT_A_CARD');
  if (!state.hands[seat].includes(give)) return fail('CARD_NOT_IN_HAND');
  if (!state.table.includes(take)) return fail('CARD_NOT_ON_TABLE');
  return OK;
}

function validateBid(
  state: GameState,
  seat: Seat,
  move: Extract<Move, { type: 'bid' }>,
): Validation {
  if (state.phase !== 'firstBid' && state.phase !== 'bid') return fail('WRONG_PHASE');
  const { tens, units, action, take } = move;
  const used = action ? [tens, units, action.card] : [tens, units];
  if (!used.every(isCardId) || (take !== undefined && !isCardId(take))) return fail('NOT_A_CARD');
  if (new Set(used).size !== used.length) return fail('DUPLICATE_CARD');
  if (!isDigit(tens) || !isDigit(units)) return fail('NOT_A_DIGIT');
  if (action) {
    if (!isAction(action.card)) return fail('NOT_AN_ACTION');
    if (action.column !== 1 && action.column !== 4) return fail('BAD_COLUMN');
  }

  const hand = state.hands[seat];
  const fromTable = used.filter((id) => !hand.includes(id));
  if (state.phase === 'firstBid') {
    if (fromTable.length === 0) return fail('TABLE_CARD_REQUIRED');
    if (fromTable.length > 1) {
      const onTable = fromTable.filter((id) => state.table.includes(id)).length;
      return fail(onTable === fromTable.length ? 'ONE_TABLE_CARD_ONLY' : 'CARD_NOT_IN_HAND');
    }
    if (!state.table.includes(fromTable[0] as CardId)) return fail('CARD_NOT_IN_HAND');
  } else if (fromTable.length > 0) {
    const onTable = fromTable.some((id) => state.table.includes(id));
    return fail(onTable ? 'TABLE_CARD_NOT_ALLOWED' : 'CARD_NOT_IN_HAND');
  }

  const latest = latestBid(state);
  if (!hasNewColor(latest, tens, units)) return fail('NO_NEW_COLOR');
  const reference = mod100(latest.value + (action ? columnShift(action.column) : 0));
  if (!inWindow(reference, bidValue(tens, units))) return fail('OUT_OF_RANGE');

  const remaining = state.table.filter((id) => !used.includes(id));
  if (remaining.length > 0) {
    if (take === undefined) return fail('TAKE_REQUIRED');
    if (!remaining.includes(take)) return fail('TAKE_NOT_ON_TABLE');
  } else if (take !== undefined) {
    return fail('TAKE_NOT_ALLOWED');
  }
  return OK;
}

/** Validates and applies a move, returning the next state. Throws MoveRejectedError if illegal. */
export function applyMove(state: GameState, seat: Seat, move: Move): GameState {
  const check = validateMove(state, seat, move);
  if (!check.ok) throw new MoveRejectedError(check.error);
  switch (move.type) {
    case 'pass':
      return openFirstBid(state, state.hands, state.table, state.known);
    case 'exchange': {
      const hand = [...without(state.hands[seat], [move.give]), move.take];
      const table = [...without(state.table, [move.take]), move.give];
      const known = withSeat(state.known, seat, [
        ...without(state.known[seat], [move.give]),
        move.take,
      ]);
      return openFirstBid(state, withSeat(state.hands, seat, hand), table, known);
    }
    case 'bid':
      return applyBid(state, seat, move);
  }
}

function openFirstBid(
  state: GameState,
  hands: GameState['hands'],
  table: readonly CardId[],
  known: GameState['known'],
): GameState {
  const next: GameState = {
    ...state,
    phase: 'firstBid',
    toMove: P1,
    hands,
    table,
    known,
    moveCount: state.moveCount + 1,
  };
  // Rule 11.1 applied to the opening: if P1 cannot make a first bid, P2 wins.
  return hasLegalBid(next) ? next : endGame(next, { winner: otherSeat(P1), reason: 'noLegalBid' });
}

function applyBid(state: GameState, seat: Seat, move: Extract<Move, { type: 'bid' }>): GameState {
  const { tens, units, action, take } = move;
  const used = action ? [tens, units, action.card] : [tens, units];
  let hand = without(state.hands[seat], used);
  let table = without(state.table, used);
  let known = without(state.known[seat], used);
  if (take !== undefined) {
    hand = [...hand, take];
    table = without(table, [take]);
    known = [...known, take];
  }

  const bids = [...state.bids];
  if (action) {
    const index = bids.length - 1;
    const last = bids[index] as BidRow;
    bids[index] = { ...last, modifier: { card: action.card, column: action.column, by: seat } };
  }
  bids.push({ by: seat, tens, units, value: bidValue(tens, units) });

  const bidCount: [number, number] = [state.bidCount[0], state.bidCount[1]];
  bidCount[seat] += 1;

  const next: GameState = {
    ...state,
    phase: 'bid',
    toMove: otherSeat(seat),
    hands: withSeat(state.hands, seat, hand),
    table,
    known: withSeat(state.known, seat, known),
    bids,
    bidCount,
    moveCount: state.moveCount + 1,
  };
  // Rule 11.1: a player who cannot continue the auction loses; the last bidder wins.
  return hasLegalBid(next) ? next : endGame(next, { winner: seat, reason: 'noLegalBid' });
}

/** Ends the game with a result decided outside the rules (resignation, timeout, forfeit...). */
export function endGame(state: GameState, result: GameResult): GameState {
  return { ...state, phase: 'over', result };
}

function without(cards: readonly CardId[], remove: readonly CardId[]): CardId[] {
  return cards.filter((id) => !remove.includes(id));
}

function withSeat<T>(pair: readonly [T, T], seat: Seat, value: T): [T, T] {
  return seat === 0 ? [value, pair[1]] : [pair[0], value];
}
