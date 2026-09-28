import { actionId, digitId, type CardId, type Suit } from '@cardauction/engine';

const SUIT_OF: Record<string, Suit> = { '*': 0, S: 4, D: 1, C: 2, H: 3 };

/** "7D" is the 7 of diamonds, "7D2" its second copy, "A3" the fourth action card. */
export function card(code: string): CardId {
  if (code.startsWith('A')) return actionId(Number(code.slice(1) || 0));
  const rank = Number(code[0]);
  const suit = SUIT_OF[code[1] ?? ''];
  if (suit === undefined || Number.isNaN(rank)) throw new Error(`bad card code ${code}`);
  return digitId(suit, rank, code[2] === '2' ? 1 : 0);
}
