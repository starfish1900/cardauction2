import { exchangeOptions, legalBids, takeOptions } from './legal.js';
import { applyMove, type Move } from './moves.js';
import { pick, type Rng } from './rng.js';
import { newGame } from './setup.js';
import type { GameState, RuleSet } from './state.js';

/**
 * A uniformly random legal move: at the exchange, pass or a random swap (half each); otherwise a
 * random legal bid, then a random table card to take. Used by the simulator, the tests and, later,
 * as the AI's baseline playout policy.
 */
export function randomMove(state: GameState, rng: Rng): Move {
  if (state.phase === 'exchange') {
    const options = exchangeOptions(state);
    if (options.length === 0 || rng.int(2) === 0) return { type: 'pass' };
    const { give, take } = pick(options, rng);
    return { type: 'exchange', give, take };
  }
  const bid = pick(legalBids(state), rng);
  const takes = takeOptions(state, bid, false);
  return takes.length > 0
    ? { type: 'bid', ...bid, take: pick(takes, rng) }
    : { type: 'bid', ...bid };
}

export type MoveVisitor = (before: GameState, move: Move, after: GameState) => void;

/** Deals a game with `rng` and plays random moves until the game ends. */
export function playRandomGame(rng: Rng, visit?: MoveVisitor, rules?: RuleSet): GameState {
  let state = newGame(rng, rules);
  while (state.result === null) {
    const move = randomMove(state, rng);
    const next = applyMove(state, state.toMove, move);
    visit?.(state, move, next);
    state = next;
  }
  return state;
}
