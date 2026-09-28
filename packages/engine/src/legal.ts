import { ACTION_FACE, FACE_COUNT, faceOf, SUITS, type CardId } from './cards.js';
import { bidWindow, latestBid, mod100, rowSuits, type Shift } from './rules.js';
import type { Column, GameState } from './state.js';

export interface ActionPlay {
  readonly card: CardId;
  readonly column: Column;
}

/** The cards of a bid, without the card taken from the table afterwards. */
export interface BidChoice {
  readonly tens: CardId;
  readonly units: CardId;
  readonly action?: ActionPlay;
}

export interface ExchangeChoice {
  readonly give: CardId;
  readonly take: CardId;
}

/** For each face, the lowest-numbered card of that face in `cards`, or -1. */
function faceIndex(cards: readonly CardId[]): Int16Array {
  const index = new Int16Array(FACE_COUNT).fill(-1);
  for (const id of cards) {
    const face = faceOf(id);
    const current = index[face] ?? -1;
    if (current < 0 || id < current) index[face] = id;
  }
  return index;
}

interface ActionOption {
  readonly shift: Shift;
  readonly action: ActionPlay | undefined;
  readonly fromTable: boolean;
}

function makeBid(tens: CardId, units: CardId, action: ActionPlay | undefined): BidChoice {
  return action ? { tens, units, action } : { tens, units };
}

/**
 * Visits every legal bid of the player to move, one per combination of faces: two copies of the
 * same face give the same bid, so only the lowest id is used. On the first bid, a face held both
 * in hand and on the table gives two different bids. Return true from `visit` to stop early.
 */
export function forEachLegalBid(state: GameState, visit: (bid: BidChoice) => boolean | void): void {
  if (state.result !== null || (state.phase !== 'firstBid' && state.phase !== 'bid')) return;
  const first = state.phase === 'firstBid';
  const hand = faceIndex(state.hands[state.toMove]);
  const table = first ? faceIndex(state.table) : null;
  const latest = latestBid(state);
  const [oldA, oldB] = rowSuits(latest);

  const options: ActionOption[] = [{ shift: 0, action: undefined, fromTable: false }];
  const handAction = hand[ACTION_FACE] ?? -1;
  if (handAction >= 0) {
    options.push(
      { shift: 10, action: { card: handAction, column: 1 }, fromTable: false },
      { shift: -10, action: { card: handAction, column: 4 }, fromTable: false },
    );
  }
  const tableAction = table ? (table[ACTION_FACE] ?? -1) : -1;
  if (tableAction >= 0) {
    options.push(
      { shift: 10, action: { card: tableAction, column: 1 }, fromTable: true },
      { shift: -10, action: { card: tableAction, column: 4 }, fromTable: true },
    );
  }

  for (const option of options) {
    const { reference } = bidWindow(latest, option.shift);
    for (let step = 1; step <= 10; step++) {
      const value = mod100(reference + step);
      const tensRank = Math.floor(value / 10);
      const unitsRank = value % 10;
      for (const tensSuit of SUITS) {
        for (const unitsSuit of SUITS) {
          if (tensSuit === unitsSuit) continue;
          const tensOld = tensSuit === oldA || tensSuit === oldB;
          const unitsOld = unitsSuit === oldA || unitsSuit === oldB;
          if (tensOld && unitsOld) continue;
          const tensFace = tensSuit * 10 + tensRank;
          const unitsFace = unitsSuit * 10 + unitsRank;
          const tensInHand = hand[tensFace] ?? -1;
          const unitsInHand = hand[unitsFace] ?? -1;
          if (!table || option.fromTable) {
            // Later bids, or a first bid whose table card is the action card: digits from hand.
            if (tensInHand >= 0 && unitsInHand >= 0) {
              if (visit(makeBid(tensInHand, unitsInHand, option.action)) === true) return;
            }
            continue;
          }
          // First bid without a table action card: exactly one digit comes from the table.
          const tensOnTable = table[tensFace] ?? -1;
          const unitsOnTable = table[unitsFace] ?? -1;
          if (tensOnTable >= 0 && unitsInHand >= 0) {
            if (visit(makeBid(tensOnTable, unitsInHand, option.action)) === true) return;
          }
          if (tensInHand >= 0 && unitsOnTable >= 0) {
            if (visit(makeBid(tensInHand, unitsOnTable, option.action)) === true) return;
          }
        }
      }
    }
  }
}

export function legalBids(state: GameState): BidChoice[] {
  const bids: BidChoice[] = [];
  forEachLegalBid(state, (bid) => {
    bids.push(bid);
  });
  return bids;
}

export function hasLegalBid(state: GameState): boolean {
  let found = false;
  forEachLegalBid(state, () => {
    found = true;
    return true;
  });
  return found;
}

export function bidCards(bid: BidChoice): CardId[] {
  return bid.action ? [bid.tens, bid.units, bid.action.card] : [bid.tens, bid.units];
}

/** Table cards left once the bid's own table card (first bid only) has been used. */
export function tableAfterBid(state: GameState, bid: BidChoice): CardId[] {
  const used = new Set(bidCards(bid));
  return state.table.filter((id) => !used.has(id));
}

function distinctByFace(cards: readonly CardId[]): CardId[] {
  const seen = new Set<number>();
  const result: CardId[] = [];
  for (const id of cards) {
    const face = faceOf(id);
    if (!seen.has(face)) {
      seen.add(face);
      result.push(id);
    }
  }
  return result;
}

/** Cards the bidder may take after the bid; empty when the table is empty (no take). */
export function takeOptions(state: GameState, bid: BidChoice, distinctFaces = true): CardId[] {
  const table = tableAfterBid(state, bid);
  return distinctFaces ? distinctByFace(table) : table;
}

/** Every exchange P2 may make (one per pair of faces); passing is always allowed too. */
export function exchangeOptions(state: GameState, distinctFaces = true): ExchangeChoice[] {
  if (state.result !== null || state.phase !== 'exchange') return [];
  const hand = state.hands[state.toMove];
  const gives = distinctFaces ? distinctByFace(hand) : [...hand];
  const takes = distinctFaces ? distinctByFace(state.table) : [...state.table];
  const options: ExchangeChoice[] = [];
  for (const give of gives) for (const take of takes) options.push({ give, take });
  return options;
}
