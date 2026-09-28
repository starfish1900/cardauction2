import {
  exchangeOptions,
  legalBids,
  takeOptions,
  validateMove,
  type GameState,
  type Move,
  type PlayerView,
} from '@cardauction/engine';
import { kindOf, K_BID, knowledgeFromView, moveOfCode } from './model.js';
import { Policy } from './policy.js';
import { Random } from './random.js';
import { search } from './search.js';

export { coverage } from './policy.js';
export { Random } from './random.js';

export type Level = 'easy' | 'medium' | 'hard';

export interface LevelConfig {
  /** Search iterations per move: the strength, whatever the machine's speed. */
  readonly iterations: number;
  /** Share of moves played at random instead (Easy's slips). */
  readonly randomMoveRate: number;
}

/** The plan's three levels. Budgets count iterations, so a slow machine plays as well, only slower. */
export const LEVELS: Readonly<Record<Level, LevelConfig>> = {
  easy: { iterations: 300, randomMoveRate: 0.25 },
  medium: { iterations: 2_000, randomMoveRate: 0 },
  hard: { iterations: 8_000, randomMoveRate: 0 },
};

export interface ChooseOptions {
  readonly iterations: number;
  readonly randomMoveRate?: number;
  readonly seed?: number;
  /** performance.now() time to stop at, keeping the best move found so far. */
  readonly deadline?: number;
  /** Polled during the search: true abandons it (the result is then still a legal move). */
  readonly shouldStop?: () => boolean;
  readonly exploration?: number;
  readonly epsilon?: number;
  /** Below the root, how many of the best takes the tree keeps after each bid (0: all). */
  readonly takeWidth?: number;
}

export interface Choice {
  readonly move: Move;
  readonly iterations: number;
  readonly elapsedMs: number;
  /** How often the chosen move won in the search (null for a random move). */
  readonly winRate: number | null;
  readonly random: boolean;
}

/** The engine state a view stands for, enough to check the seat's own moves. */
function gameFromView(view: PlayerView): GameState {
  const hands: [readonly number[], readonly number[]] = [[], []];
  hands[view.seat] = view.hand;
  hands[1 - view.seat] = view.opponent.known;
  return {
    ...(view.rules ? { rules: view.rules } : {}),
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
  };
}

/** A uniformly random legal move, from the engine itself. */
function randomLegalMove(game: GameState, rng: Random): Move {
  if (game.phase === 'exchange') {
    const options = exchangeOptions(game);
    if (options.length === 0 || rng.int(2) === 0) return { type: 'pass' };
    const option = options[rng.int(options.length)] as (typeof options)[number];
    return { type: 'exchange', ...option };
  }
  const bids = legalBids(game);
  const bid = bids[rng.int(bids.length)];
  if (!bid) throw new Error('no legal bid');
  const takes = takeOptions(game, bid, false);
  return takes.length > 0
    ? { type: 'bid', ...bid, take: takes[rng.int(takes.length)] as number }
    : { type: 'bid', ...bid };
}

/**
 * Chooses the move for the seat whose view this is. The view holds only what that seat may see,
 * so the AI can never use the opponent's hidden cards; the search deals them at random instead.
 */
export function chooseMove(view: PlayerView, options: ChooseOptions): Choice {
  const started = performance.now();
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
  const rng = new Random(seed ^ 0x5bd1e995);
  const game = gameFromView(view);
  if (view.result !== null || view.phase === 'over') throw new Error('the game is over');
  if (view.toMove !== view.seat) throw new Error('not this seat’s turn');

  if ((options.randomMoveRate ?? 0) > 0 && rng.next() < (options.randomMoveRate ?? 0)) {
    return {
      move: randomLegalMove(game, rng),
      iterations: 0,
      elapsedMs: performance.now() - started,
      winRate: null,
      random: true,
    };
  }

  const knowledge = knowledgeFromView(view);
  const result = search(knowledge, {
    iterations: Math.max(1, Math.floor(options.iterations)),
    exploration: options.exploration ?? 0.7,
    epsilon: options.epsilon ?? 0.1,
    seed,
    exchangeLimit: 40,
    takeWidth: options.takeWidth ?? 0,
    deadline: options.deadline,
    shouldStop: options.shouldStop,
  });

  let take = result.take;
  if (kindOf(result.move) === K_BID && take === null) {
    // No sampled deal went on past the bid (the opponent could not answer it), or the search was
    // too short to reach the take: a card is still taken when the table has one.
    const after = knowledge.base.clone();
    after.apply(result.move);
    if (after.tableCount > 0) take = new Policy(rng, 0).bestTake(after);
  }
  let move = moveOfCode(view.hand, view.table, result.move, take);
  if (move.type === 'bid' && move.take === undefined) {
    // Defensive: a table card left after the bid must be taken.
    const left = takeOptions(game, move);
    if (left.length > 0) move = { ...move, take: left[0] as number };
  }
  const check = validateMove(game, view.seat, move);
  if (!check.ok) {
    // Never expected (the model is tested against the engine), but never send an illegal move.
    move = randomLegalMove(game, rng);
  }
  return {
    move,
    iterations: result.iterations,
    elapsedMs: performance.now() - started,
    winRate: result.winRate,
    random: !check.ok,
  };
}
