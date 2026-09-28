import type { Move, PlayerView } from '@cardauction/engine';
import { parentPort, workerData } from 'node:worker_threads';
import { chooseMove } from './index.js';

/**
 * The AI's worker thread. It takes one search at a time from the pool and answers with the move.
 * The pool asks it to stop by writing the job's id into a shared flag, which the search polls.
 */

export interface WorkerRequest {
  readonly id: number;
  readonly view: PlayerView;
  readonly iterations: number;
  readonly randomMoveRate: number;
  readonly seed: number;
  /** Stop after this long even if the iterations are not done (keeping the best move). */
  readonly maxMs: number;
}

export type WorkerReply =
  | {
      readonly id: number;
      readonly ok: true;
      readonly move: Move;
      readonly iterations: number;
      readonly elapsedMs: number;
      readonly winRate: number | null;
      readonly random: boolean;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };

/** What the thread sends: once `ready` when it listens, then one reply per request. */
export type WorkerMessage = WorkerReply | { readonly ready: true };

/**
 * Answers the pool's requests on this worker thread, one search at a time. The worker entry
 * calls it (an explicit call, so no bundler can drop the worker as an unused import).
 */
export function serveSearches(): void {
  const port = parentPort;
  if (!port) throw new Error('the AI worker must run in a worker thread');
  const stop = new Int32Array(workerData as SharedArrayBuffer);
  port.on('message', (request: WorkerRequest) => {
    let reply: WorkerReply;
    try {
      const choice = chooseMove(request.view, {
        iterations: request.iterations,
        randomMoveRate: request.randomMoveRate,
        seed: request.seed,
        deadline: performance.now() + request.maxMs,
        shouldStop: () => Atomics.load(stop, 0) === request.id,
      });
      reply = { id: request.id, ok: true, ...choice };
    } catch (error) {
      reply = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    port.postMessage(reply);
  });
  port.postMessage({ ready: true } satisfies WorkerMessage);
}
