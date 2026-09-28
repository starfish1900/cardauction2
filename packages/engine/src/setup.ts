import { allCardIds, DECK_SIZE, isDigit, type CardId } from './cards.js';
import { shuffleInPlace, type Rng } from './rng.js';
import { bidValue } from './rules.js';
import { P2, type GameState } from './state.js';

export const HAND_SIZE = 13;
export const TABLE_SIZE = 25;
export const STOCK_SIZE = DECK_SIZE - 2 - 2 * HAND_SIZE - TABLE_SIZE; // 67

/** Deals a new game from a freshly shuffled double deck. Use cryptoRng() for real games. */
export function newGame(rng: Rng): GameState {
  return gameFromDeck(shuffleInPlace(allCardIds(), rng));
}

/**
 * Deals a game from a given deck order (top of the deck first):
 *
 * 1. the first two digit cards form the starting number, tens first (rule 5.2);
 * 2. from the remaining cards, 13 go to P1, 13 to P2 and 25 face-up to the table (rules 5.3, 5.4);
 * 3. the other 67 stay face-down and never enter play.
 *
 * P2 moves first, with the optional exchange (rule 6.1).
 */
export function gameFromDeck(order: readonly CardId[]): GameState {
  if (order.length !== DECK_SIZE || new Set(order).size !== DECK_SIZE) {
    throw new Error('a deck order must contain each of the 120 cards exactly once');
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
  const p1 = deal(HAND_SIZE);
  const p2 = deal(HAND_SIZE);
  const table = deal(TABLE_SIZE);
  const stock = rest.slice(next);
  return {
    phase: 'exchange',
    toMove: P2,
    hands: [p1, p2],
    table,
    stock,
    bids: [{ by: null, tens, units, value: bidValue(tens, units) }],
    known: [[], []],
    bidCount: [0, 0],
    moveCount: 0,
    result: null,
  };
}
