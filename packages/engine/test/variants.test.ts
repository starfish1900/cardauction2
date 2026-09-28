import { describe, expect, it } from 'vitest';
import {
  applyMove,
  findViolations,
  legalBids,
  newGame,
  playRandomGame,
  randomMove,
  seededRng,
  STANDARD_RULES,
  stockSize,
  suitOf,
  validateMove,
  viewFor,
  type RuleSet,
} from '../src/index.js';
import { card, position } from './helpers.js';

const variant = (changes: Partial<RuleSet>): RuleSet => ({ ...STANDARD_RULES, ...changes });

describe('rule variants (for experiments; real games use the standard rules)', () => {
  it('leave real games untouched: no rules field, standard counts', () => {
    const state = newGame(seededRng(1));
    expect(state.rules).toBeUndefined();
    expect(state.phase).toBe('exchange');
    expect(viewFor(state, 0).rules).toBeUndefined();
  });

  it('deal other hand and table sizes, the rest face down', () => {
    const rules = variant({ handSize: 10, tableSize: 30 });
    const state = newGame(seededRng(2), rules);
    expect(state.hands[0]).toHaveLength(10);
    expect(state.hands[1]).toHaveLength(10);
    expect(state.table).toHaveLength(30);
    expect(state.stock).toHaveLength(stockSize(rules));
    expect(findViolations(state)).toEqual([]);
    expect(viewFor(state, 1).rules).toEqual(rules);
  });

  it('refuse a deal that does not fit in the deck', () => {
    expect(() => newGame(seededRng(3), variant({ handSize: 50, tableSize: 30 }))).toThrow(
      RangeError,
    );
  });

  it('without the exchange, P1 opens and a pass is not a move', () => {
    const state = newGame(seededRng(4), variant({ exchange: false }));
    expect(state.toMove).toBe(0);
    expect(['firstBid', 'over']).toContain(state.phase);
    if (state.phase === 'firstBid') {
      expect(validateMove(state, 0, { type: 'pass' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    }
  });

  it('without the first-bid table card, the first bid is made from the hand', () => {
    const rules = variant({ firstBidTableCard: false });
    const state = {
      ...position({ phase: 'firstBid', toMove: 0, p1: '6S 3* 7C', p2: '8H', table: '6D 4C' }),
      rules,
    };
    const hand = new Set(state.hands[0]);
    const bids = legalBids(state);
    expect(bids.length).toBeGreaterThan(0);
    for (const bid of bids) {
      expect(hand.has(bid.tens) && hand.has(bid.units)).toBe(true);
    }
    const fromTable = {
      type: 'bid' as const,
      tens: card(state.table, '6D'),
      units: card(state.hands[0], '3*'),
      take: card(state.table, '4C'),
    };
    expect(validateMove(state, 0, fromTable)).toEqual({
      ok: false,
      error: 'TABLE_CARD_NOT_ALLOWED',
    });
  });

  it('with distinct suits, a bid of one suit is not legal', () => {
    // After 58 (♥ ♠), 6★ 3★ would be legal today but not under the old rule.
    const rules = variant({ distinctSuits: true });
    const state = { ...position({ toMove: 0, p1: '6* 3* 6D', table: '4C' }), rules };
    const bid = {
      type: 'bid' as const,
      tens: card(state.hands[0], '6*'),
      units: card(state.hands[0], '3*'),
      take: card(state.table, '4C'),
    };
    expect(validateMove(state, 0, bid)).toEqual({ ok: false, error: 'SAME_SUIT' });
    expect(validateMove({ ...state, rules: STANDARD_RULES }, 0, bid)).toEqual({ ok: true });
    for (const legal of legalBids(state)) {
      expect(suitOf(legal.tens)).not.toBe(suitOf(legal.units));
    }
  });

  it('keep every invariant through random games under each variant', () => {
    const variants = [
      variant({ exchange: false }),
      variant({ firstBidTableCard: false }),
      variant({ distinctSuits: true }),
      variant({ handSize: 10, tableSize: 15 }),
      variant({ handSize: 16, tableSize: 40 }),
      variant({ tableSize: 0 }),
    ];
    for (const rules of variants) {
      for (let seed = 1; seed <= 150; seed++) {
        playRandomGame(
          seededRng(seed),
          (_before, _move, after) => {
            const problems = findViolations(after);
            if (problems.length > 0) {
              throw new Error(`${JSON.stringify(rules)} seed ${seed}: ${problems.join('; ')}`);
            }
          },
          rules,
        );
      }
    }
  });

  it('carry the rules through every move', () => {
    const rules = variant({ distinctSuits: true });
    let state = newGame(seededRng(9), rules);
    const rng = seededRng(10);
    let moves = 0;
    while (state.result === null) {
      state = applyMove(state, state.toMove, randomMove(state, rng));
      expect(state.rules).toEqual(rules);
      moves += 1;
    }
    expect(moves).toBeGreaterThan(0);
  });
});
