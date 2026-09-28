import { describe, expect, it } from 'vitest';
import {
  applyMove,
  faceOf,
  isAction,
  isDigit,
  legalBids,
  P1,
  P2,
  playRandomGame,
  seededRng,
  takeOptions,
  validateMove,
  type BidChoice,
  type CardId,
  type Column,
  type GameState,
  type Move,
} from '../src/index.js';
import { card, position } from './helpers.js';

/**
 * Identifies a bid by faces, column and which card (if any) comes from the table. When both
 * digits are the same face and one copy is on the table, it does not matter which is which.
 */
function key(state: GameState, bid: BidChoice): string {
  const fromTable = (id: CardId): boolean => !state.hands[state.toMove].includes(id);
  const pair = faceOf(bid.tens) === faceOf(bid.units);
  const source =
    bid.action && fromTable(bid.action.card)
      ? 'A'
      : fromTable(bid.tens) || fromTable(bid.units)
        ? pair
          ? 'P'
          : fromTable(bid.tens)
            ? 'T'
            : 'U'
        : '-';
  return `${faceOf(bid.tens)}/${faceOf(bid.units)}/${bid.action?.column ?? 0}/${source}`;
}

/** Brute force: every combination of cards the mover could put down, kept if the validator agrees. */
function bruteForceBids(state: GameState): Set<string> {
  const seat = state.toMove;
  const hand = state.hands[seat];
  const pool = state.phase === 'firstBid' ? [...hand, ...state.table] : [...hand];
  const digits = pool.filter(isDigit);
  const actions = pool.filter(isAction);
  const keys = new Set<string>();
  const columns: Column[] = [1, 4];
  for (const tens of digits) {
    for (const units of digits) {
      if (tens === units) continue;
      const variants: BidChoice[] = [{ tens, units }];
      for (const actionCard of actions) {
        for (const column of columns)
          variants.push({ tens, units, action: { card: actionCard, column } });
      }
      for (const bid of variants) {
        const takes = takeOptions(state, bid);
        const move: Move = {
          type: 'bid',
          ...bid,
          ...(takes[0] !== undefined ? { take: takes[0] } : {}),
        };
        if (validateMove(state, seat, move).ok) keys.add(key(state, bid));
      }
    }
  }
  return keys;
}

/** Positions where both copies of 6♦ make 66: from hand on a later bid, or hand + table on P1's first bid. */
function pairPositions(): [later: GameState, opening: GameState] {
  return [
    // Latest 6♠ 3★ = 63 by P1: P2 can bid 66 (6♦ 6♦), 67 (6♦ 7♥) or 76 with the action card (+10).
    position({ rows: [{ by: P1, cards: '6S 3*' }], toMove: P2, p2: '6D 6D 7H A', table: '2H' }),
    // Latest 5♥ 8♠ = 58: P1 can open 66 (table 6♦ + hand 6♦), 61 (table 6♦ + 1♣) or 64 (6♦ + table 4♣).
    position({ phase: 'firstBid', p1: '6D 1C', table: '6D 4C' }),
  ];
}

function sampleStates(games: number): GameState[] {
  const states: GameState[] = [];
  for (let seed = 1; seed <= games; seed++) {
    playRandomGame(seededRng(seed), (before) => {
      if (before.phase === 'firstBid' || before.phase === 'bid') states.push(before);
    });
  }
  return states;
}

describe('legal bid generation', () => {
  it('matches a brute-force search over every card combination', () => {
    const states = sampleStates(16);
    expect(states.length).toBeGreaterThan(100);
    for (const state of [...states, ...pairPositions()]) {
      const generated = legalBids(state).map((bid) => key(state, bid));
      expect(new Set(generated).size).toBe(generated.length); // no duplicates
      expect(new Set(generated)).toEqual(bruteForceBids(state));
    }
  });

  it('only produces bids the validator accepts, with any take the table allows', () => {
    for (const state of sampleStates(20)) {
      for (const bid of legalBids(state)) {
        const takes = takeOptions(state, bid, false);
        const options = takes.length > 0 ? takes : [undefined];
        for (const take of options) {
          const move: Move = { type: 'bid', ...bid, ...(take !== undefined ? { take } : {}) };
          expect(validateMove(state, state.toMove, move)).toEqual({ ok: true });
        }
      }
    }
  });

  it('offers a pair made of both copies of one card exactly once', () => {
    const [later, opening] = pairPositions();
    expect(legalBids(later)).toHaveLength(3);
    expect(legalBids(opening)).toHaveLength(3);
    for (const state of [later, opening]) {
      const pairs = legalBids(state).filter((bid) => faceOf(bid.tens) === faceOf(bid.units));
      expect(pairs).toHaveLength(1);
      const [bid] = pairs as [BidChoice];
      expect(bid.tens).not.toBe(bid.units);
      // On the opening, exactly one of the two copies is the table card; later, both are in hand.
      const onTable = [bid.tens, bid.units].filter((id) => state.table.includes(id));
      expect(onTable).toHaveLength(state === opening ? 1 : 0);
      const [take] = takeOptions(state, bid);
      const next = applyMove(state, state.toMove, {
        type: 'bid',
        ...bid,
        ...(take !== undefined ? { take } : {}),
      });
      expect(next.bids[next.bids.length - 1]?.value).toBe(66);
    }
  });

  it('lets P1 open with a table action card and two hand digits', () => {
    const state = position({
      phase: 'firstBid',
      p1: '7D 0*',
      p2: '8H 1C',
      table: 'A 4C',
    });
    const bids = legalBids(state);
    expect(bids).toHaveLength(1);
    const [bid] = bids as [BidChoice];
    expect(bid.action?.card).toBe(card(state.table, 'A'));
    const next = applyMove(state, 0, { type: 'bid', ...bid, take: card(state.table, '4C') });
    expect(next.bids[0]?.modifier?.column).toBe(1);
    expect(next.bids[1]?.value).toBe(70);
  });
});
