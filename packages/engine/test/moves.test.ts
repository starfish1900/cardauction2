import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cardLabel,
  effectiveValue,
  endGame,
  hasLegalBid,
  legalBids,
  MoveRejectedError,
  P1,
  P2,
  validateMove,
  type GameState,
  type Move,
} from '../src/index.js';
import { card, position } from './helpers.js';

const error = (state: GameState, seat: 0 | 1, move: Move): string => {
  const result = validateMove(state, seat, move);
  return result.ok ? 'legal' : result.error;
};

describe('P2 exchange (rule 6.1)', () => {
  // Latest 5♥ 8♠ = 58; P1 can open with 6♠ from hand and 0★ from the table (60).
  const state = position({
    phase: 'exchange',
    toMove: P2,
    p1: '6S 3* 2D 4C',
    p2: '1H 9D',
    table: '7C 0*',
  });

  it('swaps one hand card with one table card, then P1 opens', () => {
    const next = applyMove(state, P2, {
      type: 'exchange',
      give: card(state.hands[1], '1H'),
      take: card(state.table, '7C'),
    });
    expect(next.phase).toBe('firstBid');
    expect(next.toMove).toBe(P1);
    expect(next.hands[1].map(cardLabel).sort()).toEqual(['7♣', '9♦']);
    expect(next.table.map(cardLabel).sort()).toEqual(['0★', '1♥']);
    expect(next.known[1].map(cardLabel)).toEqual(['7♣']);
  });

  it('may pass instead', () => {
    const next = applyMove(state, P2, { type: 'pass' });
    expect(next.phase).toBe('firstBid');
    expect(next.hands).toEqual(state.hands);
  });

  it('only happens once, only for P2', () => {
    expect(error(state, P1, { type: 'pass' })).toBe('NOT_YOUR_TURN');
    const later = applyMove(state, P2, { type: 'pass' });
    expect(error(later, P1, { type: 'pass' })).toBe('WRONG_PHASE');
  });

  it('checks where the cards are', () => {
    const give = card(state.hands[0], '6S');
    expect(error(state, P2, { type: 'exchange', give, take: card(state.table, '7C') })).toBe(
      'CARD_NOT_IN_HAND',
    );
    const own = card(state.hands[1], '1H');
    expect(error(state, P2, { type: 'exchange', give: own, take: own })).toBe('CARD_NOT_ON_TABLE');
  });

  it('gives P2 the win when P1 has no legal first bid', () => {
    const stuck = position({
      phase: 'exchange',
      toMove: P2,
      start: '5H 8S',
      p1: '0H 0S',
      p2: '1H 9D',
      table: '0D 1C',
    });
    const next = applyMove(stuck, P2, { type: 'pass' });
    expect(next.result).toEqual({ winner: P2, reason: 'noLegalBid' });
    expect(next.phase).toBe('over');
  });
});

describe('P1 first bid (rule 6.2 and the Q&A decisions)', () => {
  // Latest 5♥ 8♠ = 58. P2 can answer 63 with 6♥ 5♣ (65).
  const state = position({
    phase: 'firstBid',
    toMove: P1,
    p1: '6S 3* 7D 0* 3D A',
    p2: '6H 5C 1H 9D',
    table: '6D A 4C 2H',
  });
  const hand = state.hands[0];
  const table = state.table;

  it('requires exactly one table card', () => {
    const fromHand = { tens: card(hand, '6S'), units: card(hand, '3*') };
    expect(error(state, P1, { type: 'bid', ...fromHand, take: card(table, '4C') })).toBe(
      'TABLE_CARD_REQUIRED',
    );
    const twoFromTable: Move = {
      type: 'bid',
      tens: card(table, '6D'),
      units: card(hand, '3*'),
      action: { card: card(table, 'A'), column: 1 },
      take: card(table, '4C'),
    };
    expect(error(state, P1, twoFromTable)).toBe('ONE_TABLE_CARD_ONLY');
  });

  it('accepts a table digit plus one digit from hand', () => {
    const move: Move = {
      type: 'bid',
      tens: card(table, '6D'),
      units: card(hand, '3*'),
      take: card(table, '4C'),
    };
    expect(error(state, P1, move)).toBe('legal');
    const next = applyMove(state, P1, move);
    expect(next.hands[0]).toHaveLength(hand.length); // one out, one in
    expect(next.table).toHaveLength(table.length - 2); // one used, one taken
    expect(next.phase).toBe('bid');
    expect(next.toMove).toBe(P2);
  });

  it('accepts a table digit, a hand digit and an action card from hand', () => {
    // Column 1 raises 58 to 68: 7♦ from hand and 2♥ from the table make 72.
    const move: Move = {
      type: 'bid',
      tens: card(hand, '7D'),
      units: card(table, '2H'),
      action: { card: card(hand, 'A'), column: 1 },
      take: card(table, '4C'),
    };
    expect(error(state, P1, move)).toBe('legal');
    // Column 4 lowers 58 to 48, and 72 is not within 49–58.
    expect(error(state, P1, { ...move, action: { card: card(hand, 'A'), column: 4 } })).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('accepts an action card from the table with two digits from hand', () => {
    const move: Move = {
      type: 'bid',
      tens: card(hand, '7D'),
      units: card(hand, '0*'),
      action: { card: card(table, 'A'), column: 1 },
      take: card(table, '4C'),
    };
    expect(error(state, P1, move)).toBe('legal');
  });

  it('forbids taking the table card used in the bid', () => {
    const move: Move = {
      type: 'bid',
      tens: card(table, '6D'),
      units: card(hand, '3*'),
      take: card(table, '6D'),
    };
    expect(error(state, P1, move)).toBe('TAKE_NOT_ON_TABLE');
  });

  it("answers CARD_NOT_IN_HAND for the opponent's cards, never saying where they are", () => {
    const move: Move = {
      type: 'bid',
      tens: card(state.hands[1], '9D'),
      units: card(hand, '3*'),
      take: card(table, '4C'),
    };
    expect(error(state, P1, move)).toBe('CARD_NOT_IN_HAND');
    const both: Move = { ...move, tens: card(table, '6D'), units: card(state.hands[1], '1H') };
    expect(error(state, P1, both)).toBe('CARD_NOT_IN_HAND');
  });
});

describe('ordinary bids (rules 6.3, 7, 8, 10)', () => {
  const state = position({
    rows: [{ by: P1, cards: '6S 3*' }],
    toMove: P2,
    p1: '9D 9C',
    p2: '6H 5D 7C 1S A',
    table: '2H 2C 4D',
  });
  const hand = state.hands[1];

  it('places an action card next to the latest bid and takes a table card', () => {
    // Latest 6♠ 3★ = 63. Column 4 lowers it to 53, so 57 is legal.
    const move: Move = {
      type: 'bid',
      tens: card(hand, '5D'),
      units: card(hand, '7C'),
      action: { card: card(hand, 'A'), column: 4 },
      take: card(state.table, '2H'),
    };
    const next = applyMove(state, P2, move);
    const rows = next.bids;
    expect(rows).toHaveLength(3);
    expect(rows[1]?.modifier).toEqual({ card: card(hand, 'A'), column: 4, by: P2 });
    expect(effectiveValue(rows[1]!)).toBe(53);
    expect(rows[2]?.value).toBe(57);
    expect(next.hands[1]).toHaveLength(hand.length - 3 + 1);
    expect(next.known[1].map(cardLabel)).toEqual(['2♥']);
    expect(next.bidCount).toEqual([1, 1]);
  });

  it('rejects table cards after the first bid', () => {
    const move: Move = {
      type: 'bid',
      tens: card(hand, '6H'),
      units: card(state.table, '4D'),
      take: card(state.table, '2H'),
    };
    expect(error(state, P2, move)).toBe('TABLE_CARD_NOT_ALLOWED');
  });

  it('requires a take while the table has cards, and forbids one when it is empty', () => {
    const noTake: Move = { type: 'bid', tens: card(hand, '6H'), units: card(hand, '5D') };
    expect(error(state, P2, noTake)).toBe('TAKE_REQUIRED');
    const bare = position({
      rows: [{ by: P1, cards: '6S 3*' }],
      toMove: P2,
      p2: '6H 5D',
      table: '',
    });
    const bareMove: Move = {
      type: 'bid',
      tens: card(bare.hands[1], '6H'),
      units: card(bare.hands[1], '5D'),
    };
    expect(error(bare, P2, bareMove)).toBe('legal');
    expect(error(bare, P2, { ...bareMove, take: card(bare.hands[1], '6H') })).toBe(
      'TAKE_NOT_ALLOWED',
    );
  });

  it('rejects malformed moves', () => {
    const tens = card(hand, '6H');
    expect(error(state, P2, { type: 'bid', tens, units: tens })).toBe('DUPLICATE_CARD');
    expect(error(state, P2, { type: 'bid', tens: card(hand, 'A'), units: tens })).toBe(
      'NOT_A_DIGIT',
    );
    expect(error(state, P2, { type: 'bid', tens, units: 999 })).toBe('NOT_A_CARD');
    expect(error(state, P1, { type: 'bid', tens, units: card(hand, '5D') })).toBe('NOT_YOUR_TURN');
    expect(error(state, P2, { type: 'pass' })).toBe('WRONG_PHASE');
  });

  it('throws when applying an illegal move', () => {
    expect(() => applyMove(state, P2, { type: 'pass' })).toThrow(MoveRejectedError);
  });
});

describe('end of the game (rule 11.1)', () => {
  it('ends when the next player cannot bid: the last bidder wins', () => {
    // Latest 1♥ 0♠ = 10 by P2. P1 bids 1♦ 5♣ = 15; P2 holds only 0★ 0♦ and cannot reach 16–25.
    const state = position({
      rows: [{ by: P2, cards: '1H 0S' }],
      toMove: P1,
      start: '0H 9S',
      p1: '1D 5C 9*',
      p2: '0* 0D',
      table: '',
    });
    const next = applyMove(state, P1, {
      type: 'bid',
      tens: card(state.hands[0], '1D'),
      units: card(state.hands[0], '5C'),
    });
    expect(hasLegalBid(next)).toBe(false);
    expect(next.result).toEqual({ winner: P1, reason: 'noLegalBid' });
    expect(next.phase).toBe('over');
  });

  it('accepts results decided outside the rules, then refuses moves', () => {
    const state = position({ toMove: P1, p1: '6S 3*', table: '4C' });
    const over = endGame(state, { winner: P2, reason: 'resign' });
    expect(over.phase).toBe('over');
    expect(legalBids(over)).toEqual([]);
    expect(error(over, P1, { type: 'pass' })).toBe('GAME_OVER');
  });
});
