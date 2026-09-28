import { PRIVATE_CODE_ALPHABET, TIMING } from '@cardauction/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { closeAll, startServer, TestClient, until, type TestServer } from './harness.js';

let t: TestServer;
const clients: TestClient[] = [];

afterEach(async () => {
  await closeAll(...clients.splice(0));
  await until(() => t.server.players.count === 0);
  t.clock.advance(TIMING.lingerMs + 1);
  expect(t.server.sweep()).toBe(0);
  expect(t.server.metrics.reaperFixes).toBe(0);
  expect(t.server.games.size).toBe(0);
  expect(t.server.lobby.queueLength).toBe(0);
  await t.close();
});

async function player(name: string): Promise<TestClient> {
  const client = await TestClient.connect(t.url, { nickname: name });
  clients.push(client);
  return client;
}

describe('quick match', () => {
  it('pairs the two longest-waiting players and draws the seats', async () => {
    t = await startServer();
    const [a, b, c] = [await player('Ada'), await player('Bob'), await player('Cy')];
    await a.emit('lobby.quick.join', {});
    await b.emit('lobby.quick.join', {});
    await c.emit('lobby.quick.join', {});
    const ma = await a.take('lobby.matched');
    const mb = await b.take('lobby.matched');
    expect(ma.gameId).toBe(mb.gameId);
    expect(new Set([ma.seat, mb.seat])).toEqual(new Set(['P1', 'P2']));
    expect(ma.opponent).toBe('Bob');
    expect(c.has('lobby.matched')).toBe(false);
    expect(t.server.lobby.queueLength).toBe(1);
    expect((await c.emit('lobby.quick.leave', {})).ok).toBe(true);
    expect(t.server.lobby.queueLength).toBe(0);
  });

  it('offers the AI after 30 s alone in the queue, without swapping it in', async () => {
    t = await startServer();
    const a = await player('Ada');
    const joined = await a.emit('lobby.quick.join', {});
    expect(joined.ok && joined.since).toBe(t.clock.now());
    t.clock.advance(TIMING.aiOfferMs - 1);
    expect(a.has('lobby.aiOffer')).toBe(false);
    t.clock.advance(1);
    expect(await a.take('lobby.aiOffer')).toEqual({ waitedMs: TIMING.aiOfferMs });
    expect(t.server.lobby.queueLength).toBe(1);
    expect(t.server.games.size).toBe(0);
    // Taking the offer leaves the queue.
    const ai = await a.emit('lobby.ai.start', { level: 'easy', seat: 'random' });
    expect(ai.ok).toBe(true);
    expect(t.server.lobby.queueLength).toBe(0);
    if (ai.ok) await a.emit('game.resign', { gameId: ai.gameId, cmdId: 'r' });
  });

  it('tells a new tab that the player is still waiting in the queue', async () => {
    t = await startServer();
    const a = await player('Ada');
    const joined = await a.emit('lobby.quick.join', {});
    const tab = await TestClient.connect(t.url, { token: a.token });
    clients.push(tab);
    const welcome = await tab.hello();
    expect(welcome.ok && welcome.queuedSince).toBe(joined.ok ? joined.since : -1);
    await tab.emit('lobby.quick.leave', {});
  });

  it('forgets a player who disconnects while waiting', async () => {
    t = await startServer();
    const a = await player('Ada');
    await a.emit('lobby.quick.join', {});
    await a.disconnect();
    await until(() => t.server.lobby.queueLength === 0);
  });

  it('one game at a time: no queue while a game is in progress', async () => {
    t = await startServer();
    const a = await player('Ada');
    const ai = await a.emit('lobby.ai.start', { level: 'easy', seat: 'P2' });
    expect(ai.ok).toBe(true);
    expect(await a.emit('lobby.quick.join', {})).toEqual({ ok: false, code: 'ALREADY_IN_GAME' });
    expect(await a.emit('lobby.private.create', {})).toEqual({
      ok: false,
      code: 'ALREADY_IN_GAME',
    });
    if (!ai.ok) return;
    await a.emit('game.resign', { gameId: ai.gameId, cmdId: 'r' });
    // From the result screen, joining the queue leaves the finished game.
    expect((await a.emit('lobby.quick.join', {})).ok).toBe(true);
    expect(t.server.games.get(ai.gameId)).toBeNull();
    await a.emit('lobby.quick.leave', {});
  });
});

describe('private games', () => {
  it('creates a 6-character code without look-alikes, which a friend joins', async () => {
    t = await startServer();
    const [host, friend] = [await player('Host'), await player('Friend')];
    const created = await host.emit('lobby.private.create', {});
    if (!created.ok) throw new Error(created.code);
    expect(created.code).toMatch(new RegExp(`^[${PRIVATE_CODE_ALPHABET}]{6}$`));
    expect(created.expiresAt).toBe(t.clock.now() + TIMING.privateCodeMs);
    expect(await host.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'OWN_CODE',
    });

    const typed = `${created.code.slice(0, 3).toLowerCase()}-${created.code.slice(3)}`;
    const joined = await friend.emit('lobby.private.join', { code: typed });
    expect(joined.ok).toBe(true);
    const matched = await host.take('lobby.matched');
    expect(matched.opponent).toBe('Friend');
    expect(await friend.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'CODE_NOT_FOUND',
    });
    await host.emit('game.ready', { gameId: matched.gameId, version: 1 });
    await friend.emit('game.ready', { gameId: matched.gameId, version: 1 });
    await host.emit('game.resign', { gameId: matched.gameId, cmdId: 'r' });
  });

  it('expires unused after 10 minutes', async () => {
    t = await startServer();
    const [host, friend] = [await player('Host'), await player('Friend')];
    const created = await host.emit('lobby.private.create', {});
    if (!created.ok) throw new Error(created.code);
    t.clock.advance(TIMING.privateCodeMs);
    expect(await host.take('lobby.private.expired')).toEqual({ code: created.code });
    expect(await friend.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'CODE_NOT_FOUND',
    });
  });

  it('stays valid while the host is briefly away, but a join waits for the host to return', async () => {
    t = await startServer();
    const [host, friend] = [await player('Host'), await player('Friend')];
    const created = await host.emit('lobby.private.create', {});
    if (!created.ok) throw new Error(created.code);
    await host.disconnect();
    await until(() => !t.server.players.isConnected(host.playerId));
    expect(await friend.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'CODE_HOST_AWAY',
    });
    await host.reconnect();
    expect((await friend.emit('lobby.private.join', { code: created.code })).ok).toBe(true);
    const matched = await host.take('lobby.matched');
    t.clock.advance(TIMING.startHandshakeMs); // nobody confirms: cancelled, no requeue
    await host.take('game.cancelled');
    expect(t.server.games.get(matched.gameId)).toBeNull();
    expect(t.server.lobby.queueLength).toBe(0);
  });

  it('limits code guesses to 10 a minute per address', async () => {
    t = await startServer();
    const guesser = await player('Guess');
    for (let i = 0; i < 10; i++) {
      expect(await guesser.emit('lobby.private.join', { code: 'ZZZZZ9' })).toEqual({
        ok: false,
        code: 'CODE_NOT_FOUND',
      });
    }
    expect(await guesser.emit('lobby.private.join', { code: 'ZZZZZ9' })).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
    });
    t.clock.advance(6_000);
    expect(await guesser.emit('lobby.private.join', { code: 'ZZZZZ9' })).toEqual({
      ok: false,
      code: 'CODE_NOT_FOUND',
    });
  });
});

describe('admission limits', () => {
  it('answers SERVER_BUSY beyond MAX_GAMES and MAX_AI_GAMES instead of slowing everyone down', async () => {
    t = await startServer({ config: { maxGames: 2, maxAiGames: 1 } });
    const [a, b, c, d, e] = [
      await player('A1'),
      await player('B2'),
      await player('C3'),
      await player('D4'),
      await player('E5'),
    ];
    const ai = await a.emit('lobby.ai.start', { level: 'easy', seat: 'P1' });
    expect(ai.ok).toBe(true);
    expect(await b.emit('lobby.ai.start', { level: 'easy', seat: 'P1' })).toEqual({
      ok: false,
      code: 'SERVER_BUSY',
    });
    const created = await e.emit('lobby.private.create', {});
    if (!created.ok) throw new Error(created.code);
    await b.emit('lobby.quick.join', {});
    await c.emit('lobby.quick.join', {});
    await b.take('lobby.matched');
    expect(await d.emit('lobby.quick.join', {})).toEqual({ ok: false, code: 'SERVER_BUSY' });
    expect(await d.emit('lobby.private.create', {})).toEqual({ ok: false, code: 'SERVER_BUSY' });
    expect(await d.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'SERVER_BUSY',
    });
    // A finished game frees its slot.
    if (ai.ok) await a.emit('game.resign', { gameId: ai.gameId, cmdId: 'r' });
    expect((await d.emit('lobby.private.join', { code: created.code })).ok).toBe(true);
  });

  it('takes no new games while draining', async () => {
    t = await startServer();
    const a = await player('Ada');
    t.server.lobby.draining = true;
    expect(await a.emit('lobby.quick.join', {})).toEqual({ ok: false, code: 'DRAINING' });
    expect(await a.emit('lobby.ai.start', { level: 'easy', seat: 'P1' })).toEqual({
      ok: false,
      code: 'DRAINING',
    });
    t.server.lobby.draining = false;
  });
});
