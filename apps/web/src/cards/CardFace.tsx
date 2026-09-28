import { isAction, rankOf, suitOf, type CardId, type Suit } from '@cardauction/engine';
import { ACTION_INK, Pip, PIP_LAYOUTS, SUIT_INK } from './pips';

/**
 * One card drawn on a 100 × 140 canvas (poker proportions, 5:7). Full faces copy ordinary
 * playing cards; compact faces, for small sizes on the bid board and the table grid, show only a
 * large rank and suit.
 */
const SERIF = "Georgia, 'Times New Roman', serif";

function Frame({ fill = 'var(--card-face)' }: { fill?: string }) {
  return (
    <rect
      x="1"
      y="1"
      width="98"
      height="138"
      rx="7"
      fill={fill}
      stroke="var(--card-edge)"
      strokeWidth="1.2"
    />
  );
}

/** The rank numeral over a small pip, in the top-left corner; 6 and 9 are underlined. */
function Index({ rank, suit }: { rank: number; suit: Suit }) {
  const ink = SUIT_INK[suit];
  return (
    <g>
      <text
        x="13"
        y="21"
        fontSize="19"
        fontWeight="700"
        fontFamily={SERIF}
        textAnchor="middle"
        fill={ink}
      >
        {rank}
      </text>
      {(rank === 6 || rank === 9) && (
        <line x1="8" x2="18" y1="24.6" y2="24.6" stroke={ink} strokeWidth="1.7" />
      )}
      <Pip suit={suit} cx={13} cy={33} size={10.5} />
    </g>
  );
}

function DigitFace({ rank, suit }: { rank: number; suit: Suit }) {
  const layout = PIP_LAYOUTS[rank];
  return (
    <>
      <Frame />
      <Index rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <Index rank={rank} suit={suit} />
      </g>
      {rank === 0 && <Pip suit={suit} cx={50} cy={70} size={44} hollow />}
      {rank === 1 && <Pip suit={suit} cx={50} cy={70} size={40} />}
      {layout?.map(([x, y, flip]) => (
        <Pip key={`${x}-${y}`} suit={suit} cx={x} cy={y} size={17.5} flip={flip} />
      ))}
    </>
  );
}

function CompactDigit({ rank, suit }: { rank: number; suit: Suit }) {
  const ink = SUIT_INK[suit];
  return (
    <>
      <Frame />
      <text
        x="50"
        y="70"
        fontSize="64"
        fontWeight="700"
        fontFamily={SERIF}
        textAnchor="middle"
        fill={ink}
      >
        {rank}
      </text>
      {(rank === 6 || rank === 9) && (
        <line x1="36" x2="64" y1="79" y2="79" stroke={ink} strokeWidth="4" />
      )}
      <Pip suit={suit} cx={50} cy={106} size={36} />
    </>
  );
}

function Arrow({ up, y, size = 12 }: { up: boolean; y: number; size?: number }) {
  const h = size * 1.15;
  const d = up
    ? `M50 ${y - h / 2} L${50 + size} ${y + h / 2} H${50 - size} Z`
    : `M50 ${y + h / 2} L${50 + size} ${y - h / 2} H${50 - size} Z`;
  return <path d={d} fill={ACTION_INK} />;
}

function ActionFace({ compact }: { compact: boolean }) {
  const corner = (
    <text
      x="16"
      y="18"
      fontSize="12.5"
      fontWeight="700"
      fontFamily={SERIF}
      textAnchor="middle"
      fill={ACTION_INK}
    >
      ±10
    </text>
  );
  if (compact) {
    return (
      <>
        <Frame />
        <Arrow up y={30} size={13} />
        <text
          x="50"
          y="82"
          fontSize="34"
          fontWeight="700"
          fontFamily={SERIF}
          textAnchor="middle"
          fill={ACTION_INK}
        >
          ±10
        </text>
        <Arrow up={false} y={112} size={13} />
      </>
    );
  }
  return (
    <>
      <Frame />
      {corner}
      <g transform="rotate(180 50 70)">{corner}</g>
      <Arrow up y={42} />
      <text
        x="50"
        y="78"
        fontSize="24"
        fontWeight="700"
        fontFamily={SERIF}
        textAnchor="middle"
        fill={ACTION_INK}
      >
        ±10
      </text>
      <Arrow up={false} y={100} />
    </>
  );
}

/** Small diamonds on a grid, leaving room for the medallion: one path for the whole back. */
const LATTICE = (() => {
  const parts: string[] = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 11; col++) {
      const x = 12 + col * 7.6 + (row % 2) * 3.8;
      const y = 12 + row * 7.7;
      if (x > 88 || y > 128 || Math.hypot(x - 50, y - 70) < 22) continue;
      parts.push(`M${x} ${y - 3}L${x + 3} ${y}L${x} ${y + 3}L${x - 3} ${y}Z`);
    }
  }
  return parts.join('');
})();

/** The same original back on every card, so an opponent's hand gives nothing away. */
export function CardBack() {
  return (
    <svg viewBox="0 0 100 140" className="card-svg" aria-hidden="true">
      <Frame fill="var(--back)" />
      <rect
        x="6"
        y="6"
        width="88"
        height="128"
        rx="4"
        fill="none"
        stroke="var(--back-line)"
        strokeWidth="1.4"
      />
      <path d={LATTICE} fill="var(--back-pattern)" />
      <circle
        cx="50"
        cy="70"
        r="17"
        fill="var(--back)"
        stroke="var(--back-line)"
        strokeWidth="1.6"
      />
      <text
        x="50"
        y="76"
        fontSize="15"
        fontWeight="700"
        fontFamily={SERIF}
        textAnchor="middle"
        fill="var(--back-line)"
        letterSpacing="0.5"
      >
        CA
      </text>
    </svg>
  );
}

export function CardFace({ id, compact }: { id: CardId; compact: boolean }) {
  return (
    <svg viewBox="0 0 100 140" className="card-svg" aria-hidden="true">
      {isAction(id) ? (
        <ActionFace compact={compact} />
      ) : compact ? (
        <CompactDigit rank={rankOf(id)} suit={suitOf(id)} />
      ) : (
        <DigitFace rank={rankOf(id)} suit={suitOf(id)} />
      )}
    </svg>
  );
}
