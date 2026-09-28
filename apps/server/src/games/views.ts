import {
  effectiveValue,
  otherSeat,
  viewFor,
  type GameState,
  type Move,
  type Seat,
} from '@cardauction/engine';
import { toWireBidRow, toWireSeat, type GameEventBody, type WireView } from '@cardauction/protocol';
import type { Game } from './game.js';

/**
 * The only place a seat's view is built. The engine's viewFor decides what the seat may see;
 * this adds the server's side (clock, presence, rematch) and nothing hidden.
 */
export function buildView(game: Game, seat: Seat, now: number): WireView {
  const v = viewFor(game.state, seat);
  const me = game.seats[seat];
  const opponent = game.seats[otherSeat(seat)];
  const result = game.state.result;
  return {
    gameId: game.id,
    version: game.version,
    status: game.status,
    phase: game.state.phase,
    toMove: toWireSeat(game.state.toMove),
    turnDeadline: game.status === 'playing' ? game.turnDeadline : null,
    serverNow: now,
    you: { seat: toWireSeat(seat), nickname: me.nickname, hand: v.hand },
    opponent: {
      seat: toWireSeat(opponent.index),
      nickname: opponent.nickname,
      isAI: opponent.kind === 'ai',
      level: opponent.level,
      handCount: v.opponent.handCount,
      known: v.opponent.known,
      connected: opponent.connected && !opponent.left,
      graceDeadline: game.status === 'playing' ? opponent.graceDeadline : null,
    },
    table: v.table,
    stockCount: v.stockCount,
    bids: v.bids.map(toWireBidRow),
    result:
      result && v.finalHands
        ? {
            winner: result.winner === null ? null : toWireSeat(result.winner),
            reason: result.reason,
            hands: { P1: v.finalHands[0], P2: v.finalHands[1] },
          }
        : null,
    rematch:
      game.status === 'over' && game.rematchDeadline !== null
        ? { deadline: game.rematchDeadline, you: me.rematch, opponent: opponent.rematch }
        : null,
  };
}

/** The public description of a move, for animations and the move log. */
export function moveEvent(
  before: GameState,
  seat: Seat,
  move: Move,
  after: GameState,
  timeout = false,
): GameEventBody {
  const by = toWireSeat(seat);
  switch (move.type) {
    case 'pass':
      return { type: 'pass', by, timeout };
    case 'exchange':
      return { type: 'exchange', by, give: move.give, take: move.take };
    case 'bid': {
      const placed = after.bids[after.bids.length - 1];
      const previous = after.bids[after.bids.length - 2];
      const used = move.action
        ? [move.tens, move.units, move.action.card]
        : [move.tens, move.units];
      const tableCard = used.find((id) => before.table.includes(id));
      return {
        type: 'bid',
        by,
        tens: move.tens,
        units: move.units,
        value: placed?.value ?? 0,
        ...(move.action && previous
          ? {
              action: {
                card: move.action.card,
                column: move.action.column,
                newValue: effectiveValue(previous),
              },
            }
          : {}),
        ...(tableCard !== undefined ? { tableCard } : {}),
        ...(move.take !== undefined ? { take: move.take } : {}),
      };
    }
  }
}
