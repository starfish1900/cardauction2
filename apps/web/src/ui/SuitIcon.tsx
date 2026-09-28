import { isAction, rankOf, suitOf, type CardId, type Suit } from '@cardauction/engine';
import { Pip, SUIT_INK } from '../cards/pips';

/** A suit drawn inline with text (SVG, never a Unicode character that could turn into emoji). */
export function SuitIcon({
  suit,
  size = '1em',
  light = false,
}: {
  suit: Suit;
  size?: string;
  light?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`suit-icon ${light ? 'suit-icon--light' : ''}`}
      aria-hidden="true"
    >
      <Pip suit={suit} cx={50} cy={50} size={92} fill={light ? LIGHT_INK[suit] : SUIT_INK[suit]} />
    </svg>
  );
}

/** Suit colors readable on the dark felt (the card inks are for white card faces). */
export const LIGHT_INK: Record<Suit, string> = {
  0: '#f3c94f',
  1: '#7fb0ff',
  2: '#6fd68e',
  3: '#ff8a8a',
  4: '#f4efe2',
};

/** "7★" as rank plus a colored suit icon, for text on the felt. */
export function CardText({ id }: { id: CardId }) {
  if (isAction(id)) return <span className="card-text">±10</span>;
  const suit = suitOf(id);
  return (
    <span className="card-text" style={{ color: LIGHT_INK[suit] }}>
      {rankOf(id)}
      <SuitIcon suit={suit} size="0.9em" light />
    </span>
  );
}
