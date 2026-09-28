import {
  applyMove,
  newGame,
  randomMove,
  seededRng,
  validateMove,
  viewFor,
  type GameState,
} from '@cardauction/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AbortedError, AiPool, budgetShare, devWorkerUrl, PoolBrokenError } from '../src/pool.js';

/** Answers every search with a pass; crashes on 777 iterations, never answers 778. */
const fakeWorker = new URL('./fixtures/fake-worker.mjs', import.meta.url);

let pool: AiPool | null = null;

afterEach(async () => {
  await pool?.close();
  pool = null;
});

function midGame(seed: number): GameState {
  const rng = seededRng(seed);
  let state = newGame(rng);
  for (let i = 0; i < 3 && state.result === null; i++) {
    state = applyMove(state, state.toMove, randomMove(state, rng));
  }
  return state;
}

describe('the AI pool', () => {
  it('finds a legal move on a worker thread', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 5_000 });
    const state = midGame(1);
    const move = await pool.run(viewFor(state, state.toMove), {
      iterations: 300,
      randomMoveRate: 0,
    });
    expect(validateMove(state, state.toMove, move)).toEqual({ ok: true });
    expect(pool.stats()).toMatchObject({ searches: 1, failed: 0, running: 0, queued: 0 });
  });

  it('drops a queued search whose game ended, and stops a running one at once', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 30_000 });
    const state = midGame(2);
    const view = viewFor(state, state.toMove);
    const long = new AbortController();
    const queued = new AbortController();
    const running = pool.run(view, { iterations: 50_000_000, randomMoveRate: 0 }, long.signal);
    const waiting = pool.run(view, { iterations: 300, randomMoveRate: 0 }, queued.signal);
    const next = pool.run(view, { iterations: 300, randomMoveRate: 0 });
    expect(pool.stats()).toMatchObject({ running: 1, queued: 2 });

    queued.abort();
    await expect(waiting).rejects.toBeInstanceOf(AbortedError);
    expect(pool.stats().queued).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = performance.now();
    long.abort();
    await expect(running).rejects.toBeInstanceOf(AbortedError);
    // The thread is free again almost at once: the next search does not wait 30 s.
    const move = await next;
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(validateMove(state, state.toMove, move)).toEqual({ ok: true });
    // The stop flag was meant for the long search only: the next one ran its whole budget.
    expect(pool.stats()).toMatchObject({ aborted: 2, restarts: 0, searches: 1, iterations: 300 });
  });

  it('shrinks budgets as the queue grows', () => {
    expect(budgetShare(0)).toBe(1);
    expect(budgetShare(1)).toBe(0.5);
    expect(budgetShare(3)).toBe(0.25);
    expect(budgetShare(20)).toBe(0.25);
  });

  it('keeps to its time limit whatever the budget', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 400 });
    const state = midGame(3);
    const started = performance.now();
    const move = await pool.run(viewFor(state, state.toMove), {
      iterations: 50_000_000,
      randomMoveRate: 0,
    });
    expect(performance.now() - started).toBeLessThan(2_500);
    expect(validateMove(state, state.toMove, move)).toEqual({ ok: true });
  });

  it('counts the time spent in the queue against the time limit', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 1_000 });
    const state = midGame(5);
    const view = viewFor(state, state.toMove);
    const huge = { iterations: 50_000_000, randomMoveRate: 0 };
    const finished: number[] = [];
    const first = pool.run(view, huge).then(() => finished.push(performance.now()));
    const second = pool.run(view, huge).then(() => finished.push(performance.now()));
    await Promise.all([first, second]);
    // The second search waited about a second for the first, so it has almost no time left.
    const [a = 0, b = 0] = finished;
    expect(b - a).toBeLessThan(600);
  });

  it('gives up at once on threads that cannot start', async () => {
    // A worker script that does nothing: the thread ends as soon as it starts.
    pool = new AiPool({
      threads: 1,
      workerUrl: new URL('data:text/javascript,'),
      maxThinkMs: 5_000,
    });
    const state = midGame(6);
    const view = viewFor(state, state.toMove);
    const level = { iterations: 300, randomMoveRate: 0 };
    const started = performance.now();
    await expect(pool.run(view, level)).rejects.toThrow('AI thread exited');
    for (let i = 0; i < 250 && pool.stats().threads > 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(pool.stats()).toMatchObject({ threads: 0, restarts: 2 });
    await expect(pool.run(view, level)).rejects.toBeInstanceOf(PoolBrokenError);
    // No search waited for the safety timeout.
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it('gives up on threads that die as soon as they are ready, instead of restarting them forever', async () => {
    const script =
      "import { parentPort } from 'node:worker_threads';" +
      'parentPort.postMessage({ ready: true });' +
      'setTimeout(() => process.exit(1), 10);';
    pool = new AiPool({
      threads: 1,
      workerUrl: new URL(`data:text/javascript,${encodeURIComponent(script)}`),
      maxThinkMs: 5_000,
    });
    for (let i = 0; i < 250 && pool.stats().threads > 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(pool.stats()).toMatchObject({ threads: 0, restarts: 2 });
    const state = midGame(9);
    await expect(
      pool.run(viewFor(state, state.toMove), { iterations: 300, randomMoveRate: 0 }),
    ).rejects.toBeInstanceOf(PoolBrokenError);
  });

  it('replaces a thread that dies during a search, however often, and serves the next one', async () => {
    pool = new AiPool({ threads: 1, workerUrl: fakeWorker, maxThinkMs: 5_000 });
    const state = midGame(7);
    const view = viewFor(state, state.toMove);
    const normal = { iterations: 300, randomMoveRate: 0 };
    expect(await pool.run(view, normal)).toEqual({ type: 'pass' });
    for (let i = 0; i < 5; i++) {
      await expect(pool.run(view, { iterations: 777, randomMoveRate: 0 })).rejects.toThrow(
        'AI thread exited (3)',
      );
    }
    // Searches that crash their thread do not make the pool give up.
    expect(await pool.run(view, normal)).toEqual({ type: 'pass' });
    expect(pool.stats()).toMatchObject({ threads: 1, searches: 2, failed: 5, restarts: 5 });
  });

  it('replaces a thread that stops answering', async () => {
    pool = new AiPool({ threads: 1, workerUrl: fakeWorker, maxThinkMs: 200, stuckMs: 200 });
    const state = midGame(8);
    const view = viewFor(state, state.toMove);
    const started = performance.now();
    await expect(pool.run(view, { iterations: 778, randomMoveRate: 0 })).rejects.toThrow(
      'AI thread timed out',
    );
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(await pool.run(view, { iterations: 300, randomMoveRate: 0 })).toEqual({ type: 'pass' });
    expect(pool.stats()).toMatchObject({ threads: 1, searches: 1, failed: 1, restarts: 1 });
  });

  it('rejects what is left when it closes', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 30_000 });
    const state = midGame(4);
    const view = viewFor(state, state.toMove);
    const a = pool.run(view, { iterations: 50_000_000, randomMoveRate: 0 });
    const b = pool.run(view, { iterations: 300, randomMoveRate: 0 });
    const outcomes = [
      expect(a).rejects.toBeInstanceOf(AbortedError),
      expect(b).rejects.toBeInstanceOf(AbortedError),
    ];
    await pool.close();
    await Promise.all(outcomes);
    await expect(pool.run(view, { iterations: 1, randomMoveRate: 0 })).rejects.toThrow('closed');
    pool = null;
  });
});
