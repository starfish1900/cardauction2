import { describe, expect, it } from 'vitest';
import { bidWindow, mod100, validateMove, type Column, type GameState } from '../src/index.js';
import { card, position } from './helpers.js';

/** Validates a bid by P1 from hand; the table holds a single spare card to take. */
function check(latest: string, bid: string, column?: Column): string {
  const [tensCode, unitsCode] = bid.split(' ') as [string, string];
  const state: GameState = position({
    start: latest,
    p1: column ? `${bid} A` : bid,
    table: '9*',
  });
  const hand = state.hands[0];
  const move = {
    type: 'bid' as const,
    tens: card(hand, tensCode),
    units: card(hand, unitsCode),
    ...(column ? { action: { card: card(hand, 'A'), column } } : {}),
    take: card(state.table, '9*'),
  };
  const result = validateMove(state, 0, move);
  return result.ok ? 'legal' : result.error;
}

describe('rule book examples (rules 6.4, 7, 8, 9) and the Q&A decisions', () => {
  it('rejects 6♥ 3♠ after 5♥ 8♠: no new color', () => {
    expect(check('5H 8S', '6H 3S')).toBe('NO_NEW_COLOR');
  });

  it('accepts 6♠ 3★ after 5♥ 8♠: +5, and ★ is new', () => {
    expect(check('5H 8S', '6S 3*')).toBe('legal');
  });

  it('rejects the swap 6♠ 3♥ after 5♥ 8♠ (Q&A: a new color is needed)', () => {
    expect(check('5H 8S', '6S 3H')).toBe('NO_NEW_COLOR');
  });

  it('accepts one old color next to a new one', () => {
    expect(check('5H 8S', '6H 3D')).toBe('legal');
  });

  it('rejects two digit cards of the same color', () => {
    expect(check('5H 8S', '6D 3D')).toBe('SAME_COLOR');
  });

  it('rejects +12 without an action card', () => {
    expect(check('5H 8S', '7D 0*')).toBe('OUT_OF_RANGE');
  });

  it('accepts 70 after 58 with an action card in column 1 (+2 over 68)', () => {
    expect(check('5H 8S', '7D 0*', 1)).toBe('legal');
  });

  it('turns 96 into 06 with column 1, so bids run 07–16 (rule 9.1)', () => {
    expect(bidWindow(position({ start: '9H 6S' }).bids[0]!, 10)).toEqual({
      reference: 6,
      from: 7,
      to: 16,
    });
    expect(check('9H 6S', '0D 7C', 1)).toBe('legal');
    expect(check('9H 6S', '1D 6C', 1)).toBe('legal');
    expect(check('9H 6S', '0D 6C', 1)).toBe('OUT_OF_RANGE');
    expect(check('9H 6S', '1D 7C', 1)).toBe('OUT_OF_RANGE');
  });

  it('turns 03 into 93 with column 4, so bids run 94–03 (rule 9.2)', () => {
    expect(bidWindow(position({ start: '0H 3S' }).bids[0]!, -10)).toEqual({
      reference: 93,
      from: 94,
      to: 3,
    });
    expect(check('0H 3S', '9D 4C', 4)).toBe('legal');
    expect(check('0H 3S', '0D 3C', 4)).toBe('legal');
    expect(check('0H 3S', '9D 3C', 4)).toBe('OUT_OF_RANGE');
    expect(check('0H 3S', '0D 4C', 4)).toBe('OUT_OF_RANGE');
  });

  it('wraps from 99 to 00: 03 is +8 over 95 (assumption 1)', () => {
    expect(check('9H 5S', '0D 3C')).toBe('legal');
  });

  it('lets a −10 action bring the bid back to the old value (assumption 2)', () => {
    expect(check('5D 7C', '5H 7*', 4)).toBe('legal');
    expect(check('5D 7C', '4H 8*', 4)).toBe('legal');
    expect(check('5D 7C', '4H 7*', 4)).toBe('OUT_OF_RANGE');
  });

  it('allows any two colors after a starting pair of one suit', () => {
    expect(check('3H 7H', '4H 0D')).toBe('legal');
  });

  it('computes modulo 100 as a non-negative remainder', () => {
    expect(mod100(-7)).toBe(93);
    expect(mod100(106)).toBe(6);
    expect(mod100(100)).toBe(0);
  });
});
