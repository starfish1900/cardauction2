import { allCardIds, DECK_SIZE, isDigit, type CardId } from './cards.js';
import { hasLegalBid } from './legal.js';
import { endGame } from './moves.js';
import { shuffleInPlace, type Rng } from './rng.js';
import { bidValue } from './rules.js';
import { otherSeat, P1, P2, STANDARD_RULES, type GameState, type RuleSet } from './state.js';

export const HAND_SIZE = STANDARD_RULES.handSize;
export const TABLE_SIZE = STANDARD_RULES.tableSize;
export const STOCK_SIZE = stockSize(STANDARD_RULES); // 67

/** Face-down cards left after the deal. */
export function stockSize(rules: RuleSet): number {
  return DECK_SIZE - 2 - 2 * rules.handSize - rules.tableSize;
}

/**
 * Deals a new game from a freshly shuffled double deck. Use cryptoRng() for real games; `rules`
 * is for experiments only (real games leave it out).
 */
export function newGame(rng: Rng, rules?: RuleSet): GameState {
  return gameFromDeck(shuffleInPlace(allCardIds(), rng), rules);
}

/**
 * Deals a game from a given deck order (top of the deck first):
 *
 * 1. the first two digit cards form the starting number, tens first (rule 5.2);
 * 2. from the remaining cards, 13 go to P1, 13 to P2 and 25 face-up to the table (rules 5.3, 5.4);
 * 3. the other 67 stay face-down and never enter play.
 *
 * P2 moves first, with the optional exchange (rule 6.1). Rule variants change the counts, and
 * without the exchange P1 opens.
 */
export function gameFromDeck(order: readonly CardId[], rules?: RuleSet): GameState {
  if (order.length !== DECK_SIZE || new Set(order).size !== DECK_SIZE) {
    throw new Error('a deck order must contain each of the 120 cards exactly once');
  }
  const r = rules ?? STANDARD_RULES;
  if (
    !Number.isInteger(r.handSize) ||
    !Number.isInteger(r.tableSize) ||
    r.handSize < 1 ||
    r.tableSize < 0 ||
    stockSize(r) < 0
  ) {
    throw new RangeError(`cannot deal ${r.handSize} cards each and ${r.tableSize} on the table`);
  }
  const starting: CardId[] = [];
  const rest: CardId[] = [];
  for (const id of order) {
    if (starting.length < 2 && isDigit(id)) starting.push(id);
    else rest.push(id);
  }
  const [tens, units] = starting as [CardId, CardId];
  let next = 0;
  const deal = (count: number): CardId[] => {
    const cards = rest.slice(next, next + count);
    next += count;
    return cards;
  };
  const p1 = deal(r.handSize);
  const p2 = deal(r.handSize);
  const table = deal(r.tableSize);
  const stock = rest.slice(next);
  const dealt: GameState = {
    ...(rules ? { rules } : {}),
    phase: r.exchange ? 'exchange' : 'firstBid',
    toMove: r.exchange ? P2 : P1,
    hands: [p1, p2],
    table,
    stock,
    bids: [{ by: null, tens, units, value: bidValue(tens, units) }],
    known: [[], []],
    bidCount: [0, 0],
    moveCount: 0,
    result: null,
  };
  // Without the exchange the game opens on P1's first bid, which may already be impossible.
  if (!r.exchange && !hasLegalBid(dealt)) {
    return endGame(dealt, { winner: otherSeat(P1), reason: 'noLegalBid' });
  }
  return dealt;
}
