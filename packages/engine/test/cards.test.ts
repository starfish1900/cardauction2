import { describe, expect, it } from 'vitest';
import {
  actionId,
  allCardIds,
  cardCode,
  cardLabel,
  CLUBS,
  cryptoRng,
  digitId,
  faceOf,
  HEARTS,
  isAction,
  isDigit,
  parseFace,
  rankOf,
  seededRng,
  shuffleInPlace,
  sortCards,
  SPADES,
  STARS,
  suitOf,
} from '../src/index.js';

describe('card ids', () => {
  it('holds 100 digit cards (5 suits × 10 ranks × 2 copies) and 20 action cards', () => {
    const ids = allCardIds();
    expect(ids).toHaveLength(120);
    expect(ids.filter(isDigit)).toHaveLength(100);
    expect(ids.filter(isAction)).toHaveLength(20);
    const faces = new Map<number, number>();
    for (const id of ids.filter(isDigit)) faces.set(faceOf(id), (faces.get(faceOf(id)) ?? 0) + 1);
    expect(faces.size).toBe(50);
    expect([...faces.values()].every((count) => count === 2)).toBe(true);
  });

  it('derives suit and rank from the id', () => {
    expect(digitId(HEARTS, 5, 1)).toBe(3 * 20 + 5 * 2 + 1);
    expect(suitOf(digitId(STARS, 9, 1))).toBe(STARS);
    expect(rankOf(digitId(SPADES, 0))).toBe(0);
    expect(faceOf(actionId(7))).toBe(50);
    expect(() => suitOf(actionId())).toThrow();
  });

  it('labels and codes cards', () => {
    expect(cardLabel(digitId(HEARTS, 5))).toBe('5♥');
    expect(cardLabel(actionId())).toBe('±10');
    expect(cardCode(digitId(STARS, 0))).toBe('0*');
    expect(parseFace('7d')).toEqual({ kind: 'digit', suit: 1, rank: 7 });
    expect(parseFace('3♣')).toEqual({ kind: 'digit', suit: CLUBS, rank: 3 });
    expect(parseFace('a')).toEqual({ kind: 'action' });
    expect(parseFace('10H')).toBeNull();
    expect(parseFace('5X')).toBeNull();
  });

  it('sorts action cards first, then by rank, then by suit in rule-book order', () => {
    const cards = [
      digitId(SPADES, 2),
      actionId(3),
      digitId(STARS, 2),
      digitId(HEARTS, 0),
      actionId(0),
    ];
    expect(sortCards(cards).map(cardLabel)).toEqual(['±10', '±10', '0♥', '2★', '2♠']);
  });
});

describe('random sources', () => {
  it('seeded generators are reproducible', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const drawsA = Array.from({ length: 50 }, () => a.int(1000));
    const drawsB = Array.from({ length: 50 }, () => b.int(1000));
    expect(drawsA).toEqual(drawsB);
  });

  it('draws stay in range and cover it', () => {
    for (const rng of [seededRng(7), cryptoRng()]) {
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        const n = rng.int(6);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(6);
        seen.add(n);
      }
      expect(seen.size).toBe(6);
    }
  });

  it('shuffles into a permutation', () => {
    const deck = shuffleInPlace(allCardIds(), cryptoRng());
    expect(new Set(deck).size).toBe(120);
    expect(deck).not.toEqual(allCardIds());
  });
});
