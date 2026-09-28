import {
  cardLabel,
  faceMatches,
  parseFace,
  sortCards,
  SUIT_SYMBOLS,
  type CardId,
  type ParsedFace,
} from './cards.js';
import { bidValue, bidWindow, effectiveValue, latestBid, rowSuits, type Shift } from './rules.js';
import type { Move } from './moves.js';
import type { BidRow, Column, GameState, Seat } from './state.js';

/**
 * Text notation for moves, used by the terminal game and handy in tests:
 *
 *   pass
 *   swap 5H 3C          exchange: give 5♥ from hand, take 3♣ from the table
 *   7* 0H take 9C       bid 70 with 7★ (tens) and 0♥ (units), then take 9♣
 *   + 7D 0* take 3C     same with an action card in column 1 (+10); "-" means column 4 (−10)
 *   t7D 0* take 3C      first bid only: "t" marks the table card used in the bid
 *   +t 7D 0* take 3C    first bid only: the action card comes from the table
 *
 * Suits: * stars, D diamonds, C clubs, H hearts, S spades; A is an action card.
 */
export function parseMove(state: GameState, seat: Seat, text: string): Move | string {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const hand = state.hands[seat];
  if (words.length === 0) return 'empty move';
  const head = (words[0] ?? '').toLowerCase();
  if (head === 'pass') return { type: 'pass' };
  if (head === 'swap') {
    if (words.length !== 3) return 'usage: swap <hand card> <table card>';
    const give = find(hand, words[1] ?? '');
    const take = find(state.table, words[2] ?? '');
    if (typeof give === 'string') return `${give} in your hand`;
    if (typeof take === 'string') return `${take} on the table`;
    return { type: 'exchange', give, take };
  }

  let index = 0;
  let column: Column | undefined;
  let actionFromTable = false;
  const sign = words[0] ?? '';
  if (/^[+-]t?$/u.test(sign)) {
    column = sign.startsWith('+') ? 1 : 4;
    actionFromTable = sign.endsWith('t');
    index = 1;
  }
  const tensWord = words[index];
  const unitsWord = words[index + 1];
  if (!tensWord || !unitsWord) return 'usage: [+|-] <tens> <units> [take <card>]';
  const takeWord = words[index + 2]?.toLowerCase() === 'take' ? words[index + 3] : undefined;
  if (words.length !== index + 2 && takeWord === undefined) return 'expected "take <card>"';

  const reserved: CardId[] = [];
  const resolve = (word: string): CardId | string => {
    const fromTable = /^t/iu.test(word) && word.length === 3;
    const code = fromTable ? word.slice(1) : word;
    const pool = fromTable ? state.table : hand;
    const id = find(pool, code, reserved);
    if (typeof id === 'number') reserved.push(id);
    return typeof id === 'number' ? id : `${id} ${fromTable ? 'on the table' : 'in your hand'}`;
  };
  const tens = resolve(tensWord);
  if (typeof tens === 'string') return tens;
  const units = resolve(unitsWord);
  if (typeof units === 'string') return units;

  let action: { card: CardId; column: Column } | undefined;
  if (column !== undefined) {
    const card = find(actionFromTable ? state.table : hand, 'A', reserved);
    if (typeof card === 'string') {
      return `no action card ${actionFromTable ? 'on the table' : 'in your hand'}`;
    }
    reserved.push(card);
    action = { card, column };
  }

  let take: CardId | undefined;
  if (takeWord !== undefined) {
    const id = find(state.table, takeWord, reserved);
    if (typeof id === 'string') return `${id} on the table`;
    take = id;
  }
  return {
    type: 'bid',
    tens,
    units,
    ...(action ? { action } : {}),
    ...(take !== undefined ? { take } : {}),
  };
}

function find(
  pool: readonly CardId[],
  code: string,
  exclude: readonly CardId[] = [],
): CardId | string {
  const face: ParsedFace | null = parseFace(code);
  if (!face) return `"${code}" is not a card`;
  const id = sortCards(pool).find((c) => faceMatches(c, face) && !exclude.includes(c));
  return id ?? `no ${face.kind === 'action' ? 'action card' : code.toUpperCase()}`;
}

export function formatCards(ids: readonly CardId[]): string {
  return sortCards(ids).map(cardLabel).join(' ') || '—';
}

export function formatRow(row: BidRow): string {
  const who = row.by === null ? 'start' : row.by === 0 ? 'P1' : 'P2';
  const base = `${who.padEnd(5)} ${cardLabel(row.tens)} ${cardLabel(row.units)} = ${pad2(row.value)}`;
  if (!row.modifier) return base;
  const by = row.modifier.by === 0 ? 'P1' : 'P2';
  const sign = row.modifier.column === 1 ? '+10' : '−10';
  return `${base}   (${sign} by ${by} → ${pad2(effectiveValue(row))})`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** e.g. "Next bid 65–74 · with an action 75–84 (column 1) or 55–64 (column 4) · needs a suit other than ♠ ♦" */
export function describeWindow(state: GameState): string {
  const latest = latestBid(state);
  const range = (shift: Shift): string => {
    const w = bidWindow(latest, shift);
    return `${pad2(w.from)}–${pad2(w.to)}`;
  };
  const [a, b] = rowSuits(latest);
  const suits = a === b ? SUIT_SYMBOLS[a] : `${SUIT_SYMBOLS[a]} ${SUIT_SYMBOLS[b]}`;
  return [
    `Next bid ${range(0)}`,
    `with an action ${range(10)} (column 1) or ${range(-10)} (column 4)`,
    `needs a suit other than ${suits}`,
  ].join(' · ');
}

/**
 * Describes a move as a verb phrase, e.g. "bids 70 with 7★ 0♥, after an action card in column 1
 * (+10), then takes 9♣". Pass the state before the move to name any table card used in the bid.
 */
export function describeMove(
  move: Move,
  before?: GameState,
  person: 'third' | 'second' = 'third',
): string {
  const verb = (third: string, second: string): string => (person === 'third' ? third : second);
  switch (move.type) {
    case 'pass':
      return verb('passes', 'pass');
    case 'exchange':
      return `${verb('swaps', 'swap')} ${cardLabel(move.give)} for ${cardLabel(move.take)} from the table`;
    case 'bid': {
      const parts = [
        `${verb('bids', 'bid')} ${pad2(bidValue(move.tens, move.units))} with ${cardLabel(move.tens)} ${cardLabel(move.units)}`,
      ];
      if (move.action) {
        const sign = move.action.column === 1 ? '+10' : '−10';
        parts.push(`after an action card in column ${move.action.column} (${sign})`);
      }
      const cards = move.action
        ? [move.tens, move.units, move.action.card]
        : [move.tens, move.units];
      const fromTable = before ? cards.filter((id) => before.table.includes(id)) : [];
      if (fromTable.length > 0)
        parts.push(`using ${fromTable.map(cardLabel).join(' ')} from the table`);
      const take =
        move.take !== undefined ? `, then ${verb('takes', 'take')} ${cardLabel(move.take)}` : '';
      return parts.join(', ') + take;
    }
  }
}
