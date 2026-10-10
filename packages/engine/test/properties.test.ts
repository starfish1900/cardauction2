import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACTION_CARDS,
  cardsInView,
  DECK_SIZE,
  findViolations,
  HAND_SIZE,
  isDigit,
  newGame,
  otherSeat,
  playRandomGame,
  seededRng,
  STOCK_SIZE,
  TABLE_SIZE,
  viewFor,
  type CardId,
  type GameState,
  type Seat,
} from '../src/index.js';

/** Cards `seat` must not see: the opponent's unseen cards and the stock. */
function hiddenFrom(state: GameState, seat: Seat): Set<CardId> {
  const opponent = otherSeat(seat);
  const hidden = new Set<CardId>(state.stock);
  if (state.result === null) {
    for (const id of state.hands[opponent]) {
      if (!state.known[opponent].includes(id)) hidden.add(id);
    }
  }
  return hidden;
}

describe('random games (property-based)', () => {
  it('keep every invariant after every move, and end within 25 bids', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        let moves = 0;
        const final = playRandomGame(seededRng(seed), (_before, _move, after) => {
          moves += 1;
          expect(findViolations(after)).toEqual([]);
        });
        const bids = final.bidCount[0] + final.bidCount[1];
        expect(bids).toBeLessThanOrEqual(25);
        expect(final.bidCount[0]).toBeLessThanOrEqual(13);
        expect(final.bidCount[1]).toBeLessThanOrEqual(12);
        expect(moves).toBe(bids + 1); // the exchange (or pass) plus the bids
        expect(final.result?.reason).toBe('noLegalBid');
        // The last player to make a successful bid wins; P2 wins if P1 never could open.
        const lastBid = final.bids[final.bids.length - 1];
        expect(final.result?.winner).toBe(lastBid?.by ?? 1);
      }),
      { numRuns: 400 },
    );
  });

  it('never show a player hidden cards', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        playRandomGame(seededRng(seed), (before, _move, after) => {
          for (const state of [before, after]) {
            for (const seat of [0, 1] as const) {
              const hidden = hiddenFrom(state, seat);
              const leaked = cardsInView(viewFor(state, seat)).filter((id) => hidden.has(id));
              expect(leaked).toEqual([]);
            }
          }
        });
      }),
      { numRuns: 150 },
    );
  });

  it('deal 13 + 13 cards, 25 table cards, 67 face-down cards and a two-digit start', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const state = newGame(seededRng(seed));
        expect(state.hands[0]).toHaveLength(13);
        expect(state.hands[1]).toHaveLength(13);
        expect(state.table).toHaveLength(25);
        expect(state.stock).toHaveLength(STOCK_SIZE);
        expect(state.bids).toHaveLength(1);
        expect(findViolations(state)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('deal each hand and the table their share of the action cards', () => {
    // Action cards turned over before the starting number's second digit go back into the deck.
    // Until October 2026 they stayed on top and went to P1: 2.5 action cards on average, P2 2.2.
    const deals = 10_000;
    const share = (cards: number): number => (cards * ACTION_CARDS) / (DECK_SIZE - 2);
    const totals = { p1: 0, p2: 0, table: 0 };
    const actions = (cards: readonly CardId[]): number => cards.filter((id) => !isDigit(id)).length;
    for (let seed = 0; seed < deals; seed++) {
      const state = newGame(seededRng(seed));
      totals.p1 += actions(state.hands[0]);
      totals.p2 += actions(state.hands[1]);
      totals.table += actions(state.table);
    }
    expect(totals.p1 / deals).toBeCloseTo(share(HAND_SIZE), 1); // 2.20
    expect(totals.p2 / deals).toBeCloseTo(share(HAND_SIZE), 1);
    expect(totals.table / deals).toBeCloseTo(share(TABLE_SIZE), 1); // 4.24
  });

  it('replay identically from the same seed', () => {
    const a = playRandomGame(seededRng(123456));
    const b = playRandomGame(seededRng(123456));
    expect(a).toEqual(b);
  });
});
