import {
  ACTION_FACE,
  faceOf,
  rulesOf,
  STANDARD_RULES,
  type BidRow,
  type CardId,
  type GameState,
  type Move,
  type PlayerView,
  type RuleSet,
} from '@cardauction/engine';

/**
 * A fast model of the rules for the search. Copies of a face are interchangeable, so a hand is a
 * count per face (50 digit faces, suit × 10 + rank, and the action face), kept in typed arrays
 * with, per rank, a bit mask of the suits held. Legal bids are generated from those masks by
 * walking the window's ten numbers, as the plan says, instead of every pair of cards.
 *
 * The model is checked against the engine move for move by the property tests; the engine stays
 * the authority, and every move the AI sends is validated by it first.
 */

export const FACES = 51;
export const ACTION = ACTION_FACE;

// Phases. A turn is two decisions in the search tree: the bid, then the card taken.
export const EXCHANGE = 0;
export const FIRST_BID = 1;
export const BID = 2;
export const TAKE = 3;
export const OVER = 4;

// Moves are small integers: the kind in bits 17–19, then the fields below.
export const K_BID = 1;
export const K_TAKE = 2;
export const K_EXCHANGE = 3;
export const K_PASS = 4;
/** No action card, +10 (column 1), −10 (column 4). */
export const SHIFT_NONE = 0;
export const SHIFT_PLUS = 1;
export const SHIFT_MINUS = 2;
/** On P1's first bid: which digit is the table card (a pair always counts as the tens). */
export const DIGITS_FROM_HAND = 0;
export const TENS_FROM_TABLE = 1;
export const UNITS_FROM_TABLE = 2;

export const PASS = K_PASS << 17;

export function bidCode(
  tens: number,
  units: number,
  shift: number,
  actionFromTable: number,
  tableDigit: number,
): number {
  return (
    (K_BID << 17) |
    (tableDigit << 15) |
    (actionFromTable << 14) |
    (shift << 12) |
    (units << 6) |
    tens
  );
}

export const takeCode = (face: number): number => (K_TAKE << 17) | face;
export const exchangeCode = (give: number, take: number): number =>
  (K_EXCHANGE << 17) | (take << 6) | give;
export const kindOf = (m: number): number => m >>> 17;
export const tensOf = (m: number): number => m & 63;
export const unitsOf = (m: number): number => (m >>> 6) & 63;
export const shiftOf = (m: number): number => (m >>> 12) & 3;
export const actionFromTableOf = (m: number): number => (m >>> 14) & 1;
export const tableDigitOf = (m: number): number => (m >>> 15) & 3;
export const takeFaceOf = (m: number): number => m & 63;
export const giveOf = (m: number): number => m & 63;
export const exchangeTakeOf = (m: number): number => (m >>> 6) & 63;

/** Number of set bits in a five-bit suit mask. */
export const POP = new Uint8Array(32);
for (let i = 1; i < 32; i++) POP[i] = (i & 1) + POP[i >> 1]!;

export const suitOfFace = (face: number): number => (face / 10) | 0;
export const rankOfFace = (face: number): number => face % 10;
/** The value of a bid from its two faces. */
export const valueOf = (tens: number, units: number): number => (tens % 10) * 10 + (units % 10);

export class State {
  rules: RuleSet = STANDARD_RULES;
  distinct = false;
  firstBidTable = true;
  readonly hands: [Uint8Array, Uint8Array] = [new Uint8Array(FACES), new Uint8Array(FACES)];
  readonly table = new Uint8Array(FACES);
  /** Per seat and rank (seat × 10 + rank): the suits held at least once, and twice. */
  readonly mask = new Uint8Array(20);
  readonly pair = new Uint8Array(20);
  tableCount = 0;
  /** The latest bid's value, and the mask of its suits. */
  latest = 0;
  latestSuits = 0;
  phase = BID;
  toMove = 0;
  winner = -1;

  setRules(rules: RuleSet): void {
    this.rules = rules;
    this.distinct = rules.distinctSuits;
    this.firstBidTable = rules.firstBidTableCard;
  }

  copyFrom(o: State): void {
    this.rules = o.rules;
    this.distinct = o.distinct;
    this.firstBidTable = o.firstBidTable;
    this.hands[0].set(o.hands[0]);
    this.hands[1].set(o.hands[1]);
    this.table.set(o.table);
    this.mask.set(o.mask);
    this.pair.set(o.pair);
    this.tableCount = o.tableCount;
    this.latest = o.latest;
    this.latestSuits = o.latestSuits;
    this.phase = o.phase;
    this.toMove = o.toMove;
    this.winner = o.winner;
  }

  clone(): State {
    const s = new State();
    s.copyFrom(this);
    return s;
  }

  /** Sets how many cards of a face a seat holds, keeping the rank masks in step. */
  private set(seat: number, face: number, n: number): void {
    const h = this.hands[seat]!;
    h[face] = n;
    if (face === ACTION) return;
    const index = seat * 10 + (face % 10);
    const bit = 1 << ((face / 10) | 0);
    if (n >= 1) this.mask[index]! |= bit;
    else this.mask[index]! &= ~bit;
    if (n >= 2) this.pair[index]! |= bit;
    else this.pair[index]! &= ~bit;
  }

  add(seat: number, face: number): void {
    this.set(seat, face, this.hands[seat]![face]! + 1);
  }

  remove(seat: number, face: number): void {
    this.set(seat, face, this.hands[seat]![face]! - 1);
  }

  addToTable(face: number): void {
    this.table[face]!++;
    this.tableCount++;
  }

  removeFromTable(face: number): void {
    this.table[face]!--;
    this.tableCount--;
  }

  /** How many cards of a rank a seat holds. */
  rankCount(seat: number, rank: number): number {
    const i = seat * 10 + rank;
    return POP[this.mask[i]!]! + POP[this.pair[i]!]!;
  }

  /**
   * Whether `seat` can bid the number tens × 10 + units from its hand, with a suit from `fresh`
   * (the suits the latest bid does not have).
   */
  canMake(seat: number, tens: number, units: number, fresh: number): boolean {
    const base = seat * 10;
    const mt = this.mask[base + tens]!;
    if (mt === 0) return false;
    const mu = this.mask[base + units]!;
    if (mu === 0) return false;
    if (this.distinct) return this.canMakeDistinct(mt, mu, fresh);
    if (tens !== units) return ((mt | mu) & fresh) !== 0;
    // One rank twice: two suits with one of them fresh, or both copies of a fresh face.
    return (POP[mt]! >= 2 && (mt & fresh) !== 0) || (this.pair[base + tens]! & fresh) !== 0;
  }

  /** The distinct-suits rule variant: two different suits, one of them fresh. */
  private canMakeDistinct(mt: number, mu: number, fresh: number): boolean {
    for (let s1 = 0; s1 < 5; s1++) {
      if (((mt >> s1) & 1) === 0) continue;
      for (let s2 = 0; s2 < 5; s2++) {
        if (s1 === s2 || ((mu >> s2) & 1) === 0) continue;
        if ((((fresh >> s1) | (fresh >> s2)) & 1) !== 0) return true;
      }
    }
    return false;
  }

  /** Whether some number in (reference, reference + 10] can be bid by `seat`. */
  private windowHas(seat: number, reference: number, fresh: number): boolean {
    for (let step = 1; step <= 10; step++) {
      const v = (reference + step) % 100;
      if (this.canMake(seat, (v / 10) | 0, v % 10, fresh)) return true;
    }
    return false;
  }

  /** An ordinary bid (from the hand) exists for `seat` against the latest bid. */
  hasLegalBid(seat: number): boolean {
    const fresh = ~this.latestSuits & 31;
    const l = this.latest;
    if (this.windowHas(seat, l, fresh)) return true;
    if (this.hands[seat]![ACTION]! > 0) {
      if (this.windowHas(seat, (l + 10) % 100, fresh)) return true;
      if (this.windowHas(seat, (l + 90) % 100, fresh)) return true;
    }
    return false;
  }

  /** Fills `out` from `n` with the legal moves of the player to move; returns the new length. */
  legalMoves(out: Int32Array, n = 0): number {
    switch (this.phase) {
      case BID:
        return this.legalBids(out, n);
      case TAKE:
        return this.legalTakes(out, n);
      case FIRST_BID:
        return this.legalFirstBids(out, n, false);
      case EXCHANGE:
        return this.legalExchanges(out, n);
      default:
        return n;
    }
  }

  legalBids(out: Int32Array, n = 0): number {
    const seat = this.toMove;
    const fresh = ~this.latestSuits & 31;
    const l = this.latest;
    n = this.addWindow(seat, l, SHIFT_NONE, fresh, out, n);
    if (this.hands[seat]![ACTION]! > 0) {
      n = this.addWindow(seat, (l + 10) % 100, SHIFT_PLUS, fresh, out, n);
      n = this.addWindow(seat, (l + 90) % 100, SHIFT_MINUS, fresh, out, n);
    }
    return n;
  }

  private addWindow(
    seat: number,
    reference: number,
    shift: number,
    fresh: number,
    out: Int32Array,
    n: number,
  ): number {
    const base = seat * 10;
    const hand = this.hands[seat]!;
    for (let step = 1; step <= 10; step++) {
      const v = (reference + step) % 100;
      const t = (v / 10) | 0;
      const u = v % 10;
      const mt = this.mask[base + t]!;
      if (mt === 0) continue;
      const mu = this.mask[base + u]!;
      if (mu === 0) continue;
      for (let s1 = 0; s1 < 5; s1++) {
        if (((mt >> s1) & 1) === 0) continue;
        for (let s2 = 0; s2 < 5; s2++) {
          if (((mu >> s2) & 1) === 0) continue;
          if ((((fresh >> s1) | (fresh >> s2)) & 1) === 0) continue;
          if (this.distinct && s1 === s2) continue;
          const f1 = s1 * 10 + t;
          const f2 = s2 * 10 + u;
          if (f1 === f2 && hand[f1]! < 2) continue;
          out[n++] = bidCode(f1, f2, shift, 0, DIGITS_FROM_HAND);
        }
      }
    }
    return n;
  }

  /**
   * P1's first bid with the standard rule 6.2: exactly one card comes from the table, either the
   * action card or one digit. With `stopAtOne`, returns 1 as soon as one bid exists.
   */
  legalFirstBids(out: Int32Array | null, n: number, stopAtOne: boolean): number {
    const hand = this.hands[0];
    const table = this.table;
    const fresh = ~this.latestSuits & 31;
    const start = n;
    for (let option = 0; option < 5; option++) {
      // 0: no action card; 1, 2: the hand's (+10, −10); 3, 4: the table's.
      if ((option === 1 || option === 2) && hand[ACTION]! === 0) continue;
      if ((option === 3 || option === 4) && table[ACTION]! === 0) continue;
      const shift = option === 0 ? SHIFT_NONE : option % 2 === 1 ? SHIFT_PLUS : SHIFT_MINUS;
      const actionFromTable = option >= 3 ? 1 : 0;
      const reference =
        (this.latest + (shift === SHIFT_PLUS ? 10 : shift === SHIFT_MINUS ? 90 : 0)) % 100;
      for (let step = 1; step <= 10; step++) {
        const v = (reference + step) % 100;
        const t = (v / 10) | 0;
        const u = v % 10;
        for (let s1 = 0; s1 < 5; s1++) {
          const f1 = s1 * 10 + t;
          for (let s2 = 0; s2 < 5; s2++) {
            if ((((fresh >> s1) | (fresh >> s2)) & 1) === 0) continue;
            if (this.distinct && s1 === s2) continue;
            const f2 = s2 * 10 + u;
            if (actionFromTable === 1) {
              const ok = f1 !== f2 ? hand[f1]! > 0 && hand[f2]! > 0 : hand[f1]! >= 2;
              if (!ok) continue;
              if (stopAtOne) return 1;
              if (out) out[n] = bidCode(f1, f2, shift, 1, DIGITS_FROM_HAND);
              n++;
              continue;
            }
            if (table[f1]! > 0 && hand[f2]! > 0) {
              if (stopAtOne) return 1;
              if (out) out[n] = bidCode(f1, f2, shift, 0, TENS_FROM_TABLE);
              n++;
            }
            if (f1 !== f2 && hand[f1]! > 0 && table[f2]! > 0) {
              if (stopAtOne) return 1;
              if (out) out[n] = bidCode(f1, f2, shift, 0, UNITS_FROM_TABLE);
              n++;
            }
          }
        }
      }
    }
    return stopAtOne ? (n > start ? 1 : 0) : n;
  }

  legalTakes(out: Int32Array, n = 0): number {
    const table = this.table;
    for (let f = 0; f < FACES; f++) if (table[f]! > 0) out[n++] = takeCode(f);
    return n;
  }

  /** P2's exchange: keep the hand, or swap one face for a different one from the table. */
  legalExchanges(out: Int32Array, n = 0): number {
    out[n++] = PASS;
    const hand = this.hands[1];
    const table = this.table;
    for (let give = 0; give < FACES; give++) {
      if (hand[give]! === 0) continue;
      for (let take = 0; take < FACES; take++) {
        if (take !== give && table[take]! > 0) out[n++] = exchangeCode(give, take);
      }
    }
    return n;
  }

  apply(m: number): void {
    switch (m >>> 17) {
      case K_BID:
        this.applyBid(m);
        return;
      case K_TAKE: {
        const seat = this.toMove;
        const face = m & 63;
        this.removeFromTable(face);
        this.add(seat, face);
        this.phase = BID;
        this.toMove = 1 - seat;
        return;
      }
      case K_EXCHANGE: {
        const give = m & 63;
        const take = (m >>> 6) & 63;
        this.remove(1, give);
        this.addToTable(give);
        this.removeFromTable(take);
        this.add(1, take);
        this.openFirstBid();
        return;
      }
      case K_PASS:
        this.openFirstBid();
        return;
      default:
        throw new Error(`bad move ${m}`);
    }
  }

  private applyBid(m: number): void {
    const seat = this.toMove;
    const f1 = m & 63;
    const f2 = (m >>> 6) & 63;
    const shift = (m >>> 12) & 3;
    const tableDigit = (m >>> 15) & 3;
    if (tableDigit === TENS_FROM_TABLE) {
      this.removeFromTable(f1);
      this.remove(seat, f2);
    } else if (tableDigit === UNITS_FROM_TABLE) {
      this.remove(seat, f1);
      this.removeFromTable(f2);
    } else {
      this.remove(seat, f1);
      this.remove(seat, f2);
    }
    if (shift !== SHIFT_NONE) {
      if (((m >>> 14) & 1) === 1) this.removeFromTable(ACTION);
      else this.remove(seat, ACTION);
    }
    this.latest = valueOf(f1, f2);
    this.latestSuits = (1 << ((f1 / 10) | 0)) | (1 << ((f2 / 10) | 0));
    const next = 1 - seat;
    // The card taken never helps the opponent, so the game can end before it (rule 11.1).
    if (!this.hasLegalBid(next)) {
      this.phase = OVER;
      this.winner = seat;
      return;
    }
    if (this.tableCount > 0) {
      this.phase = TAKE;
    } else {
      this.phase = BID;
      this.toMove = next;
    }
  }

  /** After P2's exchange or pass: P1's first bid, or the end if P1 has none. */
  openFirstBid(): void {
    this.toMove = 0;
    if (this.firstBidTable) {
      this.phase = FIRST_BID;
      if (this.legalFirstBids(null, 0, true) === 0) {
        this.phase = OVER;
        this.winner = 1;
      }
    } else {
      this.phase = BID;
      if (!this.hasLegalBid(0)) {
        this.phase = OVER;
        this.winner = 1;
      }
    }
  }
}

function setLatest(state: State, row: BidRow): void {
  state.latest = row.value;
  state.latestSuits = (1 << suitOfFace(faceOf(row.tens))) | (1 << suitOfFace(faceOf(row.units)));
}

function phaseOf(phase: GameState['phase'], rules: RuleSet): number {
  switch (phase) {
    case 'exchange':
      return EXCHANGE;
    case 'firstBid':
      return rules.firstBidTableCard ? FIRST_BID : BID;
    case 'bid':
      return BID;
    case 'over':
      return OVER;
  }
}

/** The full state, both hands known: for tests and the balance lab. */
export function stateFromGame(game: GameState): State {
  const s = new State();
  const rules = rulesOf(game);
  s.setRules(rules);
  for (const seat of [0, 1] as const) for (const id of game.hands[seat]) s.add(seat, faceOf(id));
  for (const id of game.table) s.addToTable(faceOf(id));
  setLatest(s, game.bids[game.bids.length - 1]!);
  s.phase = phaseOf(game.phase, rules);
  s.toMove = game.toMove;
  s.winner = game.result?.winner ?? -1;
  return s;
}

/** What one seat knows: its own position, and where the opponent's hidden cards may be. */
export interface Knowledge {
  /** The position with the opponent holding only the cards known to be theirs. */
  readonly base: State;
  /** Every card this seat has not seen, as a list of faces: the opponent's hidden cards and the stock. */
  readonly unseen: Uint8Array;
  /** How many of those the opponent holds. */
  readonly hidden: number;
  readonly seat: number;
}

/** Everything the search may know, from the seat's own view: never the opponent's hidden cards. */
export function knowledgeFromView(view: PlayerView): Knowledge {
  const rules = view.rules ?? STANDARD_RULES;
  const seat = view.seat;
  const opponent = 1 - seat;
  const s = new State();
  s.setRules(rules);
  // Every copy of every face, then remove what this seat can see.
  const pool = new Int32Array(FACES);
  for (let f = 0; f < ACTION; f++) pool[f] = 2;
  pool[ACTION] = 20;
  const seen = (id: CardId): void => {
    pool[faceOf(id)]!--;
  };
  for (const id of view.hand) {
    s.add(seat, faceOf(id));
    seen(id);
  }
  for (const id of view.opponent.known) {
    s.add(opponent, faceOf(id));
    seen(id);
  }
  for (const id of view.table) {
    s.addToTable(faceOf(id));
    seen(id);
  }
  for (const row of view.bids) {
    seen(row.tens);
    seen(row.units);
    if (row.modifier) seen(row.modifier.card);
  }
  setLatest(s, view.bids[view.bids.length - 1]!);
  s.phase = phaseOf(view.phase, rules);
  s.toMove = view.toMove;
  s.winner = view.result?.winner ?? -1;
  const faces: number[] = [];
  for (let f = 0; f < FACES; f++) {
    if (pool[f]! < 0) throw new Error(`the view shows face ${f} too often`);
    for (let k = 0; k < pool[f]!; k++) faces.push(f);
  }
  const hidden = view.opponent.handCount - view.opponent.known.length;
  if (hidden < 0 || hidden > faces.length) throw new Error('inconsistent opponent hand size');
  return { base: s, unseen: Uint8Array.from(faces), hidden, seat };
}

/** The model's code for an engine move, as the search would name it (the take separately). */
export function codeOfMove(game: GameState, move: Move): { move: number; take: number | null } {
  switch (move.type) {
    case 'pass':
      return { move: PASS, take: null };
    case 'exchange':
      return { move: exchangeCode(faceOf(move.give), faceOf(move.take)), take: null };
    case 'bid': {
      const table = new Set(game.table);
      const f1 = faceOf(move.tens);
      const f2 = faceOf(move.units);
      const shift = move.action
        ? move.action.column === 1
          ? SHIFT_PLUS
          : SHIFT_MINUS
        : SHIFT_NONE;
      const actionFromTable = move.action && table.has(move.action.card) ? 1 : 0;
      let tableDigit = DIGITS_FROM_HAND;
      if (table.has(move.tens)) tableDigit = TENS_FROM_TABLE;
      else if (table.has(move.units)) tableDigit = f1 === f2 ? TENS_FROM_TABLE : UNITS_FROM_TABLE;
      return {
        move: bidCode(f1, f2, shift, actionFromTable, tableDigit),
        take: move.take === undefined ? null : takeCode(faceOf(move.take)),
      };
    }
  }
}

/**
 * Turns the search's choice back into real cards: any copy of each face will do. `take` is the
 * face to take after a bid (null when the table is empty afterwards).
 */
export function moveOfCode(
  hand: readonly CardId[],
  table: readonly CardId[],
  move: number,
  take: number | null,
): Move {
  const used = new Set<CardId>();
  const find = (pile: readonly CardId[], face: number): CardId => {
    const id = pile.find((c) => !used.has(c) && faceOf(c) === face);
    if (id === undefined) throw new Error(`no card of face ${face} left`);
    used.add(id);
    return id;
  };
  switch (kindOf(move)) {
    case K_PASS:
      return { type: 'pass' };
    case K_EXCHANGE:
      return {
        type: 'exchange',
        give: find(hand, giveOf(move)),
        take: find(table, exchangeTakeOf(move)),
      };
    case K_BID: {
      const tableDigit = tableDigitOf(move);
      const tens = find(tableDigit === TENS_FROM_TABLE ? table : hand, tensOf(move));
      const units = find(tableDigit === UNITS_FROM_TABLE ? table : hand, unitsOf(move));
      const shift = shiftOf(move);
      const action =
        shift === SHIFT_NONE
          ? undefined
          : {
              card: find(actionFromTableOf(move) === 1 ? table : hand, ACTION),
              column: shift === SHIFT_PLUS ? (1 as const) : (4 as const),
            };
      const taken = take === null ? undefined : find(table, takeFaceOf(take));
      return {
        type: 'bid',
        tens,
        units,
        ...(action ? { action } : {}),
        ...(taken !== undefined ? { take: taken } : {}),
      };
    }
    default:
      throw new Error(`not a turn: ${move}`);
  }
}
