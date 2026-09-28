import { EXCHANGE, K_TAKE, kindOf, OVER, State, TAKE, type Knowledge } from './model.js';
import { Policy, rankedExchanges } from './policy.js';
import { Random } from './random.js';

/**
 * Single-observer information set Monte Carlo tree search (Cowling, Powley and Whitehouse, 2012).
 * Each iteration deals the opponent's hidden cards at random from the unseen pool, walks the one
 * shared tree along moves that are legal in that deal, adds one node, plays the rest of the game
 * with the playout policy and credits the winner. A turn is two levels of the tree: the bid, then
 * the card taken. Selection is UCB1 with availability counts, since the opponent's legal moves
 * change from one deal to the next.
 */

export interface SearchConfig {
  readonly iterations: number;
  /** UCB1 exploration constant. */
  readonly exploration: number;
  /** Share of random moves in playouts. */
  readonly epsilon: number;
  readonly seed: number;
  /** P2's exchange: how many swaps (best by the heuristic) the search considers, besides passing. */
  readonly exchangeLimit: number;
  /** Takes considered in the tree below this seat's own first take (0: all of them). */
  readonly takeWidth: number;
  /** Stop early at this time (performance.now()), keeping the best move so far. */
  readonly deadline?: number | undefined;
  /** Polled every few iterations: true stops the search (the game ended meanwhile). */
  readonly shouldStop?: (() => boolean) | undefined;
}

export interface SearchResult {
  /** The chosen move of the root position (a bid, an exchange or a pass). */
  readonly move: number;
  /** After a bid: the tree's card to take, when some sampled deal went on past the bid (else null). */
  readonly take: number | null;
  readonly iterations: number;
  /** The chosen move's share of wins in the search. */
  readonly winRate: number;
}

class Node {
  visits = 0;
  wins = 0;
  /** How often this move was legal when its parent was visited. */
  available = 0;
  readonly children = new Map<number, Node>();

  constructor(
    readonly move: number,
    /** The player who made `move`, credited with the wins below it. */
    readonly player: number,
  ) {}
}

export function search(knowledge: Knowledge, config: SearchConfig): SearchResult {
  const { base, unseen, hidden, seat } = knowledge;
  if (base.phase === OVER || base.toMove !== seat) throw new Error('not this seat’s turn');
  const opponent = 1 - seat;
  const rng = new Random(config.seed);
  const policy = new Policy(rng, config.epsilon);
  const pool = Uint8Array.from(unseen);
  const work = new State();
  const moves = new Int32Array(4096);
  const untried = new Int32Array(4096);
  const path: Node[] = [];

  // The root's moves never depend on the deal: they are this seat's own.
  const rootMoves =
    base.phase === EXCHANGE
      ? Int32Array.from(rankedExchanges(base, config.exchangeLimit))
      : moves.slice(0, base.legalMoves(moves));
  const root = new Node(0, opponent);

  const deal = (s: State): void => {
    // A partial Fisher–Yates over the pool, which stays a permutation of the same cards.
    let length = pool.length;
    for (let k = 0; k < hidden; k++) {
      const j = rng.int(length);
      const face = pool[j]!;
      length--;
      pool[j] = pool[length]!;
      pool[length] = face;
      s.add(opponent, face);
    }
  };

  const c = config.exploration;
  let iterations = 0;
  for (; iterations < config.iterations; iterations++) {
    if ((iterations & 31) === 0 && iterations > 0) {
      if (config.deadline !== undefined && performance.now() >= config.deadline) break;
      if (config.shouldStop?.()) break;
    }
    work.copyFrom(base);
    deal(work);
    let node = root;
    path.length = 0;
    let expanded = false;
    while (work.phase !== OVER) {
      let n: number;
      let list: Int32Array;
      if (node === root) {
        list = rootMoves;
        n = rootMoves.length;
      } else if (work.phase === TAKE && path.length > 1 && config.takeWidth > 0) {
        list = moves;
        n = policy.topTakes(work, config.takeWidth, moves);
      } else {
        list = moves;
        n = work.legalMoves(moves);
      }
      let open = 0;
      for (let i = 0; i < n; i++) {
        const child = node.children.get(list[i]!);
        if (child) child.available++;
        else untried[open++] = list[i]!;
      }
      if (open > 0) {
        const move = untried[rng.int(open)]!;
        const child = new Node(move, work.toMove);
        child.available = 1;
        node.children.set(move, child);
        work.apply(move);
        path.push(child);
        expanded = true;
        break;
      }
      let best: Node | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < n; i++) {
        const child = node.children.get(list[i]!) as Node;
        const score =
          child.wins / child.visits + c * Math.sqrt(Math.log(child.available) / child.visits);
        if (score > bestScore) {
          bestScore = score;
          best = child;
        }
      }
      if (!best) break;
      work.apply(best.move);
      path.push(best);
      node = best;
    }
    const winner = expanded || work.phase !== OVER ? policy.playout(work) : work.winner;
    root.visits++;
    for (const n of path) {
      n.visits++;
      if (n.player === winner) n.wins++;
    }
  }

  const choice = mostVisited(root);
  if (!choice) throw new Error('the search found no move');
  // The card to take after the chosen bid: the tree's most-visited take below it. There is none
  // when no sampled deal went on past the bid (the caller then picks one).
  const after = mostVisited(choice);
  const take = after && kindOf(after.move) === K_TAKE ? after.move : null;
  return {
    move: choice.move,
    take,
    iterations,
    winRate: choice.visits > 0 ? choice.wins / choice.visits : 0,
  };
}

function mostVisited(node: Node): Node | null {
  let best: Node | null = null;
  for (const child of node.children.values()) {
    if (
      !best ||
      child.visits > best.visits ||
      (child.visits === best.visits && child.wins > best.wins)
    ) {
      best = child;
    }
  }
  return best;
}
