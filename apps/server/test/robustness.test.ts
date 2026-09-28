import { randomUUID } from 'node:crypto';
import { findViolations, randomMove, seededRng, type Move } from '@cardauction/engine';
import { stateFromView, TIMING, type WireView } from '@cardauction/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiPlayer } from '../src/ai.js';
import {
  closeAll,
  quickMatch,
  startedGame,
  startServer,
  TestClient,
  until,
  type Match,
  type TestServer,
} from './harness.js';

let t: TestServer;
const clients: TestClient[] = [];

afterEach(async () => {
  await closeAll(...clients.splice(0));
  await until(() => t.server.players.count === 0);
  t.clock.advance(TIMING.lingerMs + 1);
  expect(t.server.sweep()).toBe(0);
  expect(t.server.metrics.reaperFixes).toBe(0);
  expect(t.server.games.size).toBe(0);
  expect(t.server.games.armedTimers).toBe(0);
  await t.close();
});

describe('fault isolation', () => {
  it('an exception inside one game aborts that game only', async () => {
    t = await startServer();
    const broken = await startedGame(t, ['Ada', 'Bob']);
    const healthy = await startedGame(t, ['Cy', 'Di']);
    clients.push(broken.p1, broken.p2, healthy.p1, healthy.p2);

    const game = t.server.games.get(broken.gameId);
    if (!game) throw new Error('missing game');
    game.state = { ...game.state, hands: null } as never; // a bug corrupts this game's state
    const reply = await broken.p2.playLegal(broken.gameId);
    expect(reply).toEqual({ ok: false, code: 'INTERNAL' });
    // Too broken to show a final view: both players are told the game is gone.
    for (const client of [broken.p1, broken.p2]) {
      expect(await client.take('game.cancelled')).toEqual({
        gameId: broken.gameId,
        reason: 'server-error',
      });
    }
    expect(t.server.games.get(broken.gameId)).toBeNull();
    expect(t.server.metrics.internalErrors).toBe(1);

    expect((await healthy.p2.playLegal(healthy.gameId)).ok).toBe(true);
    await healthy.p1.update(healthy.gameId, (u) => u.view.phase === 'firstBid');
  });

  it('an AI failure aborts its game and tells the player', async () => {
    const failing: AiPlayer = {
      thinkDelayMs: () => 1_000,
      chooseMove: () => Promise.reject(new Error('search crashed')),
    };
    t = await startServer({ ai: failing });
    const a = await TestClient.connect(t.url, { nickname: 'Ada' });
    clients.push(a);
    const started = await a.emit('lobby.ai.start', { level: 'medium', seat: 'P1' });
    if (!started.ok) throw new Error(started.code);
    t.clock.advance(1_000); // the AI (P2) starts thinking about its exchange, and fails
    const end = await a.update(started.gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: null, reason: 'aborted' });
  });
});

describe('many games at once', () => {
  it('random play with random drops and returns keeps every game sound and leaves nothing behind', async () => {
    t = await startServer();
    const rng = seededRng(2026);
    const matches: Match[] = [];
    for (let i = 0; i < 16; i++) {
      const match = await startedGame(t, [`A${i}`, `B${i}`]);
      clients.push(match.p1, match.p2);
      matches.push(match);
    }
    const ended = new Set<string>();
    for (let round = 0; round < 400 && ended.size < matches.length; round++) {
      for (const [index, { gameId, p1, p2 }] of matches.entries()) {
        // Games 3, 7, 11, 15: players who stop moving (the clock ends those games).
        // Games 2, 6, 10, 14: both players vanish for good (abandoned). The rest: random play
        // with random drops and returns.
        const idle = index % 4 === 3;
        const vanish = index % 4 === 2;
        const game = t.server.games.get(gameId);
        if (!game || game.status === 'over') {
          ended.add(gameId);
          continue;
        }
        expect(findViolations(game.state)).toEqual([]);
        const roll = rng.int(100);
        const [mover, other] = game.state.toMove === 0 ? [p1, p2] : [p2, p1];
        if (idle || vanish) {
          if (game.version >= 5) {
            if (vanish) await Promise.all([p1.disconnect(), p2.disconnect()]);
          } else if (mover.socket.connected) {
            await until(() => mover.views.get(gameId)?.version === game.version);
            const view = mover.view(gameId);
            expect((await send(mover, gameId, view, randomMove(stateFromView(view), rng))).ok).toBe(
              true,
            );
          }
        } else if (roll < 8 && other.socket.connected) {
          await other.disconnect();
        } else if (roll < 25 && !other.socket.connected) {
          await other.reconnect();
        } else if (roll < 33 && mover.socket.connected) {
          await mover.disconnect();
        } else if (!mover.socket.connected) {
          if (roll < 55) await mover.reconnect();
        } else if (roll < 85) {
          await until(() => mover.views.get(gameId)?.version === game.version);
          const view = mover.view(gameId);
          const reply = await send(mover, gameId, view, randomMove(stateFromView(view), rng));
          expect(reply.ok).toBe(true);
        } // otherwise the mover thinks, and the clock may run out
      }
      if (round % 5 === 4) t.clock.advance(rng.int(45_000));
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(ended.size).toBe(matches.length);
    const reasons = t.server.metrics.ended;
    expect(Object.values(reasons).reduce((a, b) => a + b, 0)).toBe(matches.length);
    // The run covers every way a game ends on its own.
    for (const reason of ['noLegalBid', 'timeout', 'forfeit', 'abandoned'] as const) {
      expect(reasons[reason]).toBeGreaterThan(0);
    }
    expect(t.server.metrics.internalErrors).toBe(0);
  });
});

describe('HTTP endpoints', () => {
  it('serves the health check openly, metrics and admin behind their tokens', async () => {
    t = await startServer({
      config: { metricsToken: 'm'.repeat(20), adminToken: 'a'.repeat(20) },
    });
    const health = await fetch(`${t.url}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', draining: false });

    expect((await fetch(`${t.url}/metrics`)).status).toBe(401);
    const metrics = await fetch(`${t.url}/metrics`, {
      headers: { authorization: `Bearer ${'m'.repeat(20)}` },
    });
    expect(await metrics.json()).toMatchObject({ games: { playing: 0 }, players: 0 });

    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const admin = { authorization: `Bearer ${'a'.repeat(20)}` };
    expect((await fetch(`${t.url}/admin/games/${gameId}/abort`, { method: 'POST' })).status).toBe(
      401,
    );
    const aborted = await fetch(`${t.url}/admin/games/${gameId}/abort`, {
      method: 'POST',
      headers: admin,
    });
    expect(await aborted.json()).toEqual({ aborted: true });
    const end = await p1.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result?.reason).toBe('aborted');

    await fetch(`${t.url}/admin/drain?on=true`, { method: 'POST', headers: admin });
    expect(await p1.emit('lobby.quick.join', {})).toEqual({ ok: false, code: 'DRAINING' });
    await fetch(`${t.url}/admin/drain?on=false`, { method: 'POST', headers: admin });
  });

  it('has no metrics or admin endpoints without tokens', async () => {
    t = await startServer();
    expect((await fetch(`${t.url}/metrics`)).status).toBe(404);
    expect((await fetch(`${t.url}/admin/status`)).status).toBe(404);
  });
});

describe('the reaper', () => {
  it('takes over an overdue deadline without leaving a second timer behind', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const game = t.server.games.get(gameId);
    if (!game) throw new Error('missing game');
    const before = t.clock.pending; // the game's timer, the reaper and the metrics log
    game.turnDeadline = t.clock.now() - 10_000; // as after a long stall of the event loop
    expect(t.server.sweep()).toBeGreaterThan(0);
    // P2's overdue exchange became a pass; the game still has exactly one timer.
    expect(game.state.phase).toBe('firstBid');
    expect(t.clock.pending).toBe(before);
    t.clock.advance(TIMING.turnMs);
    expect(t.clock.pending).toBe(before);
    t.server.metrics.reaperFixes = 0; // expected here; the shared checks require zero
  });

  it('repairs a game whose timer was lost, and counts it as a bug', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await quickMatch(t);
    clients.push(p1, p2);
    const game = t.server.games.get(gameId);
    if (!game) throw new Error('missing game');
    t.clock.clearTimeout(game.timer); // simulate a lost timer
    game.timer = null;
    t.clock.advance(TIMING.startHandshakeMs + TIMING.reaperIntervalMs);
    expect(t.server.metrics.reaperFixes).toBeGreaterThan(0);
    await p1.take('game.cancelled');
    expect(t.server.games.get(gameId)).toBeNull();
    t.server.metrics.reaperFixes = 0; // expected here; the shared checks require zero
  });
});

function send(
  client: TestClient,
  gameId: string,
  view: WireView,
  move: Move,
): Promise<{ ok: boolean }> {
  const base = { gameId, cmdId: randomUUID(), expectedVersion: view.version };
  switch (move.type) {
    case 'pass':
      return client.emit('game.exchange', base);
    case 'exchange':
      return client.emit('game.exchange', { ...base, give: move.give, take: move.take });
    case 'bid':
      return client.emit('game.turn', {
        ...base,
        tens: move.tens,
        units: move.units,
        ...(move.action ? { action: move.action } : {}),
        ...(move.take !== undefined ? { take: move.take } : {}),
      });
  }
}
