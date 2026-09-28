import { Pip, SUIT_INK } from '../cards/pips';

/** Two cards fanned out: the back one burgundy, the front one showing a star. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="logo">
      <g transform="rotate(-14 32 40)">
        <rect
          x="12"
          y="9"
          width="30"
          height="42"
          rx="4"
          fill="#7a1c2a"
          stroke="#e5b95a"
          strokeWidth="2"
        />
        <rect
          x="16.5"
          y="13.5"
          width="21"
          height="33"
          rx="2"
          fill="none"
          stroke="#e5b95a"
          strokeWidth="1"
          opacity="0.7"
        />
      </g>
      <g transform="rotate(10 32 40)">
        <rect
          x="24"
          y="12"
          width="30"
          height="42"
          rx="4"
          fill="#fffdf8"
          stroke="#cfc8b8"
          strokeWidth="1.5"
        />
        <text
          x="29"
          y="24"
          fontFamily="Georgia, serif"
          fontSize="10"
          fontWeight="700"
          fill={SUIT_INK[0]}
        >
          7
        </text>
        <svg x="27" y="21" width="24" height="24" viewBox="0 0 100 100">
          <Pip suit={0} cx={50} cy={60} size={70} fill={SUIT_INK[0]} />
        </svg>
      </g>
    </svg>
  );
}
