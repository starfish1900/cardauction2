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

/** For each face in a pile of cards: the lowest-numbered copy and the next one (-1 when absent). */
interface FaceIndex {
  readonly first: Int16Array;
  readonly second: Int16Array;
}

function faceIndex(cards: readonly CardId[]): FaceIndex {
  const first = new Int16Array(FACE_COUNT).fill(-1);
  const second = new Int16Array(FACE_COUNT).fill(-1);
  for (const id of cards) {
    const face = faceOf(id);
    const lowest = first[face] ?? -1;
    if (lowest < 0 || id < lowest) {
      second[face] = lowest;
      first[face] = id;
    } else {
      const next = second[face] ?? -1;
      if (next < 0 || id < next) second[face] = id;
    }
  }
  return { first, second };
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
 * Visits every legal bid of the player to move, once per combination of faces. Copies of a face
 * are interchangeable, so the lowest id is used, plus the second copy when both digits are the
 * same card (5♥ 5♥ = 55). On the first bid, a face held both in hand and on the table gives two
 * different bids, since either copy can be the table card; for a pair made of one copy from each,
 * which copy is the tens does not matter, so it is visited once. Return true from `visit` to stop.
 */
export function forEachLegalBid(state: GameState, visit: (bid: BidChoice) => boolean | void): void {
  if (state.result !== null || (state.phase !== 'firstBid' && state.phase !== 'bid')) return;
  const first = state.phase === 'firstBid';
  const hand = faceIndex(state.hands[state.toMove]);
  const table = first ? faceIndex(state.table) : null;
  const latest = latestBid(state);
  const [oldA, oldB] = rowSuits(latest);

  const options: ActionOption[] = [{ shift: 0, action: undefined, fromTable: false }];
  const handAction = hand.first[ACTION_FACE] ?? -1;
  if (handAction >= 0) {
    options.push(
      { shift: 10, action: { card: handAction, column: 1 }, fromTable: false },
      { shift: -10, action: { card: handAction, column: 4 }, fromTable: false },
    );
  }
  const tableAction = table ? (table.first[ACTION_FACE] ?? -1) : -1;
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
          // Rule 6.4: the bid needs a suit the latest bid does not have. Both may share a suit.
          const tensOld = tensSuit === oldA || tensSuit === oldB;
          const unitsOld = unitsSuit === oldA || unitsSuit === oldB;
          if (tensOld && unitsOld) continue;
          const tensFace = tensSuit * 10 + tensRank;
          const unitsFace = unitsSuit * 10 + unitsRank;
          const pair = tensFace === unitsFace;
          if (!table || option.fromTable) {
            // Later bids, or a first bid whose table card is the action card: digits from hand.
            const tens = hand.first[tensFace] ?? -1;
            const units = (pair ? hand.second[unitsFace] : hand.first[unitsFace]) ?? -1;
            if (tens >= 0 && units >= 0) {
              if (visit(makeBid(tens, units, option.action)) === true) return;
            }
            continue;
          }
          // First bid without a table action card: exactly one digit comes from the table.
          const tensOnTable = table.first[tensFace] ?? -1;
          const unitsInHand = hand.first[unitsFace] ?? -1;
          if (tensOnTable >= 0 && unitsInHand >= 0) {
            if (visit(makeBid(tensOnTable, unitsInHand, option.action)) === true) return;
          }
          // For a pair (one copy on the table, one in hand) the swapped version is the same bid.
          if (pair) continue;
          const tensInHand = hand.first[tensFace] ?? -1;
          const unitsOnTable = table.first[unitsFace] ?? -1;
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
