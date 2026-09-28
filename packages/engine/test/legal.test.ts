import { describe, expect, it } from 'vitest';
import {
  applyMove,
  faceOf,
  isAction,
  isDigit,
  legalBids,
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

/** Identifies a bid by faces, columns and which card (if any) comes from the table. */
function key(state: GameState, bid: BidChoice): string {
  const fromTable = (id: CardId): boolean => !state.hands[state.toMove].includes(id);
  const source =
    bid.action && fromTable(bid.action.card)
      ? 'A'
      : fromTable(bid.tens)
        ? 'T'
        : fromTable(bid.units)
          ? 'U'
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
    const states = sampleStates(12);
    expect(states.length).toBeGreaterThan(100);
    for (const state of states) {
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
