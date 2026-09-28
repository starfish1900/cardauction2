import {
  exchangeOptions,
  faceOf,
  legalBids,
  otherSeat,
  playRandomGame,
  seededRng,
  takeOptions,
  validateMove,
  viewFor,
  type GameState,
  type Seat,
} from '@cardauction/engine';
import { describe, expect, it } from 'vitest';
import {
  exchangeSchema,
  fromWireBidRow,
  helloSchema,
  playerViewFromWire,
  PRIVATE_CODE_ALPHABET,
  stateFromView,
  toWireBidRow,
  toWireSeat,
  turnSchema,
  type WireView,
} from '../src/index.js';

/** What the server sends a seat, built the same way (see apps/server/src/games/views.ts). */
function wireView(state: GameState, seat: Seat): WireView {
  const v = viewFor(state, seat);
  return {
    gameId: 'g',
    version: state.moveCount + 1,
    status: state.result ? 'over' : 'playing',
    phase: state.phase,
    toMove: toWireSeat(state.toMove),
    turnDeadline: null,
    serverNow: 0,
    you: { seat: toWireSeat(seat), nickname: 'you', hand: v.hand },
    opponent: {
      seat: toWireSeat(otherSeat(seat)),
      nickname: 'them',
      isAI: false,
      level: null,
      handCount: v.opponent.handCount,
      known: v.opponent.known,
      connected: true,
      graceDeadline: null,
    },
    table: v.table,
    stockCount: v.stockCount,
    bids: v.bids.map(toWireBidRow),
    result: null,
    rematch: null,
  };
}

function statesToMove(games: number): GameState[] {
  const states: GameState[] = [];
  for (let seed = 1; seed <= games; seed++) {
    playRandomGame(seededRng(seed), (before) => states.push(before));
  }
  return states;
}

describe('a client rebuilding the engine state from its view', () => {
  it('finds exactly the legal moves the server finds', () => {
    const states = statesToMove(40);
    expect(states.length).toBeGreaterThan(300);
    for (const state of states) {
      const mine = stateFromView(wireView(state, state.toMove));
      if (state.phase === 'exchange') {
        // Same swaps, by face (the view sorts cards, so another copy may stand for a face).
        const faces = (s: GameState): string[] =>
          exchangeOptions(s)
            .map((o) => `${faceOf(o.give)}/${faceOf(o.take)}`)
            .sort();
        expect(faces(mine)).toEqual(faces(state));
        continue;
      }
      const bids = legalBids(state);
      expect(legalBids(mine)).toEqual(bids);
      for (const bid of bids.slice(0, 5)) {
        const faces = (ids: readonly number[]): number[] => ids.map(faceOf).sort((a, b) => a - b);
        expect(faces(takeOptions(mine, bid))).toEqual(faces(takeOptions(state, bid)));
        const take = takeOptions(state, bid)[0];
        const move = { type: 'bid' as const, ...bid, ...(take !== undefined ? { take } : {}) };
        expect(validateMove(mine, state.toMove, move)).toEqual(
          validateMove(state, state.toMove, move),
        );
      }
    }
  });

  it('gives the AI exactly the engine view of its seat, nothing more', () => {
    for (const state of statesToMove(30)) {
      for (const seat of [0, 1] as const) {
        const expected = viewFor(state, seat);
        const view = playerViewFromWire(wireView(state, seat));
        expect(view.seat).toBe(expected.seat);
        expect(view.phase).toBe(expected.phase);
        expect(view.toMove).toBe(expected.toMove);
        expect(view.moveCount).toBe(expected.moveCount);
        expect(view.hand).toEqual(expected.hand);
        expect(view.opponent).toEqual(expected.opponent);
        expect(view.table).toEqual(expected.table);
        expect(view.bids).toEqual(expected.bids);
        expect(view.bidCount).toEqual(expected.bidCount);
        expect(view.stockCount).toBe(expected.stockCount);
      }
    }
  });

  it('round-trips bid rows, action cards included', () => {
    for (const state of statesToMove(20)) {
      for (const row of state.bids) expect(fromWireBidRow(toWireBidRow(row))).toEqual(row);
    }
  });
});

describe('payload schemas', () => {
  it('accept well-formed payloads and reject anything else', () => {
    expect(helloSchema.safeParse({ protocol: 1, build: 'web-1' }).success).toBe(true);
    expect(helloSchema.safeParse({ protocol: 1, build: 'web-1', admin: true }).success).toBe(false);
    expect(helloSchema.safeParse({ protocol: '1', build: 'web-1' }).success).toBe(false);
    const exchange = { gameId: 'g1', cmdId: 'c1', expectedVersion: 3 };
    expect(exchangeSchema.safeParse(exchange).success).toBe(true);
    expect(exchangeSchema.safeParse({ ...exchange, give: 4, take: 9 }).success).toBe(true);
    expect(exchangeSchema.safeParse({ ...exchange, give: 4 }).success).toBe(false);
    const turn = { gameId: 'g1', cmdId: 'c2', expectedVersion: 3, tens: 10, units: 22 };
    expect(turnSchema.safeParse({ ...turn, action: { card: 100, column: 4 } }).success).toBe(true);
    expect(turnSchema.safeParse({ ...turn, action: { card: 100, column: 2 } }).success).toBe(false);
    expect(turnSchema.safeParse({ ...turn, tens: 120 }).success).toBe(false);
    expect(turnSchema.safeParse({ ...turn, tens: 1.5 }).success).toBe(false);
  });

  it('private codes avoid look-alike characters', () => {
    for (const confusing of ['0', 'O', '1', 'I', 'L'])
      expect(PRIVATE_CODE_ALPHABET).not.toContain(confusing);
  });
});
