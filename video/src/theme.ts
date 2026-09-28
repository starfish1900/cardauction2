/** The game's own palette (apps/web/src/styles.css): green felt, white cards, brass accents. */
export const C = {
  felt1: '#15634a',
  felt2: '#0d4534',
  felt3: '#072a20',
  panel: 'rgba(3, 22, 16, 0.42)',
  panelStrong: 'rgba(3, 22, 16, 0.72)',
  panelEdge: 'rgba(255, 255, 255, 0.10)',
  ink: '#f4efe2',
  ink2: '#bcc9c1',
  ink3: '#86a093',
  gold: '#e5b95a',
  gold2: '#f3cf7d',
  goldInk: '#2b1f05',
  mint: '#7ee2b8',
  danger: '#ff8672',
  band: '#04190f',
} as const;

/** Suit colors as the cards print them, and lighter versions for words on the felt. */
export const SUIT_INK = ['#9A6B00', '#1F5FD6', '#177E35', '#D0021B', '#1A1A1A'] as const;
export const SUIT_ON_FELT = ['#f3cf7d', '#93bbff', '#86e3a7', '#ff9a9a', '#f4efe2'] as const;
export const SUIT_NAMES = ['stars', 'diamonds', 'clubs', 'hearts', 'spades'] as const;

export const W = 1920;
export const H = 1080;
/** The subtitle band at the bottom: nothing that teaches is ever drawn there. */
export const BAND = 150;
export const STAGE = H - BAND;
export const FPS = 30;

export const UI = "'Inter', system-ui, sans-serif";
export const DISPLAY = "'Gelasio', Georgia, serif";
