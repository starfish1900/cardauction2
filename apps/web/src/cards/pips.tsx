import type { Suit } from '@cardauction/engine';

/**
 * Suit shapes in a 100 × 100 box, drawn as paths (never Unicode characters, which some phones
 * turn into emoji). Order follows the engine's suit numbers: ★ ♦ ♣ ♥ ♠.
 */
const HEART =
  'M50 94 L10 54 C-4 38 2 10 26 8 C38 7 46 14 50 26 C54 14 62 7 74 8 C98 10 104 38 90 54 Z';
const DIAMOND = 'M50 2 L88 50 L50 98 L12 50 Z';
const SPADE =
  'M50 2 C60 20 96 38 96 62 C96 78 84 88 70 88 C62 88 56 84 53 78 C54 88 58 95 66 100 L34 100 C42 95 46 88 47 78 C44 84 38 88 30 88 C16 88 4 78 4 62 C4 38 40 20 50 2 Z';
const STAR =
  'M50 4 L60.8 37.2 L95.7 37.2 L67.4 57.7 L78.2 90.8 L50 70.3 L21.8 90.8 L32.6 57.7 L4.3 37.2 L39.2 37.2 Z';
const CLUB_STEM = 'M45 55 C45 78 40 92 31 100 L69 100 C60 92 55 78 55 55 Z';

/** Ink per suit: the four-color deck of online poker plus gold stars (contrast ≥ 4.5:1 on white). */
export const SUIT_INK: Record<Suit, string> = {
  0: '#9A6B00', // stars: gold
  1: '#1F5FD6', // diamonds: blue
  2: '#177E35', // clubs: green
  3: '#D0021B', // hearts: red
  4: '#1A1A1A', // spades: black
};
export const ACTION_INK = '#5F6368';

function Shape({ suit }: { suit: Suit }) {
  switch (suit) {
    case 0:
      return <path d={STAR} />;
    case 1:
      return <path d={DIAMOND} />;
    case 2:
      return (
        <>
          <circle cx="50" cy="28" r="21" />
          <circle cx="27" cy="58" r="21" />
          <circle cx="73" cy="58" r="21" />
          <circle cx="50" cy="50" r="12" />
          <path d={CLUB_STEM} />
        </>
      );
    case 3:
      return <path d={HEART} />;
    case 4:
      return <path d={SPADE} />;
  }
}

export interface PipProps {
  readonly suit: Suit;
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  /** Lower pips of a playing card are upside down. */
  readonly flip?: boolean;
  /** The 0 card: an empty suit, drawn as an outline. */
  readonly hollow?: boolean;
  readonly fill?: string;
}

export function Pip({ suit, cx, cy, size, flip = false, hollow = false, fill }: PipProps) {
  const ink = fill ?? SUIT_INK[suit];
  const place = `rotate(${flip ? 180 : 0} ${cx} ${cy}) translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})`;
  return (
    <g transform={place}>
      <g fill={ink}>
        <Shape suit={suit} />
      </g>
      {hollow && (
        // An inset copy in the card's color leaves a clean outline, even for the club.
        <g
          fill="var(--card-face, #fffdf8)"
          transform="translate(50 52) scale(0.66) translate(-50 -52)"
        >
          <Shape suit={suit} />
        </g>
      )}
    </g>
  );
}

/**
 * Pip positions on a 100 × 140 card, from the classic layouts of ordinary playing cards.
 * [x, y, flipped]
 */
const L = 32.8;
const C = 50;
const R = 67.2;
const TOP = 35.8;
const MID = 70;
const BOTTOM = 104.2;
const UPPER = 52.9;
const LOWER = 87.1;

export const PIP_LAYOUTS: Record<number, readonly (readonly [number, number, boolean])[]> = {
  2: [
    [C, TOP, false],
    [C, BOTTOM, true],
  ],
  3: [
    [C, TOP, false],
    [C, MID, false],
    [C, BOTTOM, true],
  ],
  4: [
    [L, TOP, false],
    [R, TOP, false],
    [L, BOTTOM, true],
    [R, BOTTOM, true],
  ],
  5: [
    [L, TOP, false],
    [R, TOP, false],
    [C, MID, false],
    [L, BOTTOM, true],
    [R, BOTTOM, true],
  ],
  6: [
    [L, TOP, false],
    [R, TOP, false],
    [L, MID, false],
    [R, MID, false],
    [L, BOTTOM, true],
    [R, BOTTOM, true],
  ],
  7: [
    [L, TOP, false],
    [R, TOP, false],
    [C, UPPER, false],
    [L, MID, false],
    [R, MID, false],
    [L, BOTTOM, true],
    [R, BOTTOM, true],
  ],
  8: [
    [L, TOP, false],
    [R, TOP, false],
    [C, UPPER, false],
    [L, MID, false],
    [R, MID, false],
    [C, LOWER, true],
    [L, BOTTOM, true],
    [R, BOTTOM, true],
  ],
  9: [
    [L, 34.2, false],
    [R, 34.2, false],
    [L, 58.3, false],
    [R, 58.3, false],
    [C, MID, false],
    [L, 81.7, true],
    [R, 81.7, true],
    [L, 105.8, true],
    [R, 105.8, true],
  ],
};
