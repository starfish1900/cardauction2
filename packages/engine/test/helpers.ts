import {
  allCardIds,
  bidValue,
  faceMatches,
  P1,
  parseFace,
  type BidRow,
  type CardId,
  type Column,
  type GameState,
  type Phase,
  type Seat,
} from '../src/index.js';

/** Resolves space-separated codes ("5H 8S A") to unused card ids, marking them used. */
export function take(codes: string, used: Set<CardId>): CardId[] {
  return codes
    .split(/\s+/u)
    .filter(Boolean)
    .map((code) => {
      const face = parseFace(code);
      if (!face) throw new Error(`bad card code ${code}`);
      const id = allCardIds().find((c) => faceMatches(c, face) && !used.has(c));
      if (id === undefined) throw new Error(`no copy of ${code} left`);
      used.add(id);
      return id;
    });
}

export interface RowSpec {
  readonly by: Seat;
  readonly cards: string;
  /** Action card placed on this row by the next bidder. */
  readonly modifier?: Column;
}

export interface PositionSpec {
  readonly phase?: Phase;
  readonly toMove?: Seat;
  /** Starting number, tens first. */
  readonly start?: string;
  readonly rows?: readonly RowSpec[];
  readonly p1?: string;
  readonly p2?: string;
  readonly table?: string;
}

/**
 * Builds a position for rule tests. Unlisted cards go to the stock, so stock-size invariants do
 * not hold here; the move validator does not depend on them.
 */
export function position(spec: PositionSpec): GameState {
  const used = new Set<CardId>();
  const rowFrom = (by: Seat | null, codes: string): BidRow => {
    const [tens, units] = take(codes, used) as [CardId, CardId];
    return { by, tens, units, value: bidValue(tens, units) };
  };
  const bids: BidRow[] = [rowFrom(null, spec.start ?? '5H 8S')];
  for (const row of spec.rows ?? []) {
    const previous = bids[bids.length - 1] as BidRow;
    if (row.modifier) {
      const [card] = take('A', used) as [CardId];
      bids[bids.length - 1] = { ...previous, modifier: { card, column: row.modifier, by: row.by } };
    }
    bids.push(rowFrom(row.by, row.cards));
  }
  const hands: [CardId[], CardId[]] = [take(spec.p1 ?? '', used), take(spec.p2 ?? '', used)];
  const table = take(spec.table ?? '', used);
  const stock = allCardIds().filter((id) => !used.has(id));
  const bidCount: [number, number] = [0, 0];
  for (const row of bids) if (row.by !== null) bidCount[row.by] += 1;
  return {
    phase: spec.phase ?? 'bid',
    toMove: spec.toMove ?? P1,
    hands,
    table,
    stock,
    bids,
    known: [[], []],
    bidCount,
    moveCount: bids.length,
    result: null,
  };
}

/** First card in `pool` matching `code`. */
export function card(pool: readonly CardId[], code: string): CardId {
  const face = parseFace(code);
  if (!face) throw new Error(`bad card code ${code}`);
  const id = pool.find((c) => faceMatches(c, face));
  if (id === undefined) throw new Error(`${code} not found`);
  return id;
}
