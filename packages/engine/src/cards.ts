/**
 * Card identities.
 *
 * The double deck holds 120 physical cards. Each card has a fixed id derived from its face,
 * never from its position in the shuffled deck, so an id reveals nothing about the deal:
 *
 * - digit cards: id = 20 × suit + 2 × rank + copy, giving 0–99 (two copies of each face);
 * - action cards: ids 100–119 (all twenty are identical and colorless).
 *
 * "Color" in the rule book means suit. Suits are numbered in the order the rule book lists them.
 */

export type CardId = number;
export type Suit = 0 | 1 | 2 | 3 | 4;

export const STARS: Suit = 0;
export const DIAMONDS: Suit = 1;
export const CLUBS: Suit = 2;
export const HEARTS: Suit = 3;
export const SPADES: Suit = 4;

export const SUITS: readonly Suit[] = [STARS, DIAMONDS, CLUBS, HEARTS, SPADES];
export const SUIT_NAMES = ['stars', 'diamonds', 'clubs', 'hearts', 'spades'] as const;
export const SUIT_SYMBOLS = ['★', '♦', '♣', '♥', '♠'] as const;
/** One-character suit codes used by the text notation (tests, CLI, logs). */
export const SUIT_CODES = ['*', 'D', 'C', 'H', 'S'] as const;

export const DECK_SIZE = 120;
export const DIGIT_CARDS = 100;
export const ACTION_CARDS = 20;
export const RANKS = 10;

/** Face of every action card; digit faces are suit × 10 + rank (0–49). */
export const ACTION_FACE = 50;
export const FACE_COUNT = 51;

export function isCardId(value: unknown): value is CardId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
}

export function isDigit(id: CardId): boolean {
  return id >= 0 && id < DIGIT_CARDS;
}

export function isAction(id: CardId): boolean {
  return id >= DIGIT_CARDS && id < DECK_SIZE;
}

export function suitOf(id: CardId): Suit {
  if (!isDigit(id)) throw new RangeError(`card ${id} has no suit`);
  return Math.floor(id / 20) as Suit;
}

export function rankOf(id: CardId): number {
  if (!isDigit(id)) throw new RangeError(`card ${id} has no rank`);
  return Math.floor((id % 20) / 2);
}

export function faceOf(id: CardId): number {
  return isAction(id) ? ACTION_FACE : suitOf(id) * 10 + rankOf(id);
}

export function digitId(suit: Suit, rank: number, copy: 0 | 1 = 0): CardId {
  if (!Number.isInteger(rank) || rank < 0 || rank >= RANKS)
    throw new RangeError(`bad rank ${rank}`);
  return suit * 20 + rank * 2 + copy;
}

export function actionId(copy = 0): CardId {
  if (!Number.isInteger(copy) || copy < 0 || copy >= ACTION_CARDS) {
    throw new RangeError(`bad action copy ${copy}`);
  }
  return DIGIT_CARDS + copy;
}

export function allCardIds(): CardId[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/**
 * Display order: action cards first, then ascending rank, ties broken by suit in rule-book order
 * (★ ♦ ♣ ♥ ♠), then by copy so the order is total.
 */
export function sortKey(id: CardId): number {
  return isAction(id) ? id - 1000 : rankOf(id) * 10 + suitOf(id) * 2 + (id % 2);
}

export function compareCards(a: CardId, b: CardId): number {
  return sortKey(a) - sortKey(b);
}

export function sortCards(ids: readonly CardId[]): CardId[] {
  return [...ids].sort(compareCards);
}

/** Human label, e.g. "5♥" or "±10". */
export function cardLabel(id: CardId): string {
  return isAction(id) ? '±10' : `${rankOf(id)}${SUIT_SYMBOLS[suitOf(id)]}`;
}

/** ASCII code, e.g. "5H", "0*" or "A". */
export function cardCode(id: CardId): string {
  return isAction(id) ? 'A' : `${rankOf(id)}${SUIT_CODES[suitOf(id)]}`;
}

export type ParsedFace = { kind: 'digit'; suit: Suit; rank: number } | { kind: 'action' };

/** Parses "5H", "0*", "7♦" or "A" (case-insensitive). Returns null for anything else. */
export function parseFace(code: string): ParsedFace | null {
  const text = code.trim().toUpperCase();
  if (text === 'A' || text === '±10' || text === '±') return { kind: 'action' };
  const match = /^([0-9])([*DCHS★♦♣♥♠])$/u.exec(text);
  if (!match) return null;
  const rank = Number(match[1]);
  const symbol = match[2] ?? '';
  const byCode = (SUIT_CODES as readonly string[]).indexOf(symbol);
  const bySymbol = (SUIT_SYMBOLS as readonly string[]).indexOf(symbol);
  const suit = byCode >= 0 ? byCode : bySymbol;
  if (suit < 0) return null;
  return { kind: 'digit', suit: suit as Suit, rank };
}

export function faceMatches(id: CardId, face: ParsedFace): boolean {
  if (face.kind === 'action') return isAction(id);
  return isDigit(id) && suitOf(id) === face.suit && rankOf(id) === face.rank;
}
