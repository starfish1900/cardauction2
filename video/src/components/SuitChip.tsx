import type { Suit } from '@cardauction/engine';
import type { CSSProperties } from 'react';
import { Pip } from '../../../apps/web/src/cards/pips';

/** A suit's pip in its true card color, on a small white tile: how the color looks on a card. */
export function SuitChip({
  suit,
  size = 44,
  style,
}: {
  suit: Suit;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: '#fffdf8',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        ...style,
      }}
    >
      <svg viewBox="0 0 100 100" width={size * 0.72} height={size * 0.72}>
        <Pip suit={suit} cx={50} cy={50} size={96} />
      </svg>
    </div>
  );
}
