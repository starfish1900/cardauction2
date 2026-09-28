import { STANDARD_RULES } from '@cardauction/engine';
import { describe, expect, it } from 'vitest';
import { parsePlayer, parseRules, playGame, type GameRecord } from '../src/play.js';
import { pValue, report, summarize, toCsv, wilson } from '../src/stats.js';

describe('statistics', () => {
  it('gives the Wilson interval of a win rate', () => {
    const [low, high] = wilson(50, 100);
    expect(low).toBeCloseTo(0.404, 3);
    expect(high).toBeCloseTo(0.596, 3);
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [none, some] = wilson(0, 20);
    expect(none).toBe(0);
    expect(some).toBeGreaterThan(0);
  });

  it('gives the two-sided p-value against an even match', () => {
    expect(pValue(50, 100)).toBeCloseTo(1, 6);
    expect(pValue(60, 100)).toBeCloseTo(0.0574, 3);
    expect(pValue(40, 100)).toBeCloseTo(pValue(60, 100), 10);
    expect(pValue(176, 300)).toBeLessThan(0.005);
  });
});

describe('players and rules', () => {
  it('reads players', () => {
    expect(parsePlayer('random')).toEqual({ name: 'random', kind: 'random' });
    expect(parsePlayer('hard')).toMatchObject({ kind: 'search', iterations: 8_000 });
    expect(parsePlayer('easy')).toMatchObject({ kind: 'search', randomMoveRate: 0.25 });
    expect(parsePlayer('search:500:c=0.5:eps=0.2:random=0.1:tw=3')).toEqual({
      name: 'search:500:c=0.5:eps=0.2:random=0.1:tw=3',
      kind: 'search',
      iterations: 500,
      randomMoveRate: 0.1,
      exploration: 0.5,
      epsilon: 0.2,
      takeWidth: 3,
    });
    expect(() => parsePlayer('search')).toThrow('unknown player');
    expect(() => parsePlayer('search:0')).toThrow('unknown player');
    expect(() => parsePlayer('search:100:x=1')).toThrow('unknown setting');
    expect(() => parsePlayer('search:100:c=abc')).toThrow('bad setting');
  });

  it('reads rule variants over the standard rules', () => {
    expect(parseRules(undefined)).toBeUndefined();
    expect(parseRules('exchange=false,handSize=12')).toEqual({
      ...STANDARD_RULES,
      exchange: false,
      handSize: 12,
    });
    expect(() => parseRules('colour=true')).toThrow('unknown rule');
    expect(() => parseRules('exchange=no')).toThrow('true or false');
    expect(() => parseRules('handSize=-1')).toThrow('whole number');
  });
});

describe('games', () => {
  const random = parsePlayer('random');
  const search = parsePlayer('search:60');

  /** A record without its timings, which vary from run to run. */
  function outcome(record: GameRecord): GameRecord {
    return { ...record, thinkMsA: 0, thinkMsB: 0, maxThinkMs: 0 };
  }

  it('plays a deal to the end, the same way every time', () => {
    const first = playGame(7, 0, search, random, undefined);
    expect(first.winner).not.toBe('-');
    expect(first.reason).toBe('noLegalBid');
    expect(first.bids).toBeGreaterThan(0);
    expect(first.opening).not.toBe('');
    expect(first.movesA + first.movesB).toBeGreaterThan(first.bids);
    expect(outcome(playGame(7, 0, search, random, undefined))).toEqual(outcome(first));
  });

  it('plays rule variants', () => {
    const rules = parseRules('exchange=false,distinctSuits=true');
    const record = playGame(8, 1, random, search, rules);
    expect(record.opening).toBe('');
    expect(record.winner).not.toBe('-');
  });

  it('sums up a tournament, with each deal played from both seats', () => {
    const records: GameRecord[] = [];
    for (let deal = 1; deal <= 4; deal++) {
      records.push(playGame(deal, 0, search, random, undefined));
      records.push(playGame(deal, 1, search, random, undefined));
    }
    const summary = summarize(records);
    expect(summary.games).toBe(8);
    expect(summary.winsA + summary.winsB + summary.draws).toBe(8);
    expect(summary.sweepsA + summary.sweepsB).toBeLessThanOrEqual(4);
    expect(summary.reasons).toEqual({ noLegalBid: 8 });
    const text = report(summary, 'search:60', 'random', 'standard rules');
    expect(text).toContain('search:60 vs random: 8 games (4 deals, both seats)');
    const csv = toCsv(records, 'search:60', 'random', 'standard').trim().split('\n');
    expect(csv).toHaveLength(9);
  });

  it('sums up very large tournaments too', () => {
    const sample = playGame(3, 0, random, random, undefined);
    const records = Array.from({ length: 200_000 }, (_, i) => ({
      ...sample,
      deal: i >> 1,
      aSeat: (i & 1) as 0 | 1,
      bids: 1 + (i % 20),
    }));
    const summary = summarize(records);
    expect(summary.games).toBe(200_000);
    expect([summary.bidsMin, summary.bidsMax]).toEqual([1, 20]);
  });
});
