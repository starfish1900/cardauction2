import { randomUUID } from 'node:crypto';
import { isAction, legalBids } from '@cardauction/engine';
import { stateFromView, TIMING, type GameUpdate } from '@cardauction/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeAll,
  quickMatch,
  startedGame,
  startServer,
  TestClient,
  until,
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
  await t.close();
});

describe('start handshake', () => {
  it('deals at once, starts the clock only when both players confirm', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await quickMatch(t);
    clients.push(p1, p2);
    const view = p1.view(gameId);
    expect(view).toMatchObject({
      status: 'starting',
      phase: 'exchange',
      toMove: 'P2',
      turnDeadline: null,
    });
    expect(view.you.hand).toHaveLength(13);
    expect(view.table).toHaveLength(25);
    expect(view.stockCount).toBe(67);
    expect(view.opponent).toMatchObject({
      nickname: p2.nickname,
      isAI: false,
      handCount: 13,
      connected: true,
    });

    const early = await p2.emit('game.exchange', {
      gameId,
      cmdId: 'c1',
      expectedVersion: view.version,
    });
    expect(early).toEqual({ ok: false, code: 'NOT_STARTED' });

    await p1.emit('game.ready', { gameId, version: 1 });
    await p2.emit('game.ready', { gameId, version: 1 });
    const started = await p2.update(gameId, (u) => u.view.status === 'playing');
    expect(started.view.turnDeadline).toBe(t.clock.now() + TIMING.turnMs);
    expect(started.events.map((e) => e.type)).toEqual(['start']);
  });
});

describe('the command pipeline', () => {
  it('plays a whole game to its end through the server, with every event sent to both', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const seen = new Map<string, number[]>([
      [p1.playerId, []],
      [p2.playerId, []],
    ]);
    for (let turn = 0; turn < 40; turn++) {
      const view = p1.view(gameId);
      if (view.status === 'over') break;
      const mover = view.toMove === 'P1' ? p1 : p2;
      const reply = await mover.playLegal(gameId);
      expect(reply.ok).toBe(true);
      for (const client of [p1, p2]) {
        const update = await client.update(gameId);
        seen.get(client.playerId)?.push(...update.events.map((e) => e.seq));
      }
    }
    const final = p1.view(gameId);
    expect(final.status).toBe('over');
    expect(final.result?.reason).toBe('noLegalBid');
    expect(final.result?.hands.P1.length).toBeGreaterThan(0);
    // Both players received every event exactly once, in order.
    const events = t.server.games.get(gameId)?.events ?? [];
    const all = events.map((e) => e.seq).filter((seq) => seq > 1);
    expect(seen.get(p1.playerId)).toEqual(all);
    expect(seen.get(p2.playerId)).toEqual(all);
  });

  it('describes every move for animations: exchange, first bid with its table card, take', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const view = p2.view(gameId);
    const give = view.you.hand[0] as number;
    const take = view.table[0] as number;
    expect(
      (
        await p2.emit('game.exchange', {
          gameId,
          cmdId: 'x',
          expectedVersion: view.version,
          give,
          take,
        })
      ).ok,
    ).toBe(true);
    const seenByP1 = await p1.update(gameId);
    expect(seenByP1.events).toEqual([
      expect.objectContaining({ type: 'exchange', by: 'P2', give, take, seq: 2 }),
    ]);
    expect(seenByP1.view.opponent.known).toEqual([take]);

    await p1.playLegal(gameId);
    const bid = (await p2.update(gameId, (u) => u.events.some((e) => e.type === 'bid'))).events[0];
    expect(bid).toMatchObject({ type: 'bid', by: 'P1' });
    if (bid?.type !== 'bid') throw new Error('expected a bid');
    expect(bid.tableCard).toBeDefined(); // P1's first bid always uses one table card
    expect(bid.take).toBeDefined();
    expect(p2.view(gameId).bids).toHaveLength(2);
  });

  it('answers STALE with the current view, and never applies a command twice', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const version = p2.view(gameId).version;
    const stale = await p2.emit('game.exchange', {
      gameId,
      cmdId: 'a',
      expectedVersion: version - 1,
    });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.code).toBe('STALE');
    expect(!stale.ok && stale.view?.version).toBe(version);

    const first = await p2.emit('game.exchange', {
      gameId,
      cmdId: 'same',
      expectedVersion: version,
    });
    const again = await p2.emit('game.exchange', {
      gameId,
      cmdId: 'same',
      expectedVersion: version,
    });
    expect(first).toEqual({ ok: true, version: version + 1 });
    expect(again).toEqual(first);
    expect(t.server.games.get(gameId)?.version).toBe(version + 1);
    expect(t.server.games.get(gameId)?.events).toHaveLength(2);
  });

  it("returns the engine's error codes and never says where a card is", async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const view = p1.view(gameId);
    const notYours = await p1.emit('game.exchange', {
      gameId,
      cmdId: 'n',
      expectedVersion: view.version,
    });
    expect(notYours).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    await p2.playLegal(gameId);
    await p1.update(gameId);
    const now = p1.view(gameId);
    const opponentCard = p2.view(gameId).you.hand.find((id) => !isAction(id)) as number;
    const mine = now.you.hand.find((id) => !isAction(id)) as number;
    const reply = await p1.emit('game.turn', {
      gameId,
      cmdId: 'bad',
      expectedVersion: now.version,
      tens: opponentCard,
      units: mine,
      take: now.table[0],
    });
    expect(reply).toEqual({ ok: false, code: 'CARD_NOT_IN_HAND' });
    const wrongPhase = await p1.emit('game.exchange', {
      gameId,
      cmdId: 'w',
      expectedVersion: now.version,
    });
    expect(wrongPhase).toEqual({ ok: false, code: 'WRONG_PHASE' });
  });

  it("never shows a player the opponent's unseen cards or the face-down pile", async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const updates: GameUpdate[] = [];
    for (let turn = 0; turn < 12; turn++) {
      const view = p1.view(gameId);
      if (view.status === 'over') break;
      await (view.toMove === 'P1' ? p1 : p2).playLegal(gameId);
      updates.push(await p1.update(gameId), await p2.update(gameId));
      const game = t.server.games.get(gameId);
      if (!game || game.status === 'over') break;
      for (const [client, seat] of [
        [p1, 0],
        [p2, 1],
      ] as const) {
        const opponent = seat === 0 ? 1 : 0;
        const hidden = new Set([
          ...game.state.stock,
          ...game.state.hands[opponent].filter((id) => !game.state.known[opponent].includes(id)),
        ]);
        const view = client.view(gameId);
        const shown = [
          ...view.you.hand,
          ...view.opponent.known,
          ...view.table,
          ...view.bids.flatMap((row) => [
            row.tens,
            row.units,
            ...(row.action ? [row.action.card] : []),
          ]),
        ];
        expect(shown.filter((id) => hidden.has(id))).toEqual([]);
      }
    }
    expect(updates.length).toBeGreaterThan(0);
  });
});

describe('clocks', () => {
  it('P2 running out of time on the exchange counts as a pass', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    t.clock.advance(TIMING.turnMs + TIMING.lateMoveToleranceMs);
    const update = await p1.update(gameId, (u) => u.view.phase === 'firstBid');
    expect(update.events).toEqual([
      expect.objectContaining({ type: 'pass', by: 'P2', timeout: true }),
    ]);
    expect(update.view.turnDeadline).toBe(t.clock.now() + TIMING.turnMs);
  });

  it('a bid turn running out loses the game', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    await p2.playLegal(gameId);
    await p1.update(gameId);
    t.clock.advance(TIMING.turnMs + TIMING.lateMoveToleranceMs);
    const end = await p2.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P2', reason: 'timeout' });
  });

  it('accepts a move arriving within 1 s after the deadline', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    t.clock.advance(TIMING.turnMs + TIMING.lateMoveToleranceMs - 1);
    expect((await p2.playLegal(gameId)).ok).toBe(true);
  });
});

describe('after the game', () => {
  it('resigning ends the game at once, and repeated resigns are harmless', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    const first = await p1.emit('game.resign', { gameId, cmdId: 'r' });
    expect(first.ok).toBe(true);
    expect(await p1.emit('game.resign', { gameId, cmdId: 'r' })).toEqual(first);
    expect(await p1.emit('game.resign', { gameId, cmdId: 'r2' })).toEqual({
      ok: false,
      code: 'GAME_OVER',
    });
    const end = await p2.update(gameId, (u) => u.view.status === 'over');
    expect(end.view.result).toMatchObject({ winner: 'P2', reason: 'resign' });
    expect(end.view.result?.hands.P1).toEqual(p1.view(gameId).you.hand);
    expect(end.view.rematch).toMatchObject({ you: false, opponent: false });
  });

  it('a rematch starts a new game with seats swapped when both accept within 30 s', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    await p1.emit('game.resign', { gameId, cmdId: 'r' });
    await p2.update(gameId, (u) => u.view.status === 'over');
    expect((await p1.emit('game.rematch', { gameId, accept: true })).ok).toBe(true);
    expect(await p2.take('game.rematch')).toEqual({ gameId, seat: 'P1', accept: true });
    expect((await p2.emit('game.rematch', { gameId, accept: true })).ok).toBe(true);
    const next = await p1.take('lobby.matched');
    expect(next.seat).toBe('P2');
    expect((await p2.take('lobby.matched')).seat).toBe('P1');
    expect(t.server.games.get(gameId)).toBeNull();
    expect(t.server.metrics.rematches).toBe(1);
    expect(t.server.games.get(next.gameId)?.status).toBe('starting');
  });

  it('no rematch while the server drains, and a busy server leaves the offer open', async () => {
    t = await startServer({ config: { maxGames: 1 } });
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    await p1.emit('game.resign', { gameId, cmdId: 'r' });
    await p2.update(gameId, (u) => u.view.status === 'over');
    expect((await p1.emit('game.rematch', { gameId, accept: true })).ok).toBe(true);

    t.server.lobby.draining = true;
    expect(await p2.emit('game.rematch', { gameId, accept: true })).toEqual({
      ok: false,
      code: 'DRAINING',
    });
    t.server.lobby.draining = false;

    // Another game takes the only slot: B's acceptance is refused and not recorded.
    const c = await TestClient.connect(t.url);
    clients.push(c);
    const other = await c.emit('lobby.ai.start', { level: 'easy', seat: 'P1' });
    if (!other.ok) throw new Error(other.code);
    expect(await p2.emit('game.rematch', { gameId, accept: true })).toEqual({
      ok: false,
      code: 'SERVER_BUSY',
    });
    const seats = t.server.games.get(gameId)?.seats.map((seat) => seat.rematch);
    expect(seats).toEqual(p1.view(gameId).you.seat === 'P1' ? [true, false] : [false, true]);

    // Once the slot frees, B can still accept within the window.
    await c.emit('game.resign', { gameId: other.gameId, cmdId: 'r' });
    await c.emit('game.leave', { gameId: other.gameId });
    expect((await p2.emit('game.rematch', { gameId, accept: true })).ok).toBe(true);
    expect((await p1.take('lobby.matched', (m) => m.gameId !== gameId)).seat).toBe('P2');
  });

  it('the rematch window closes after 30 s', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    await p1.emit('game.resign', { gameId, cmdId: 'r' });
    await p2.update(gameId, (u) => u.view.status === 'over');
    t.clock.advance(TIMING.rematchMs);
    const closed = await p2.update(gameId, (u) => u.view.rematch === null);
    expect(closed.view.status).toBe('over');
    expect(await p1.emit('game.rematch', { gameId, accept: true })).toEqual({
      ok: false,
      code: 'REMATCH_CLOSED',
    });
  });

  it('refuses to leave a game in progress, and syncs on request', async () => {
    t = await startServer();
    const { gameId, p1, p2 } = await startedGame(t);
    clients.push(p1, p2);
    expect(await p1.emit('game.leave', { gameId })).toEqual({
      ok: false,
      code: 'GAME_IN_PROGRESS',
    });
    const sync = await p1.emit('game.sync', { gameId });
    expect(sync.ok && sync.update.sync).toBe(true);
    expect(sync.ok && sync.update.events.map((e) => e.type)).toEqual(['start']);
    expect(await p1.emit('game.sync', { gameId: 'gnope' })).toEqual({
      ok: false,
      code: 'GAME_NOT_FOUND',
    });
    const stranger = await TestClient.connect(t.url);
    clients.push(stranger);
    expect(await stranger.emit('game.sync', { gameId })).toEqual({
      ok: false,
      code: 'GAME_NOT_FOUND',
    });
  });
});

describe('games against the AI', () => {
  it('start at once, and the AI answers each move from its own view', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url, { nickname: 'Ada' });
    clients.push(a);
    const started = await a.emit('lobby.ai.start', { level: 'hard', seat: 'P1' });
    if (!started.ok) throw new Error(started.code);
    const { gameId } = started;
    expect((await a.take('lobby.matched')).vsAI).toBe(true);
    const first = await a.update(gameId, (u) => u.view.status === 'playing');
    expect(first.view.opponent).toMatchObject({ isAI: true, level: 'hard', nickname: 'AI · Hard' });

    for (let turn = 0; turn < 40 && a.view(gameId).status !== 'over'; turn++) {
      const view = a.view(gameId);
      if (view.toMove === 'P2') {
        t.clock.advance(2_000); // the placeholder AI thinks for 0.6–1.5 s
        await a.update(gameId);
        continue;
      }
      if (view.phase !== 'exchange')
        expect(legalBids(stateFromView(view)).length).toBeGreaterThan(0);
      expect((await a.playLegal(gameId)).ok).toBe(true);
      await a.update(gameId);
    }
    expect(a.view(gameId).status).toBe('over');
    // The AI accepts a rematch at once.
    expect(a.view(gameId).rematch).toMatchObject({ opponent: true });
    expect((await a.emit('game.rematch', { gameId, accept: true })).ok).toBe(true);
    const again = await a.take('lobby.matched', (m) => m.gameId !== gameId);
    expect(again).toMatchObject({ seat: 'P2', vsAI: true });
    await a.update(again.gameId, (u) => u.view.status === 'playing');
    expect((await a.emit('game.resign', { gameId: again.gameId, cmdId: randomUUID() })).ok).toBe(
      true,
    );
    expect((await a.emit('game.leave', { gameId: again.gameId })).ok).toBe(true);
  });
});
