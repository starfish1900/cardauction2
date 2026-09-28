import {
  applyMove,
  bidValue,
  newGame,
  randomMove,
  seededRng,
  validateMove,
  viewFor,
  type GameState,
} from '@cardauction/engine';
import { describe, expect, it } from 'vitest';
import { position } from '../../engine/test/helpers.js';
import { chooseMove, LEVELS } from '../src/index.js';
import { K_BID, kindOf, knowledgeFromView, OVER } from '../src/model.js';
import { search } from '../src/search.js';

/** Positions from random games, at every stage: the exchange, the first bid, later bids. */
function positions(count: number, seed: number): GameState[] {
  const list: GameState[] = [];
  for (let s = seed; list.length < count; s++) {
    const rng = seededRng(s);
    let state = newGame(rng);
    const stop = s % 12;
    for (let i = 0; i < stop && state.result === null; i++) {
      state = applyMove(state, state.toMove, randomMove(state, rng));
    }
    if (state.result === null) list.push(state);
  }
  return list;
}

describe('the AI', () => {
  it('plays only legal moves, from its own view, at every stage of a game', () => {
    const list = positions(60, 1);
    expect(list.some((s) => s.phase === 'exchange')).toBe(true);
    expect(list.some((s) => s.phase === 'firstBid')).toBe(true);
    for (const [i, state] of list.entries()) {
      const seat = state.toMove;
      const choice = chooseMove(viewFor(state, seat), { iterations: 200, seed: i });
      expect(validateMove(state, seat, choice.move)).toEqual({ ok: true });
      expect(choice.random).toBe(false);
    }
  });

  it('plays its games to the end against itself without an illegal move', () => {
    for (let seed = 100; seed < 106; seed++) {
      let state = newGame(seededRng(seed));
      for (let turn = 0; state.result === null; turn++) {
        const move = chooseMove(viewFor(state, state.toMove), { iterations: 150, seed: turn }).move;
        state = applyMove(state, state.toMove, move);
      }
      expect(state.result.reason).toBe('noLegalBid');
    }
  });

  it('sees a bid its opponent cannot answer', () => {
    // After 58, P2 holds only two 7s: any bid from 59 to 66 leaves no answer; 67 would not.
    const base = position({
      toMove: 0,
      p1: '6* 7* 6D 0D',
      p2: '7D 7C',
      table: '2H 3S',
    });
    // P2 took its two cards from the table earlier, so P1 knows them.
    const state: GameState = { ...base, known: [[], [...base.hands[1]]] };
    for (let seed = 0; seed < 5; seed++) {
      const move = chooseMove(viewFor(state, 0), { iterations: 400, seed }).move;
      expect(move.type).toBe('bid');
      if (move.type !== 'bid') return;
      expect(bidValue(move.tens, move.units)).toBeLessThan(67);
    }
  });

  it('takes the card its tree prefers, even when the known cards alone could not answer the bid', () => {
    // With only the opponent's known cards, the bid often ends the game; with its hidden cards
    // dealt, the game usually goes on, and the tree has weighed every card to take.
    let cases = 0;
    let fromTree = 0;
    for (let seed = 1; cases < 8 && seed < 400; seed++) {
      const rng = seededRng(seed);
      let state = newGame(rng);
      for (let i = 0; i < 4 + (seed % 5) && state.result === null; i++) {
        state = applyMove(state, state.toMove, randomMove(state, rng));
      }
      if (state.result !== null || state.phase !== 'bid') continue;
      const knowledge = knowledgeFromView(viewFor(state, state.toMove));
      if (knowledge.hidden < 3) continue;
      const result = search(knowledge, {
        iterations: 1_000,
        exploration: 0.7,
        epsilon: 0.1,
        seed,
        exchangeLimit: 40,
        takeWidth: 0,
      });
      if (kindOf(result.move) !== K_BID) continue;
      const after = knowledge.base.clone();
      after.apply(result.move);
      if (after.phase !== OVER || after.tableCount === 0) continue;
      cases++;
      if (result.take !== null) fromTree++;
    }
    expect(cases).toBe(8);
    expect(fromTree).toBeGreaterThanOrEqual(6);
  });

  it('is reproducible with a seed', () => {
    const [state] = positions(1, 500);
    if (!state) throw new Error('no position');
    const view = viewFor(state, state.toMove);
    const a = chooseMove(view, { iterations: 500, seed: 42 });
    const b = chooseMove(view, { iterations: 500, seed: 42 });
    expect(a.move).toEqual(b.move);
    expect(a.iterations).toBe(500);
  });

  it('stops at its deadline, or when told to, with a legal move', () => {
    const [state] = positions(1, 600);
    if (!state) throw new Error('no position');
    const view = viewFor(state, state.toMove);
    const started = performance.now();
    const timed = chooseMove(view, { iterations: 10_000_000, deadline: started + 150, seed: 1 });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(timed.iterations).toBeLessThan(10_000_000);
    expect(validateMove(state, state.toMove, timed.move)).toEqual({ ok: true });
    let polls = 0;
    const stopped = chooseMove(view, {
      iterations: 10_000_000,
      seed: 1,
      shouldStop: () => ++polls > 3,
    });
    expect(stopped.iterations).toBeLessThanOrEqual(4 * 32);
    expect(validateMove(state, state.toMove, stopped.move)).toEqual({ ok: true });
  });

  it('has three levels, and Easy slips on purpose now and then', () => {
    expect(LEVELS.easy.iterations).toBeLessThan(LEVELS.medium.iterations);
    expect(LEVELS.medium.iterations).toBeLessThan(LEVELS.hard.iterations);
    const [state] = positions(1, 700);
    if (!state) throw new Error('no position');
    const view = viewFor(state, state.toMove);
    const always = chooseMove(view, { iterations: 100, randomMoveRate: 1, seed: 3 });
    expect(always.random).toBe(true);
    expect(validateMove(state, state.toMove, always.move)).toEqual({ ok: true });
  });
});
