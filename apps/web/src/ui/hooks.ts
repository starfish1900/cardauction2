import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

/** The current time, refreshed every `ms` (for countdowns). */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** The server's clock, as far as this device can tell. */
export function useServerNow(ms = 250): number {
  const offset = useStore((s) => s.clockOffset);
  return useNow(ms) + offset;
}

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export interface CardSizes {
  readonly hand: number;
  readonly table: number;
  readonly board: number;
  readonly known: number;
  readonly back: number;
}

/** Card widths per layout: full faces in the hand, compact ones on the board and the table. */
export function cardSizes(width: number): CardSizes {
  if (width >= 1180) return { hand: 78, table: 52, board: 40, known: 34, back: 28 };
  if (width >= 760) return { hand: 64, table: 46, board: 36, known: 30, back: 24 };
  // Phones: seven hand cards and nine table cards to a row.
  if (width >= 370) return { hand: 46, table: 34, board: 30, known: 26, back: 18 };
  return { hand: 41, table: 31, board: 27, known: 24, back: 16 };
}
