import { validateMove, type Move } from '@cardauction/engine';
import { AbortedError, AiPool, devWorkerUrl, PoolBrokenError } from '@cardauction/ai/pool';
import { fromWireSeat, stateFromView, type AiLevel, type WireView } from '@cardauction/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchAi } from '../src/ai.js';
import type { Logger } from '../src/logger.js';
import { closeAll, startedGame, startServer, TestClient, type TestServer } from './harness.js';

let t: TestServer | null = null;
let pool: AiPool | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  await closeAll(...clients.splice(0));
  await t?.close();
  await pool?.close();
  t = null;
  pool = null;
});

/** A real view from a game between two people, seen by the seat to move. */
async function someView(): Promise<WireView> {
  t = await startServer();
  const match = await startedGame(t);
  clients.push(match.p1, match.p2);
  const view = match.p1.view(match.gameId);
  return view.toMove === view.you.seat ? view : match.p2.view(match.gameId);
}

function isLegal(view: WireView, move: Move): boolean {
  return validateMove(stateFromView(view), fromWireSeat(view.toMove), move).ok;
}

/** Plays a whole game as P1 against the AI; the AI's moves are awaited on the real clock. */
async function playAgainstAi(server: TestServer, level: AiLevel): Promise<WireView> {
  const a = await TestClient.connect(server.url, { nickname: 'Ada' });
  clients.push(a);
  const started = await a.emit('lobby.ai.start', { level, seat: 'P1' });
  if (!started.ok) throw new Error(started.code);
  const { gameId } = started;
  await a.update(gameId, (u) => u.view.status === 'playing');
  for (let turn = 0; turn < 60 && a.view(gameId).status !== 'over'; turn++) {
    const view = a.view(gameId);
    if (view.toMove === 'P2') {
      server.clock.advance(0); // the AI starts at once; its move arrives when the search is done
      await a.update(gameId, (u) => u.version > view.version);
      continue;
    }
    expect((await a.playLegal(gameId)).ok).toBe(true);
    await a.update(gameId, (u) => u.version > view.version);
  }
  return a.view(gameId);
}

describe('the search AI', () => {
  it('holds its move back until at least the landing time', async () => {
    const view = await someView();
    const ai = new SearchAi({ minMoveMs: [300, 300] });
    const started = Date.now();
    const move = await ai.chooseMove(view, 'easy', new AbortController().signal);
    expect(Date.now() - started).toBeGreaterThanOrEqual(295);
    expect(isLegal(view, move)).toBe(true);
  });

  it('gives up at once when its game moves on while it waits', async () => {
    const view = await someView();
    const ai = new SearchAi({ minMoveMs: [5_000, 5_000] });
    const job = new AbortController();
    const started = Date.now();
    setTimeout(() => job.abort(), 100);
    await expect(ai.chooseMove(view, 'easy', job.signal)).rejects.toBeInstanceOf(AbortedError);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('falls back to a small search on the main thread when its thread fails', async () => {
    const view = await someView();
    const broken = { run: () => Promise.reject(new Error('thread crashed')) } as unknown as AiPool;
    const error = vi.fn();
    const ai = new SearchAi({
      pool: broken,
      logger: { error } as unknown as Logger,
      minMoveMs: [0, 0],
    });
    const move = await ai.chooseMove(view, 'hard', new AbortController().signal);
    expect(isLegal(view, move)).toBe(true);
    expect(error).toHaveBeenCalledOnce();
  });

  it('says once, not on every move, that its threads cannot start', async () => {
    const view = await someView();
    const down = new PoolBrokenError(new Error('AI thread exited (1)'));
    const broken = { run: () => Promise.reject(down) } as unknown as AiPool;
    const error = vi.fn();
    const ai = new SearchAi({
      pool: broken,
      logger: { error } as unknown as Logger,
      minMoveMs: [0, 0],
    });
    for (let i = 0; i < 3; i++) {
      const move = await ai.chooseMove(view, 'easy', new AbortController().signal);
      expect(isLegal(view, move)).toBe(true);
    }
    expect(error).toHaveBeenCalledOnce();
  });

  it('plays a whole game on the main thread', async () => {
    t = await startServer({ ai: new SearchAi({ minMoveMs: [0, 0] }) });
    const end = await playAgainstAi(t, 'hard');
    expect(end.status).toBe('over');
    expect(end.result?.reason).toBe('noLegalBid');
  });

  it('plays a whole game on a worker thread', async () => {
    pool = new AiPool({ threads: 1, workerUrl: devWorkerUrl(), maxThinkMs: 5_000 });
    t = await startServer({ ai: new SearchAi({ pool, minMoveMs: [0, 0] }) });
    const end = await playAgainstAi(t, 'medium');
    expect(end.status).toBe('over');
    expect(pool.stats()).toMatchObject({ failed: 0, restarts: 0, running: 0, queued: 0 });
    expect(pool.stats().searches).toBeGreaterThan(0);
  });
});
