import { applyMove, legalBids, newGame, seededRng, type GameState } from '@cardauction/engine';
import type { GameEvent, GameUpdate } from '@cardauction/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY } from '../game/compose';
import { viewOf } from '../test/views';
import { actions, useStore } from './store';

const initial = useStore.getState();

function update(
  state: GameState,
  version: number,
  sync: boolean,
  gameId = 'g',
  events: GameEvent[] = [],
): GameUpdate {
  return {
    gameId,
    version,
    serverNow: Date.now(),
    view: { ...viewOf(state, 0, version), gameId },
    events,
    sync,
  };
}

const event = (seq: number, version: number): GameEvent => ({ type: 'start', seq, at: 0, version });

describe('the store', () => {
  beforeEach(() => useStore.setState(initial, true));

  it('replaces everything on a sync and animates nothing', () => {
    useStore.setState({ screen: 'queue', queue: { since: 0, aiOffered: false } });
    actions.update(update(newGame(seededRng(1)), 1, true, 'g', [event(1, 1)]));
    const s = useStore.getState();
    expect(s.screen).toBe('game');
    expect(s.queue).toBeNull();
    expect(s.game?.synced).toBe(true);
    expect(s.game?.previous).toBeNull();
    expect(s.game?.fresh).toEqual([]);
    expect(s.game?.events).toHaveLength(1);
  });

  it('keeps the previous view and the new events of a live update', () => {
    const state = newGame(seededRng(2));
    actions.update(update(state, 1, true));
    const after = applyMove(state, 1, { type: 'pass' });
    actions.update(update(after, 2, false, 'g', [event(2, 2)]));
    const game = useStore.getState().game;
    expect(game?.synced).toBe(false);
    expect(game?.previous?.version).toBe(1);
    expect(game?.fresh.map((e) => e.seq)).toEqual([2]);
    expect(game?.events.map((e) => e.seq)).toEqual([2]);
  });

  it('clears the composed move when the position changes, not otherwise', () => {
    const state = applyMove(newGame(seededRng(3)), 1, { type: 'pass' });
    actions.update(update(state, 2, true));
    const bid = legalBids(state)[0];
    if (!bid) throw new Error('no legal bid');
    actions.select({ ...EMPTY, tens: bid.tens });
    actions.update(update(state, 2, false));
    expect(useStore.getState().selection.tens).toBe(bid.tens);
    actions.update(update(state, 3, false));
    expect(useStore.getState().selection).toEqual(EMPTY);
  });

  it('starts over for a new game (a rematch) and forgets the rematch offer', () => {
    const state = newGame(seededRng(4));
    actions.update(update(state, 1, true, 'first'));
    actions.rematchOffer('first', true);
    expect(useStore.getState().game?.rematchOffer).toBe(true);
    actions.update(update(state, 1, false, 'second'));
    const game = useStore.getState().game;
    expect(game?.gameId).toBe('second');
    expect(game?.synced).toBe(true);
    expect(game?.rematchOffer).toBe(false);
  });

  it('keeps the rules open over a game that starts meanwhile', () => {
    actions.show('queue');
    actions.show('rules');
    actions.update(update(newGame(seededRng(5)), 1, true));
    expect(useStore.getState().screen).toBe('rules');
    expect(useStore.getState().returnTo).toBe('game');
  });

  it('applies presence only to the game it is about', () => {
    actions.update(update(newGame(seededRng(6)), 1, true));
    actions.presence({
      gameId: 'other',
      seat: 'P2',
      connected: false,
      graceDeadline: 9,
      serverNow: 0,
    });
    expect(useStore.getState().game?.view.opponent.connected).toBe(true);
    actions.presence({ gameId: 'g', seat: 'P2', connected: false, graceDeadline: 9, serverNow: 0 });
    expect(useStore.getState().game?.view.opponent.connected).toBe(false);
    expect(useStore.getState().game?.view.opponent.graceDeadline).toBe(9);
  });

  it('goes where the welcome says: a game, the queue, a private code, or stays', () => {
    const welcome = { playerId: 'p', nickname: 'Ann', serverNow: Date.now() };
    actions.online({ ...welcome, queuedSince: 5 });
    expect(useStore.getState().screen).toBe('queue');
    actions.online({ ...welcome, privateCode: { code: 'ABC234', expiresAt: 1 } });
    expect(useStore.getState().screen).toBe('host');
    actions.online({ ...welcome, activeGameId: 'g' });
    expect(useStore.getState().screen).toBe('game');
    expect(useStore.getState().me?.nickname).toBe('Ann');
  });

  it('leaves the code screen when the server dropped the code meanwhile', () => {
    const welcome = { playerId: 'p', nickname: 'Ann', serverNow: Date.now() };
    actions.hosting('ABC234', Date.now() + 60_000);
    actions.show('rules');
    actions.online(welcome);
    expect(useStore.getState()).toMatchObject({
      screen: 'rules',
      returnTo: 'home',
      privateCode: null,
    });
    actions.hosting('ABC234', Date.now() + 60_000);
    actions.online(welcome);
    expect(useStore.getState().screen).toBe('home');
  });
});
