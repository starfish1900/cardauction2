import type { Move, PlayerView } from '@cardauction/engine';
import { Worker } from 'node:worker_threads';
import type { LevelConfig } from './index.js';
import type { WorkerMessage, WorkerReply, WorkerRequest } from './worker.js';

/**
 * Runs AI searches on worker threads, off the server's main thread. One thread suits Render's
 * small instances, where the AI games take turns on it; bigger machines can use more. Searches
 * wait in a queue, and the longer the queue, the smaller each budget: under load the AI plays a
 * little weaker rather than slower. The time limit counts from the request, so time spent in the
 * queue comes out of the search. A search whose game ends is stopped at once through a shared
 * flag, without killing the thread.
 *
 * A thread that dies or stops answering is replaced. A death during a search is that search's
 * problem; a thread that dies before it is ready, or while idle, cannot run at all (a broken build,
 * say). After a few of those in a row with no search answered, the pool gives up: every search
 * then fails at once with {@link PoolBrokenError}, so the server can fall back and say so in its
 * logs instead of waiting on threads that never answer, or restarting them forever.
 */

export interface PoolOptions {
  readonly threads: number;
  /** The worker script: the bundled ai-worker.js, or {@link devWorkerUrl} from the sources. */
  readonly workerUrl: URL;
  /** Longest wait for a move, queue included, whatever the budget. */
  readonly maxThinkMs: number;
  /** Memory cap per thread. */
  readonly maxOldGenerationSizeMb?: number;
  /** A thread still silent this long after its search's time limit is replaced (default 10 s). */
  readonly stuckMs?: number;
}

export interface PoolStats {
  /** Threads running (0 once the pool has given up). */
  readonly threads: number;
  readonly queued: number;
  readonly running: number;
  readonly searches: number;
  readonly iterations: number;
  readonly thinkMs: number;
  readonly aborted: number;
  readonly failed: number;
  readonly restarts: number;
}

/** A search that waited in the queue past its time limit still gets this long. */
export const MIN_SEARCH_MS = 50;

/** Threads in a row that may die before they are ready or while idle, before the pool gives up. */
const MAX_START_FAILURES = 3;

export class AbortedError extends Error {
  constructor() {
    super('the search was stopped');
    this.name = 'AbortedError';
  }
}

/** The pool gave up: its threads cannot start. */
export class PoolBrokenError extends Error {
  constructor(cause: Error) {
    super(`the AI threads cannot start (${cause.message})`);
    this.name = 'PoolBrokenError';
  }
}

interface Job {
  readonly id: number;
  readonly view: PlayerView;
  readonly level: LevelConfig;
  readonly seed: number;
  readonly queuedAt: number;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (move: Move) => void;
  readonly reject: (error: Error) => void;
  onAbort?: () => void;
}

interface Slot {
  readonly worker: Worker;
  readonly stop: Int32Array;
  /** The thread has started and listens for searches. */
  ready: boolean;
  job: Job | null;
  timer: NodeJS.Timeout | null;
}

/** The worker bootstrap that loads the TypeScript sources (development, tests). */
export function devWorkerUrl(): URL {
  return new URL('./worker-dev.mjs', import.meta.url);
}

/** Share of the budget a search gets with `waiting` searches queued behind it. */
export function budgetShare(waiting: number): number {
  return Math.max(0.25, 1 / (1 + waiting));
}

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export class AiPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private readonly threads: number;
  private nextId = 1;
  private closed = false;
  private startFailures = 0;
  private broken: PoolBrokenError | null = null;
  private counters = { searches: 0, iterations: 0, thinkMs: 0, aborted: 0, failed: 0, restarts: 0 };

  constructor(private readonly options: PoolOptions) {
    this.threads = Math.max(1, options.threads);
    this.fill(false, new Error('no thread started'));
  }

  /** Starts threads up to the pool's size, unless too many have failed to start. */
  private fill(restart: boolean, cause: Error): void {
    while (this.slots.length < this.threads && this.startFailures < MAX_START_FAILURES) {
      try {
        this.slots.push(this.spawn());
        if (restart) this.counters.restarts++;
      } catch (error) {
        // new Worker() itself can fail, for instance when memory is short.
        this.startFailures++;
        cause = asError(error);
      }
    }
    if (this.slots.length === 0) this.giveUp(cause);
  }

  private spawn(): Slot {
    const buffer = new SharedArrayBuffer(4);
    const worker = new Worker(this.options.workerUrl, {
      workerData: buffer,
      resourceLimits: { maxOldGenerationSizeMb: this.options.maxOldGenerationSizeMb ?? 96 },
    });
    const slot: Slot = {
      worker,
      stop: new Int32Array(buffer),
      ready: false,
      job: null,
      timer: null,
    };
    worker.on('message', (message: WorkerMessage) => {
      if ('ready' in message) slot.ready = true;
      else this.finish(slot, message);
    });
    worker.on('error', (error: Error) => this.crashed(slot, error));
    // A thread never ends on its own: any exit before close() is a crash.
    worker.on('exit', (code) => {
      if (!this.closed) this.crashed(slot, new Error(`AI thread exited (${code})`));
    });
    // An idle thread does not keep the process alive; one with a search does (see dispatch).
    worker.unref();
    return slot;
  }

  /**
   * Finds a move for the seat whose view this is. Rejects with {@link AbortedError} when `signal`
   * fires first (the game ended or moved on), and with {@link PoolBrokenError} once the pool has
   * given up on its threads.
   */
  run(view: PlayerView, level: LevelConfig, signal?: AbortSignal, seed?: number): Promise<Move> {
    if (this.closed) return Promise.reject(new Error('the AI pool is closed'));
    if (this.broken) return Promise.reject(this.broken);
    if (signal?.aborted) return Promise.reject(new AbortedError());
    return new Promise<Move>((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        view,
        level,
        seed: seed ?? Math.floor(Math.random() * 2 ** 31),
        queuedAt: performance.now(),
        signal,
        resolve,
        reject,
      };
      if (signal) {
        job.onAbort = () => this.abort(job);
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      this.queue.push(job);
      this.dispatch();
    });
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.job || this.queue.length === 0) continue;
      const job = this.queue.shift() as Job;
      slot.job = job;
      const share = budgetShare(this.queue.length);
      const waited = performance.now() - job.queuedAt;
      const request: WorkerRequest = {
        id: job.id,
        view: job.view,
        iterations: Math.max(50, Math.floor(job.level.iterations * share)),
        randomMoveRate: job.level.randomMoveRate,
        seed: job.seed,
        maxMs: Math.max(MIN_SEARCH_MS, this.options.maxThinkMs - waited),
      };
      // A thread that stops answering is replaced.
      slot.timer = setTimeout(
        () => this.crashed(slot, new Error('AI thread timed out')),
        request.maxMs + (this.options.stuckMs ?? 10_000),
      );
      slot.timer.unref();
      slot.worker.ref();
      slot.worker.postMessage(request);
    }
  }

  private abort(job: Job): void {
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    else {
      // The thread stays busy until the search sees the flag and answers.
      const slot = this.slots.find((s) => s.job === job);
      if (slot) Atomics.store(slot.stop, 0, job.id);
    }
    this.counters.aborted++;
    job.reject(new AbortedError());
  }

  private settle(slot: Slot): Job | null {
    const job = slot.job;
    slot.job = null;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.worker.unref();
    if (job) forget(job);
    return job;
  }

  private finish(slot: Slot, reply: WorkerReply): void {
    if (slot.job?.id !== reply.id) return;
    const job = this.settle(slot) as Job;
    // The threads work: failures to start count again from zero.
    if (reply.ok) this.startFailures = 0;
    if (!job.signal?.aborted) {
      if (reply.ok) {
        this.counters.searches++;
        this.counters.iterations += reply.iterations;
        this.counters.thinkMs += reply.elapsedMs;
        job.resolve(reply.move);
      } else {
        this.counters.failed++;
        job.reject(new Error(reply.error));
      }
    }
    this.dispatch();
  }

  private crashed(slot: Slot, error: Error): void {
    const searching = slot.job !== null;
    const job = this.settle(slot);
    if (job && !job.signal?.aborted) {
      this.counters.failed++;
      job.reject(error);
    }
    if (this.closed) return;
    // An error is followed by an exit: the second report finds the slot already gone.
    const index = this.slots.indexOf(slot);
    if (index < 0) return;
    this.slots.splice(index, 1);
    void slot.worker.terminate();
    // Dying during a search is that search's problem; dying before being ready, or idle, is the
    // thread's.
    if (!slot.ready || !searching) this.startFailures++;
    this.fill(true, error);
    this.dispatch();
  }

  private giveUp(cause: Error): void {
    this.broken = new PoolBrokenError(cause);
    for (const job of this.queue.splice(0)) {
      forget(job);
      this.counters.failed++;
      job.reject(this.broken);
    }
  }

  stats(): PoolStats {
    return {
      threads: this.slots.length,
      queued: this.queue.length,
      running: this.slots.filter((s) => s.job).length,
      ...this.counters,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      forget(job);
      job.reject(new AbortedError());
    }
    await Promise.all(
      this.slots.map(async (slot) => {
        const job = this.settle(slot);
        job?.reject(new AbortedError());
        await slot.worker.terminate();
      }),
    );
  }
}

/** Stops listening for the job's abort signal. */
function forget(job: Job): void {
  if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort);
}
