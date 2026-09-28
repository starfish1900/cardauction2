/**
 * Measures the search speed: iterations per second on positions from random games, at every
 * stage of a game.
 *
 *   pnpm --filter @cardauction/ai bench [--iterations 2000] [--positions 60]
 */
import {
  applyMove,
  newGame,
  randomMove,
  seededRng,
  viewFor,
  type GameState,
} from '@cardauction/engine';
import { parseArgs } from 'node:util';
import { chooseMove } from '../src/index.js';

const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '2000' },
    positions: { type: 'string', default: '60' },
  },
});
const iterations = Number(values.iterations);
const count = Number(values.positions);

const positions: GameState[] = [];
for (let seed = 1; positions.length < count; seed++) {
  const rng = seededRng(seed);
  let state = newGame(rng);
  const stop = rng.int(10);
  for (let i = 0; state.result === null && i < stop; i++) {
    state = applyMove(state, state.toMove, randomMove(state, rng));
  }
  if (state.result === null) positions.push(state);
}

let total = 0;
let spent = 0;
const perStage = new Map<number, { ms: number; n: number }>();
for (const [i, state] of positions.entries()) {
  const view = viewFor(state, state.toMove);
  const start = performance.now();
  const choice = chooseMove(view, { iterations, seed: i });
  const ms = performance.now() - start;
  total += choice.iterations;
  spent += ms;
  const stage = Math.min(state.bids.length - 1, 8);
  const entry = perStage.get(stage) ?? { ms: 0, n: 0 };
  entry.ms += ms / Math.max(1, choice.iterations);
  entry.n += 1;
  perStage.set(stage, entry);
}
console.log(`${positions.length} positions, ${iterations} iterations each`);
console.log(`  ${((spent / total) * 1000).toFixed(1)} µs per iteration on average`);
console.log(`  ${(total / (spent / 1000)).toFixed(0)} iterations per second`);
for (const [stage, { ms, n }] of [...perStage.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(
    `  after ${stage} bids: ${((ms / n) * 1000).toFixed(1)} µs per iteration (${n} positions)`,
  );
}
