import { otherSeat, viewFor, type GameState, type Seat } from '@cardauction/engine';
import { toWireBidRow, toWireSeat, type WireView } from '@cardauction/protocol';

/** The view the server would send `seat` for this state (clock and presence left neutral). */
export function viewOf(state: GameState, seat: Seat = state.toMove, version = 5): WireView {
  const v = viewFor(state, seat);
  return {
    gameId: 'g',
    version,
    status: state.result ? 'over' : 'playing',
    phase: state.phase,
    toMove: toWireSeat(state.toMove),
    turnDeadline: 0,
    serverNow: 0,
    you: { seat: toWireSeat(seat), nickname: 'me', hand: v.hand },
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
