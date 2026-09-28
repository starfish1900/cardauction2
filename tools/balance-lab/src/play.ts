import { chooseMove, LEVELS, type Level } from '@cardauction/ai';
import {
  applyMove,
  newGame,
  randomMove,
  seededRng,
  STANDARD_RULES,
  viewFor,
  type EndReason,
  type GameState,
  type Move,
  type RuleSet,
  type Seat,
} from '@cardauction/engine';

export type PlayerSpec =
  | { readonly name: string; readonly kind: 'random' }
  | {
      readonly name: string;
      readonly kind: 'search';
      readonly iterations: number;
      readonly randomMoveRate: number;
      readonly exploration?: number;
      readonly epsilon?: number;
      readonly takeWidth?: number;
    };

/**
 * "random", a level ("easy", "medium", "hard"), or "search:<iterations>" with optional settings:
 * "search:4000:c=0.5:eps=0.2:random=0.1".
 */
export function parsePlayer(text: string): PlayerSpec {
  if (text === 'random') return { name: text, kind: 'random' };
  if (text in LEVELS) return { name: text, kind: 'search', ...LEVELS[text as Level] };
  const [head, iterations, ...settings] = text.split(':');
  const n = Number(iterations);
  if (head !== 'search' || !Number.isInteger(n) || n < 1) {
    throw new Error(`unknown player "${text}": random, easy, medium, hard or search:<iterations>`);
  }
  let spec: PlayerSpec = { name: text, kind: 'search', iterations: n, randomMoveRate: 0 };
  for (const setting of settings) {
    const [key, value] = setting.split('=');
    const x = Number(value);
    if (!Number.isFinite(x)) throw new Error(`bad setting "${setting}" in "${text}"`);
    if (key === 'c') spec = { ...spec, exploration: x };
    else if (key === 'eps') spec = { ...spec, epsilon: x };
    else if (key === 'random') spec = { ...spec, randomMoveRate: x };
    else if (key === 'tw') spec = { ...spec, takeWidth: x };
    else throw new Error(`unknown setting "${key}" in "${text}": c, eps, random or tw`);
  }
  return spec;
}

/** "exchange=false,distinctSuits=true,handSize=12" over the standard rules. */
export function parseRules(text: string | undefined): RuleSet | undefined {
  if (!text) return undefined;
  const rules: Record<string, boolean | number> = { ...STANDARD_RULES };
  for (const part of text.split(',')) {
    const [key, value] = part.split('=');
    if (!key || !(key in STANDARD_RULES)) {
      throw new Error(`unknown rule "${key}": ${Object.keys(STANDARD_RULES).join(', ')}`);
    }
    const standard = STANDARD_RULES[key as keyof RuleSet];
    if (typeof standard === 'boolean') {
      if (value !== 'true' && value !== 'false') throw new Error(`${key} is true or false`);
      rules[key] = value === 'true';
    } else {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${key} is a whole number`);
      rules[key] = n;
    }
  }
  return rules as unknown as RuleSet;
}

export interface GameRecord {
  readonly deal: number;
  readonly aSeat: Seat;
  /** 'A', 'B', or '-' when nobody won. */
  readonly winner: 'A' | 'B' | '-';
  readonly winnerSeat: Seat | null;
  readonly reason: EndReason;
  readonly bids: number;
  /** P2's opening: 'exchange', 'pass', or '' when the rules have no exchange. */
  readonly opening: 'exchange' | 'pass' | '';
  readonly firstBidTableAction: boolean;
  /** Bids made with an action card. */
  readonly actionBids: number;
  /** Bids made after the table ran dry (no card left to take). */
  readonly dryBids: number;
  readonly tableEmptyAtEnd: boolean;
  readonly thinkMsA: number;
  readonly movesA: number;
  readonly thinkMsB: number;
  readonly movesB: number;
  readonly maxThinkMs: number;
}

function decide(spec: PlayerSpec, state: GameState, seat: Seat, seed: number): Move {
  if (spec.kind === 'random') return randomMove(state, seededRng(seed));
  // The AI sees only its own seat's view, exactly as on the server.
  return chooseMove(viewFor(state, seat), {
    iterations: spec.iterations,
    randomMoveRate: spec.randomMoveRate,
    seed,
    ...(spec.exploration !== undefined ? { exploration: spec.exploration } : {}),
    ...(spec.epsilon !== undefined ? { epsilon: spec.epsilon } : {}),
    ...(spec.takeWidth !== undefined ? { takeWidth: spec.takeWidth } : {}),
  }).move;
}

/** One game on deal `deal`, player A in seat `aSeat`; every move goes through the engine. */
export function playGame(
  deal: number,
  aSeat: Seat,
  a: PlayerSpec,
  b: PlayerSpec,
  rules: RuleSet | undefined,
): GameRecord {
  let state = newGame(seededRng(deal), rules);
  let opening: GameRecord['opening'] = '';
  let firstBidTableAction = false;
  let actionBids = 0;
  let dryBids = 0;
  const think: [number, number] = [0, 0];
  const moves: [number, number] = [0, 0];
  let maxThinkMs = 0;
  for (let turn = 0; state.result === null; turn++) {
    const seat = state.toMove;
    const spec = seat === aSeat ? a : b;
    const started = performance.now();
    const move = decide(spec, state, seat, (deal * 2 + aSeat) * 1000 + turn);
    const ms = performance.now() - started;
    think[seat === aSeat ? 0 : 1] += ms;
    moves[seat === aSeat ? 0 : 1] += 1;
    maxThinkMs = Math.max(maxThinkMs, ms);
    if (state.phase === 'exchange') opening = move.type === 'exchange' ? 'exchange' : 'pass';
    if (move.type === 'bid') {
      if (move.action) {
        actionBids++;
        if (state.phase === 'firstBid' && state.table.includes(move.action.card)) {
          firstBidTableAction = true;
        }
      }
      if (move.take === undefined) dryBids++;
    }
    state = applyMove(state, seat, move);
  }
  const winnerSeat = state.result.winner;
  return {
    deal,
    aSeat,
    winner: winnerSeat === null ? '-' : winnerSeat === aSeat ? 'A' : 'B',
    winnerSeat,
    reason: state.result.reason,
    bids: state.bids.length - 1,
    opening,
    firstBidTableAction,
    actionBids,
    dryBids,
    tableEmptyAtEnd: state.table.length === 0,
    thinkMsA: think[0] ?? 0,
    movesA: moves[0] ?? 0,
    thinkMsB: think[1] ?? 0,
    movesB: moves[1] ?? 0,
    maxThinkMs,
  };
}
