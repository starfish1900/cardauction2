import {
  bidValue,
  bidWindow,
  columnShift,
  faceOf,
  increase,
  isAction,
  latestBid,
  legalBids,
  mod100,
  rowSuits,
  validateMove,
  type BidChoice,
  type CardId,
  type Column,
  type GameState,
  type Move,
  type MoveError,
  type Shift,
  type Suit,
} from '@cardauction/engine';
import { fromWireSeat, stateFromView, type WireView } from '@cardauction/protocol';

/**
 * The turn being composed, card by card, before Confirm sends it. Everything here is checked with
 * the same engine as the server, from the player's own view, so the reason a bid fails is shown
 * before it is ever sent.
 */
export interface Selection {
  /** An action card, and the column it goes to (null until the player picks +10 or −10). */
  readonly action: { readonly card: CardId; readonly column: Column | null } | null;
  readonly tens: CardId | null;
  readonly units: CardId | null;
  /** The table card taken after the bid. */
  readonly take: CardId | null;
  /** P2's exchange: the hand card given to the table. */
  readonly give: CardId | null;
}

export const EMPTY: Selection = { action: null, tens: null, units: null, take: null, give: null };

export type Stage =
  'watch' | 'exchange' | 'pickDigits' | 'pickColumn' | 'pickTake' | 'ready' | 'invalid';

export interface Window {
  readonly from: number;
  readonly to: number;
}

export interface Analysis {
  readonly mode: 'watch' | 'exchange' | 'bid';
  readonly stage: Stage;
  /** Why the composed bid is illegal, when it is complete and illegal. */
  readonly error: MoveError | null;
  /** What Confirm sends (the exchange's pass is a separate button). */
  readonly move: Move | null;
  readonly value: number | null;
  /** How far the value is above the reference, when the bid is legal (1–10). */
  readonly step: number | null;
  /** The latest bid's value after the chosen action card. */
  readonly reference: number;
  /** The range the new number must fall in, with the chosen action card. */
  readonly window: Window;
  /** The three windows: without an action card, with +10, with −10. */
  readonly windows: { readonly none: Window; readonly plus: Window; readonly minus: Window };
  /** Suits the new bid must avoid entirely (it needs one that is not here). */
  readonly oldSuits: readonly Suit[];
  readonly firstBid: boolean;
  /** Assist mode: cards that fit some legal move, given what is already chosen. */
  readonly playable: ReadonlySet<CardId>;
  /** Table cards that can be taken now. */
  readonly takeable: ReadonlySet<CardId>;
  /** Columns that give at least one legal bid with the chosen action card. */
  readonly columns: readonly Column[];
}

type Source = 'hand' | 'table';

function windowFor(reference: number): Window {
  return { from: mod100(reference + 1), to: mod100(reference + 10) };
}

/** Everything the table and the composer show about the move being composed. */
export function analyze(view: WireView, sel: Selection): Analysis {
  const state = stateFromView(view);
  const latest = latestBid(state);
  const oldSuits = [...new Set(rowSuits(latest))];
  const firstBid = view.phase === 'firstBid';
  const shift: Shift = sel.action?.column ? columnShift(sel.action.column) : 0;
  const reference = mod100(latest.value + shift);
  const windows = {
    none: bidWindow(latest, 0),
    plus: bidWindow(latest, 10),
    minus: bidWindow(latest, -10),
  };
  const base = {
    reference,
    window: windowFor(reference),
    windows,
    oldSuits,
    firstBid,
    value: null,
    step: null,
    error: null,
    move: null,
    columns: [] as Column[],
  };
  const empty = new Set<CardId>();
  const myTurn = view.status === 'playing' && view.toMove === view.you.seat;
  if (!myTurn) {
    return { ...base, mode: 'watch', stage: 'watch', playable: empty, takeable: empty };
  }
  if (view.phase === 'exchange') {
    const move: Move | null =
      sel.give !== null && sel.take !== null
        ? { type: 'exchange', give: sel.give, take: sel.take }
        : null;
    return {
      ...base,
      mode: 'exchange',
      stage: 'exchange',
      move,
      playable: new Set([...view.you.hand, ...view.table]),
      takeable: new Set(view.table),
    };
  }

  const seat = fromWireSeat(view.you.seat);
  const hand = new Set(view.you.hand);
  const source = (id: CardId): Source => (hand.has(id) ? 'hand' : 'table');
  const same = (a: CardId, b: CardId): boolean =>
    faceOf(a) === faceOf(b) && source(a) === source(b);
  const legal = legalChoices(state, source);

  // Legal bids that agree with what is already chosen (copies of a face are interchangeable).
  const agrees = (bid: BidChoice, ignore: 'tens' | 'units' | null = null): boolean => {
    if (sel.action) {
      if (!bid.action || source(bid.action.card) !== source(sel.action.card)) return false;
      if (sel.action.column && bid.action.column !== sel.action.column) return false;
    } else if (bid.action) {
      return false;
    }
    if (ignore !== 'tens' && sel.tens !== null && !same(bid.tens, sel.tens)) return false;
    if (ignore !== 'units' && sel.units !== null && !same(bid.units, sel.units)) return false;
    return true;
  };

  const candidates = [...view.you.hand, ...(firstBid ? view.table : [])];
  const playable = new Set<CardId>();
  if (!sel.action) {
    for (const id of candidates) {
      if (isAction(id) && legal.some((b) => b.action && source(b.action.card) === source(id))) {
        playable.add(id);
      }
    }
  }
  const fits = (id: CardId, slot: 'tens' | 'units'): boolean =>
    legal.some((b) => agrees(b, slot) && same(slot === 'tens' ? b.tens : b.units, id));
  if (sel.tens === null || sel.units === null) {
    for (const id of candidates) {
      if (isAction(id) || id === sel.tens || id === sel.units) continue;
      if ((sel.tens === null && fits(id, 'tens')) || (sel.units === null && fits(id, 'units'))) {
        playable.add(id);
      }
    }
  }
  const columns: Column[] = sel.action
    ? ([1, 4] as const).filter((column) =>
        legal.some(
          (b) =>
            b.action?.column === column &&
            source(b.action.card) === source(sel.action?.card ?? b.action.card),
        ),
      )
    : [];

  const used = [sel.tens, sel.units, sel.action?.card].filter(
    (id): id is CardId => id !== null && id !== undefined,
  );
  const takeable = new Set(view.table.filter((id) => !used.includes(id)));

  if (sel.tens === null || sel.units === null) {
    return { ...base, columns, mode: 'bid', stage: 'pickDigits', playable, takeable };
  }
  const value = bidValue(sel.tens, sel.units);
  if (sel.action && sel.action.column === null) {
    return { ...base, columns, value, mode: 'bid', stage: 'pickColumn', playable, takeable };
  }
  const bid: BidChoice = {
    tens: sel.tens,
    units: sel.units,
    ...(sel.action?.column ? { action: { card: sel.action.card, column: sel.action.column } } : {}),
  };
  const move: Move = { type: 'bid', ...bid, ...(sel.take !== null ? { take: sel.take } : {}) };
  const check = validateMove(state, seat, move);
  const step = increase(reference, value);
  if (check.ok) {
    return { ...base, columns, value, step, move, mode: 'bid', stage: 'ready', playable, takeable };
  }
  if (check.error === 'TAKE_REQUIRED') {
    return { ...base, columns, value, step, mode: 'bid', stage: 'pickTake', playable, takeable };
  }
  return {
    ...base,
    columns,
    value,
    error: check.error,
    mode: 'bid',
    stage: 'invalid',
    playable,
    takeable,
  };
}

/**
 * The legal bids, in the terms the composer matches a selection against. The engine lists a
 * pair of one face (8♥ 8♥) once; when its two copies lie in different places (one in the hand,
 * one on the table, on P1's first bid), the mirrored order is the same bid for the rules but
 * another selection on screen, so it is listed too.
 */
function legalChoices(state: GameState, source: (id: CardId) => Source): BidChoice[] {
  const legal = legalBids(state);
  const mirrored = legal
    .filter((b) => faceOf(b.tens) === faceOf(b.units) && source(b.tens) !== source(b.units))
    .map((b) => ({ ...b, tens: b.units, units: b.tens }));
  return [...legal, ...mirrored];
}

/** The selection after tapping a card in the hand or on the table. */
export function pick(view: WireView, sel: Selection, zone: Source, id: CardId): Selection {
  const myTurn = view.status === 'playing' && view.toMove === view.you.seat;
  if (!myTurn) return sel;
  if (view.phase === 'exchange') {
    if (zone === 'hand') return { ...sel, give: sel.give === id ? null : id };
    return { ...sel, take: sel.take === id ? null : id };
  }
  // After the first bid, a table card is only ever the card to take.
  if (zone === 'table' && view.phase !== 'firstBid') {
    return { ...sel, take: sel.take === id ? null : id };
  }
  if (inBid(sel, id)) return withoutCard(sel, id);
  let next = sel;
  if (zone === 'table') {
    // P1's first bid uses exactly one table card. A table card joins the bid while the bid is
    // incomplete or has no table card yet; once it is complete with one, a table card is taken.
    const table = new Set(view.table);
    const fromTable = [sel.tens, sel.units, sel.action?.card].filter(
      (other): other is CardId => other !== null && other !== undefined && table.has(other),
    );
    const complete = sel.tens !== null && sel.units !== null;
    if (complete && fromTable.length > 0) return { ...sel, take: sel.take === id ? null : id };
    // The new table card replaces the one in the bid, and is no longer the card to take.
    for (const other of fromTable) next = withoutCard(next, other);
    if (next.take === id) next = { ...next, take: null };
  }
  if (isAction(id)) return { ...next, action: { card: id, column: null } };
  if (next.tens === null && next.units === null) {
    // Put the card where it can be legal: as tens if possible, otherwise as units.
    const tensOk = fitsSomething(view, { ...next, tens: id });
    const unitsOk = fitsSomething(view, { ...next, units: id });
    return !tensOk && unitsOk ? { ...next, units: id } : { ...next, tens: id };
  }
  if (next.tens === null) return { ...next, tens: id };
  if (next.units === null) return { ...next, units: id };
  return { ...next, units: id };
}

export function chooseColumn(sel: Selection, column: Column): Selection {
  if (!sel.action) return sel;
  return {
    ...sel,
    action: { card: sel.action.card, column: sel.action.column === column ? null : column },
  };
}

function inBid(sel: Selection, id: CardId): boolean {
  return sel.tens === id || sel.units === id || sel.action?.card === id;
}

function withoutCard(sel: Selection, id: CardId): Selection {
  return {
    ...sel,
    tens: sel.tens === id ? null : sel.tens,
    units: sel.units === id ? null : sel.units,
    action: sel.action?.card === id ? null : sel.action,
  };
}

/** Whether some legal bid still agrees with the selection (a partial one included). */
function fitsSomething(view: WireView, sel: Selection): boolean {
  const state = stateFromView(view);
  const hand = new Set(view.you.hand);
  const source = (id: CardId): Source => (hand.has(id) ? 'hand' : 'table');
  const same = (a: CardId, b: CardId): boolean =>
    faceOf(a) === faceOf(b) && source(a) === source(b);
  return legalChoices(state, source).some((b) => {
    if (sel.action) {
      if (!b.action || source(b.action.card) !== source(sel.action.card)) return false;
      if (sel.action.column && b.action.column !== sel.action.column) return false;
    }
    if (sel.tens !== null && !same(b.tens, sel.tens)) return false;
    if (sel.units !== null && !same(b.units, sel.units)) return false;
    return true;
  });
}
