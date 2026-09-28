import { chooseMove, LEVELS, type ChooseOptions } from '@cardauction/ai';
import { AbortedError, PoolBrokenError, type AiPool } from '@cardauction/ai/pool';
import { cryptoRng, randomMove, type Move, type Rng } from '@cardauction/engine';
import {
  playerViewFromWire,
  stateFromView,
  type AiLevel,
  type WireView,
} from '@cardauction/protocol';
import type { Logger } from './logger.js';

/**
 * The server's AI opponent. It receives only its own seat's view, exactly like a human client,
 * so it can never peek at hidden cards.
 */
export interface AiPlayer {
  /** How long to wait before thinking, so moves do not land instantly. */
  thinkDelayMs(level: AiLevel): number;
  chooseMove(view: WireView, level: AiLevel, signal: AbortSignal): Promise<Move>;
}

/** A random legal move after a short pause: for tests that only need an opponent. */
export class RandomAi implements AiPlayer {
  constructor(private readonly rng: Rng = cryptoRng()) {}

  thinkDelayMs(): number {
    return 600 + this.rng.int(900);
  }

  chooseMove(view: WireView): Promise<Move> {
    return Promise.resolve(randomMove(stateFromView(view), this.rng));
  }
}

export interface SearchAiOptions {
  /** Runs the searches off the main thread; without it they run inline (tests, AI_THREADS=0). */
  readonly pool?: AiPool | undefined;
  readonly logger?: Logger | undefined;
  /** The AI's move lands no sooner than this after the move it answers (a range, in ms). */
  readonly minMoveMs?: readonly [number, number];
  readonly rng?: Rng;
}

/**
 * The real AI: information set Monte Carlo tree search, at the level of the game. The search
 * starts at once and its move is held back until at least 0.8–1.5 s after the player's move, so
 * a person can follow it. If the thread fails, a small search on the main thread keeps the game
 * going.
 */
export class SearchAi implements AiPlayer {
  private readonly minMoveMs: readonly [number, number];
  private readonly rng: Rng;
  private threadsDown = false;

  constructor(private readonly options: SearchAiOptions = {}) {
    this.minMoveMs = options.minMoveMs ?? [800, 1500];
    this.rng = options.rng ?? cryptoRng();
  }

  thinkDelayMs(): number {
    return 0;
  }

  async chooseMove(view: WireView, level: AiLevel, signal: AbortSignal): Promise<Move> {
    const started = Date.now();
    const [low, high] = this.minMoveMs;
    const landAt = started + low + this.rng.int(Math.max(1, high - low + 1));
    const perspective = playerViewFromWire(view);
    let move: Move;
    const pool = this.options.pool;
    if (pool) {
      try {
        move = await pool.run(perspective, LEVELS[level], signal);
      } catch (error) {
        if (error instanceof AbortedError || signal.aborted) throw error;
        this.report(error, view.gameId);
        move = chooseMove(perspective, fallback(level)).move;
      }
    } else {
      move = chooseMove(perspective, LEVELS[level]).move;
    }
    const wait = landAt - Date.now();
    if (wait > 0) await sleep(wait, signal);
    return move;
  }

  private report(error: unknown, gameId: string): void {
    const logger = this.options.logger;
    if (!(error instanceof PoolBrokenError)) {
      logger?.error({ err: error, gameId }, 'AI thread failed: a small search on the main thread');
    } else if (!this.threadsDown) {
      // Said once: from now on every AI move is a small search on the main thread.
      this.threadsDown = true;
      logger?.error({ err: error }, 'AI threads cannot start: small searches on the main thread');
    }
  }
}

/**
 * The search on the main thread when the AI's thread fails: the level's own character (Easy
 * still slips) at no more than 200 iterations, a few milliseconds that do not hold up the server.
 */
function fallback(level: AiLevel): ChooseOptions {
  const { iterations, randomMoveRate } = LEVELS[level];
  return { iterations: Math.min(200, iterations), randomMoveRate };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
