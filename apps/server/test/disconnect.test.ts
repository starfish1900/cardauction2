import { randomMove, seededRng, type Move } from '@cardauction/engine';
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
  type TestServer,
} from './harness.js';

/**
 * The plan's table of connection situations, one test per row: this is milestone M1's gate.
 * Time only moves when a test advances the manual clock.
 */

let t: TestServer;
const clients: TestClient[] = [];

afterEach(async () => {
  await closeAll(...clients.splice(0));
  // Nothing may be left behind: no game, no timer, no index entry.
  await until(() => t.server.players.count === 0);
  t.clock.advance(TIMING.lingerMs + 1);
  expect(t.server.sweep()).toBe(0);
  expect(t.server.metrics.reaperFixes).toBe(0);
  expect(t.server.games.size).toBe(0);
  expect(t.server.games.armedTimers).toBe(0);
  await t.close();
});

async function gone(client: TestClient): Promise<void> {
  await client.disconnect();
  await until(() => !t.server.players.isConnected(client.playerId));
}

describe('disconnects and zombie games', () => {
  it('A closes the tab and B stays: A forfeits after 25 s; the game goes after 60 s on the result screen', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);

    await gone(a);
    const away = await b.take('game.presence');
    expect(away).toMatchObject({ seat: 'P1', connected: false });
    expect(away.graceDeadline).toBe(t.clock.now() + TIMING.graceMs);

    t.clock.advance(TIMING.graceMs - 1);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    t.clock.advance(1);
    const end = await b.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P2', reason: 'forfeit' });
    expect(end.events.at(-1)).toMatchObject({ type: 'end', winner: 'P2', reason: 'forfeit' });

    // B keeps the result screen for 60 s, then the game is deleted.
    t.clock.advance(TIMING.lingerMs - 1);
    expect(t.server.games.get(gameId)).not.toBeNull();
    t.clock.advance(1);
    expect(t.server.games.get(gameId)).toBeNull();

    // A late return learns the result from the tombstone.
    const back = await a.reconnect();
    expect(back.ok && back.endedGame).toEqual({
      gameId,
      seat: 'P1',
      winner: 'P2',
      reason: 'forfeit',
    });
    expect(back.ok && back.activeGameId).toBeFalsy();
  });

  it('the game is deleted as soon as B leaves the result screen', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    await gone(a);
    t.clock.advance(TIMING.graceMs);
    await b.update(gameId, (u) => u.view.status === 'over');
    expect((await b.emit('game.leave', { gameId })).ok).toBe(true);
    expect(t.server.games.get(gameId)).toBeNull();
  });

  it('A drops and returns 20 s later: play resumes with the full current view', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);

    await gone(a);
    await b.take('game.presence', (p) => !p.connected);
    t.clock.advance(20_000);

    const back = await a.reconnect();
    expect(back.ok && back.activeGameId).toBe(gameId);
    const sync = await a.update(gameId);
    expect(sync.sync).toBe(true);
    expect(sync.view.status).toBe('playing');
    expect(sync.view.you.hand).toHaveLength(13);
    expect(sync.events.map((e) => e.type)).toEqual(['start']);
    const present = await b.take('game.presence', (p) => p.connected);
    expect(present.graceDeadline).toBeNull();

    // The 25 s window is gone: nothing happens at the old deadline.
    t.clock.advance(10_000);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    expect((await b.playLegal(gameId)).ok).toBe(true); // P2's exchange (a pass)
    await a.update(gameId, (u) => u.view.phase === 'firstBid');
  });

  it('A drops on their own turn with 15 s left: A loses on time, the clock never pauses', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    expect((await b.playLegal(gameId)).ok).toBe(true); // P2 passes: P1 (A) to bid
    await a.update(gameId, (u) => u.view.phase === 'firstBid');

    t.clock.advance(TIMING.turnMs - 15_000);
    await gone(a);
    t.clock.advance(15_000 + TIMING.lateMoveToleranceMs - 1);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    t.clock.advance(1);
    const end = await b.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P2', reason: 'timeout' });
  });

  it("A drops, then B drops 10 s later: at A's 25 s mark the game is abandoned and deleted", async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);

    await gone(a);
    t.clock.advance(10_000);
    await gone(b);
    t.clock.advance(TIMING.graceMs - 10_000 - 1);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    t.clock.advance(1);
    expect(t.server.games.get(gameId)).toBeNull();
    expect(t.server.metrics.ended.abandoned).toBe(1);

    for (const client of [a, b]) {
      const back = await client.reconnect();
      expect(back.ok && back.endedGame).toMatchObject({
        gameId,
        winner: null,
        reason: 'abandoned',
      });
    }
  });

  it('both drop together and one returns in time: play continues', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    await Promise.all([gone(a), gone(b)]);
    t.clock.advance(20_000);
    expect((await a.reconnect()).ok).toBe(true);
    t.clock.advance(3_000);
    expect((await b.reconnect()).ok).toBe(true);
    t.clock.advance(10_000);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    await b.update(gameId);
    expect((await b.playLegal(gameId)).ok).toBe(true);
  });

  it('both drop together and nobody returns: abandoned at the 25 s mark', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    await Promise.all([gone(a), gone(b)]);
    t.clock.advance(TIMING.graceMs);
    expect(t.server.games.get(gameId)).toBeNull();
    expect(t.server.metrics.ended.abandoned).toBe(1);
  });

  it('only one returns in time: the other forfeits at their own 25 s mark', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    await Promise.all([gone(a), gone(b)]);
    t.clock.advance(20_000);
    expect((await a.reconnect()).ok).toBe(true);
    await a.update(gameId);
    t.clock.advance(5_000);
    const end = await a.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P1', reason: 'forfeit' });
  });

  it('A plays the AI and leaves: A forfeits after 25 s and, with nobody connected, the game is deleted at once', async () => {
    t = await startServer({ ai: slowAi(5_000) });
    const a = await TestClient.connect(t.url, { nickname: 'Ada' });
    clients.push(a);
    const started = await a.emit('lobby.ai.start', { level: 'easy', seat: 'P1' });
    expect(started.ok).toBe(true);
    const gameId = started.ok ? started.gameId : '';
    await a.update(gameId, (u) => u.view.status === 'playing');

    await gone(a);
    t.clock.advance(TIMING.graceMs - 1);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    t.clock.advance(1);
    await until(() => t.server.games.get(gameId) === null);
    expect(t.server.metrics.ended.forfeit).toBe(1);
    const back = await a.reconnect();
    expect(back.ok && back.endedGame).toMatchObject({ gameId, winner: 'P2', reason: 'forfeit' });
  });

  it('a matched player never confirms the start: cancelled after 10 s; the other goes back to the front of the queue', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await quickMatch(t);
    clients.push(p1, p2);
    expect((await p1.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);

    t.clock.advance(TIMING.startHandshakeMs - 1);
    expect(t.server.games.get(gameId)?.status).toBe('starting');
    t.clock.advance(1);
    expect(await p1.take('game.cancelled')).toEqual({ gameId, reason: 'start-timeout' });
    expect(await p2.take('game.cancelled')).toEqual({ gameId, reason: 'start-timeout' });
    expect(t.server.games.get(gameId)).toBeNull();
    await p1.take('lobby.requeued');
    expect(p2.has('lobby.requeued')).toBe(false);
    expect(t.server.lobby.queueLength).toBe(1);

    // The next player to join is matched with p1 first.
    const c = await TestClient.connect(t.url, { nickname: 'Cy' });
    clients.push(c);
    expect((await c.emit('lobby.quick.join', {})).ok).toBe(true);
    const matched = await c.take('lobby.matched');
    expect((await p1.take('lobby.matched')).gameId).toBe(matched.gameId);
  });

  it('a player who drops during the start handshake gets 25 s from the drop, not from the start', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await quickMatch(t);
    clients.push(p1, p2);
    expect((await p1.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
    await gone(p1);
    t.clock.advance(9_000);
    expect((await p2.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
    const started = await p2.update(gameId, (u) => u.view.status === 'playing');
    expect(started.view.opponent.graceDeadline).toBe(t.clock.now() + TIMING.graceMs - 9_000);
    t.clock.advance(TIMING.graceMs - 9_000);
    const end = await p2.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P2', reason: 'forfeit' });
  });

  it('a player who drops before the start is back in time if the handshake completes', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await quickMatch(t);
    clients.push(p1, p2);
    expect((await p1.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
    await gone(p2);
    t.clock.advance(5_000);
    const back = await p2.reconnect();
    expect(back.ok && back.activeGameId).toBe(gameId);
    await p2.update(gameId);
    expect((await p2.emit('game.ready', { gameId, version: 1 })).ok).toBe(true);
    const started = await p1.update(gameId, (u) => u.view.status === 'playing');
    expect(started.view.opponent.connected).toBe(true);
  });

  it('a second tab takes over the seat; the first is told why and the game never notices', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    clients.push(a, b);
    const second = await TestClient.connect(t.url, { token: a.token });
    clients.push(second);
    expect(second.playerId).toBe(a.playerId);
    expect(await a.take('server.notice')).toMatchObject({ kind: 'replaced' });
    await until(() => !a.socket.connected);
    const sync = await second.update(gameId);
    expect(sync.sync).toBe(true);
    // No 25 s window started, and B never saw A leave or come back.
    t.clock.advance(TIMING.graceMs + 1);
    expect(t.server.games.get(gameId)?.status).toBe('playing');
    await b.emit('game.sync', { gameId }); // a round trip: anything sent to B has arrived
    expect(b.has('game.presence')).toBe(false);
  });

  it('a silent network loss is caught by the 5 s heartbeat (configured, not waited for here)', async () => {
    // Socket.IO pings every 5 s and gives up after 5 s more, so a vanished client is noticed
    // within about 10 s. The option values are checked; the transport itself is Socket.IO's.
    t = await startServer();
    const engine = t.server.io.engine as unknown as {
      opts: { pingInterval: number; pingTimeout: number };
    };
    expect(engine.opts.pingInterval).toBe(5_000);
    expect(engine.opts.pingTimeout).toBe(5_000);
  });

  it('a server restart ends live games without a result and tells both players', async () => {
    t = await startServer();
    const { gameId, p1: a, p2: b } = await startedGame(t);
    const closing = t.server.close('test restart');
    for (const client of [a, b]) {
      expect(await client.take('server.notice')).toMatchObject({ kind: 'restarting' });
      const end = await client.update(gameId, (u) => u.view.status === 'over');
      expect(end.view.result).toMatchObject({ winner: null, reason: 'aborted' });
    }
    await closing;
    expect(t.server.games.size).toBe(0);
    // The afterEach checks use a fresh server, since this one is closed.
    t = await startServer();
  });
});

/** An AI that thinks for a fixed time and then plays a random legal move from its view. */
function slowAi(delayMs: number): AiPlayer {
  const rng = seededRng(5);
  return {
    thinkDelayMs: () => delayMs,
    chooseMove: (view: WireView): Promise<Move> =>
      Promise.resolve(randomMove(stateFromView(view), rng)),
  };
}
