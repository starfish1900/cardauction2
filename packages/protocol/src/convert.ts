import {
  effectiveValue,
  type BidRow,
  type CardId,
  type GameState,
  type PlayerView,
  type Seat,
} from '@cardauction/engine';
import type { WireBidRow, WireSeat, WireView } from './wire.js';

export function toWireSeat(seat: Seat): WireSeat {
  return seat === 0 ? 'P1' : 'P2';
}

export function fromWireSeat(seat: WireSeat): Seat {
  return seat === 'P1' ? 0 : 1;
}

export function toWireBidRow(row: BidRow): WireBidRow {
  const base = {
    by: row.by === null ? ('start' as const) : toWireSeat(row.by),
    tens: row.tens,
    units: row.units,
    value: row.value,
  };
  if (!row.modifier) return base;
  return {
    ...base,
    action: {
      card: row.modifier.card,
      column: row.modifier.column,
      newValue: effectiveValue(row),
      by: toWireSeat(row.modifier.by),
    },
  };
}

export function fromWireBidRow(row: WireBidRow): BidRow {
  const base = {
    by: row.by === 'start' ? null : fromWireSeat(row.by),
    tens: row.tens,
    units: row.units,
    value: row.value,
  };
  return row.action
    ? {
        ...base,
        modifier: {
          card: row.action.card,
          column: row.action.column,
          by: fromWireSeat(row.action.by),
        },
      }
    : base;
}

/**
 * Rebuilds, from one player's view, a state that the engine's move functions accept for that
 * player: legalBids, validateMove, takeOptions, exchangeOptions and describeWindow. The
 * opponent's unseen cards are unknown, so their hand holds only the cards known to be in it.
 * Never apply moves to this state or check its invariants: it is a partial picture.
 */
export function stateFromView(view: WireView): GameState {
  const you = fromWireSeat(view.you.seat);
  const opponent = fromWireSeat(view.opponent.seat);
  const hands: [CardId[], CardId[]] = [[], []];
  hands[you] = [...view.you.hand];
  hands[opponent] = [...view.opponent.known];
  const known: [CardId[], CardId[]] = [[], []];
  known[opponent] = [...view.opponent.known];
  const bids = view.bids.map(fromWireBidRow);
  const bidCount: [number, number] = [0, 0];
  for (const row of bids) if (row.by !== null) bidCount[row.by] += 1;
  const result = view.result
    ? {
        winner: view.result.winner === null ? null : fromWireSeat(view.result.winner),
        reason: view.result.reason,
      }
    : null;
  return {
    phase: result ? 'over' : view.phase,
    toMove: fromWireSeat(view.toMove),
    hands,
    table: [...view.table],
    stock: [],
    bids,
    known,
    bidCount,
    moveCount: bids.length - 1 + (view.phase === 'exchange' ? 0 : 1),
    result,
  };
}

/**
 * The engine's view for the seat a wire view belongs to: what the server's AI receives, so it
 * knows exactly what a human client knows and nothing more.
 */
export function playerViewFromWire(view: WireView): PlayerView {
  const bids = view.bids.map(fromWireBidRow);
  const bidCount: [number, number] = [0, 0];
  for (const row of bids) if (row.by !== null) bidCount[row.by] += 1;
  const result = view.result
    ? {
        winner: view.result.winner === null ? null : fromWireSeat(view.result.winner),
        reason: view.result.reason,
      }
    : null;
  return {
    seat: fromWireSeat(view.you.seat),
    phase: result ? 'over' : view.phase,
    toMove: fromWireSeat(view.toMove),
    moveCount: bids.length - 1 + (view.phase === 'exchange' ? 0 : 1),
    hand: view.you.hand,
    opponent: { handCount: view.opponent.handCount, known: view.opponent.known },
    table: view.table,
    bids,
    bidCount,
    stockCount: view.stockCount,
    result,
    finalHands: view.result ? [view.result.hands.P1, view.result.hands.P2] : null,
  };
}
