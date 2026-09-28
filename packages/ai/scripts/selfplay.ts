/**
 * Plays games between two players, in this process, and prints the result: a quick check while
 * tuning. The balance lab (tools/balance-lab) runs larger tournaments on every core.
 *
 *   pnpm --filter @cardauction/ai selfplay --a medium --b random --games 40 [--verbose]
 */
import {
  applyMove,
  describeMove,
  newGame,
  randomMove,
  seededRng,
  viewFor,
  type Move,
} from '@cardauction/engine';
import { parseArgs } from 'node:util';
import { chooseMove, LEVELS, type Level } from '../src/index.js';

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'medium' },
    b: { type: 'string', default: 'random' },
    games: { type: 'string', default: '40' },
    seed: { type: 'string', default: '1' },
    verbose: { type: 'boolean', default: false },
  },
});

type Player = (view: ReturnType<typeof viewFor>, seed: number) => Move;

function player(spec: string): Player {
  if (spec === 'random') {
    return (view, seed) => {
      const rng = seededRng(seed);
      // randomMove needs a state; the view's own moves are all it uses.
      const hands: [readonly number[], readonly number[]] = [[], []];
      hands[view.seat] = view.hand;
      return randomMove(
        {
          phase: view.phase,
          toMove: view.toMove,
          hands,
          table: view.table,
          stock: [],
          bids: view.bids,
          known: [[], []],
          bidCount: view.bidCount,
          moveCount: view.moveCount,
          result: view.result,
        },
        rng,
      );
    };
  }
  const [name, iterations] = spec.split(':');
  const level = LEVELS[name as Level] ?? { iterations: Number(iterations), randomMoveRate: 0 };
  return (view, seed) => chooseMove(view, { ...level, seed }).move;
}

const a = player(values.a);
const b = player(values.b);
const games = Number(values.games);
let winsA = 0;
let bids = 0;
const started = performance.now();
for (let g = 0; g < games; g++) {
  const deal = Number(values.seed) + Math.floor(g / 2);
  const aSeat = g % 2;
  let state = newGame(seededRng(deal));
  let turn = 0;
  while (state.result === null) {
    const seat = state.toMove;
    const view = viewFor(state, seat);
    const move = (seat === aSeat ? a : b)(view, deal * 1000 + turn++);
    if (values.verbose) console.log(`  ${seat === aSeat ? 'A' : 'B'} ${describeMove(move)}`);
    state = applyMove(state, seat, move);
  }
  bids += state.bids.length - 1;
  if (state.result.winner === aSeat) winsA++;
  if (values.verbose) console.log(`game ${g}: ${state.result.winner === aSeat ? 'A' : 'B'} wins`);
}
const seconds = (performance.now() - started) / 1000;
console.log(
  `${values.a} vs ${values.b}: ${winsA}/${games} (${((100 * winsA) / games).toFixed(1)}%) for ${values.a}; ` +
    `${(bids / games).toFixed(1)} bids per game; ${seconds.toFixed(1)} s`,
);
