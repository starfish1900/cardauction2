import type { CSSProperties, ReactNode } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { card } from '../cards';
import { C, DISPLAY, UI } from '../theme';
import { Num, PlayingCard, useAppear } from './base';

/** The empty place beside a bid row where an action card can go. */
export function Slot({
  w,
  label,
  x,
  y,
  lit = 0,
}: {
  w: number;
  label: string;
  x: number;
  y: number;
  lit?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: w * 1.4,
        borderRadius: w * 0.08,
        border: `3px dashed rgba(229, 185, 90, ${0.35 + 0.65 * lit})`,
        background: `rgba(229, 185, 90, ${0.05 + 0.12 * lit})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: UI,
          fontWeight: 700,
          fontSize: w * 0.26,
          color: C.gold2,
          opacity: 0.6 + 0.4 * lit,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export interface BidRowProps {
  readonly tens: string;
  readonly units: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly slots?: boolean;
  readonly slotLit?: 'left' | 'right' | null;
  readonly label?: ReactNode;
  readonly value?: ReactNode;
  readonly valueColor?: string;
  readonly opacity?: number;
}

/** A bid as the game shows it: [+10] tens units [−10], and its number. */
export function BidRow({
  tens,
  units,
  x,
  y,
  w = 130,
  slots = false,
  slotLit = null,
  label,
  value,
  valueColor = C.ink,
  opacity = 1,
}: BidRowProps) {
  const gap = w * 0.14;
  const left = slots ? w + gap : 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity }}>
      {slots && <Slot w={w} label="+10" x={x} y={y} lit={slotLit === 'left' ? 1 : 0} />}
      <PlayingCard id={card(tens)} w={w} x={x + left} y={y} />
      <PlayingCard id={card(units)} w={w} x={x + left + w + gap * 0.6} y={y} />
      {slots && (
        <Slot
          w={w}
          label="−10"
          x={x + left + 2 * w + gap * 1.6}
          y={y}
          lit={slotLit === 'right' ? 1 : 0}
        />
      )}
      {label && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y - 58,
            fontFamily: UI,
            fontWeight: 600,
            fontSize: 30,
            color: C.ink2,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      )}
      {value !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: x + left + 2 * w + gap * (slots ? 2.6 + w / gap : 1.6),
            top: y + w * 0.7 - 60,
          }}
        >
          <Num size={120} color={valueColor}>
            {value}
          </Num>
        </div>
      )}
    </div>
  );
}

export type TileState = 'plain' | 'latest' | 'ok' | 'bad' | 'dim' | 'ref';

const TILE: Record<TileState, { bg: string; fg: string; border: string }> = {
  plain: { bg: 'rgba(3, 22, 16, 0.55)', fg: C.ink2, border: 'rgba(255,255,255,0.10)' },
  latest: { bg: C.gold, fg: C.goldInk, border: C.gold2 },
  ref: { bg: 'rgba(229, 185, 90, 0.25)', fg: C.gold2, border: C.gold },
  ok: { bg: 'rgba(126, 226, 184, 0.92)', fg: '#06301f', border: '#b4f3d6' },
  bad: { bg: 'rgba(255, 134, 114, 0.9)', fg: '#3a0d06', border: '#ffc2b6' },
  dim: {
    bg: 'rgba(3, 22, 16, 0.3)',
    fg: 'rgba(188, 201, 193, 0.35)',
    border: 'rgba(255,255,255,0.05)',
  },
};

/** One number as a tile on a track. */
export function Tile({
  label,
  state,
  x,
  y,
  w,
  h,
  pop = 1,
  style,
}: {
  label: ReactNode;
  state: TileState;
  x: number;
  y: number;
  w: number;
  h: number;
  pop?: number;
  style?: CSSProperties;
}) {
  const t = TILE[state];
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 14,
        background: t.bg,
        border: `2px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${pop})`,
        boxShadow: state === 'ok' || state === 'latest' ? `0 0 24px ${t.bg}` : undefined,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: h * 0.5,
          color: t.fg,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Two digits, always: 5 is "05". */
export const two = (n: number): string => String(((n % 100) + 100) % 100).padStart(2, '0');

/**
 * A hop from one tile to the next, drawn as an arc that grows in: counting one step up.
 * Coordinates are the centers of the two tiles, on the tiles' top edge.
 */
export function Hop({
  x1,
  x2,
  y,
  progress,
  color = C.mint,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  progress: number;
  color?: string;
  label?: string;
}) {
  if (progress <= 0) return null;
  const h = Math.min(70, Math.abs(x2 - x1) * 0.45 + 20);
  const d = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - h * 2} ${x2} ${y}`;
  const len = Math.abs(x2 - x1) * 1.3 + h * 2;
  return (
    <svg
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
      width={1}
      height={1}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - progress)}
      />
      {label && progress > 0.6 && (
        <text
          x={(x1 + x2) / 2}
          y={y - h - 14}
          textAnchor="middle"
          fontFamily={UI}
          fontWeight={700}
          fontSize={26}
          fill={color}
          opacity={(progress - 0.6) / 0.4}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/** A bracket under a run of tiles, with a caption. */
export function Bracket({
  x1,
  x2,
  y,
  color = C.mint,
  children,
  progress = 1,
}: {
  x1: number;
  x2: number;
  y: number;
  color?: string;
  children?: ReactNode;
  progress?: number;
}) {
  const w = (x2 - x1) * progress;
  return (
    <div style={{ position: 'absolute', left: x1, top: y, width: x2 - x1, opacity: progress }}>
      <svg width={x2 - x1} height={36} style={{ display: 'block', overflow: 'visible' }}>
        <path
          d={`M 2 2 L 2 18 L ${w - 2} 18 L ${w - 2} 2`}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      </svg>
      {children && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 8,
            fontFamily: UI,
            fontWeight: 600,
            fontSize: 34,
            color,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A car's mileage counter: two drums that roll. `value` may be fractional while rolling; 100
 * shows as 00, like the real thing.
 */
export function Odometer({
  value,
  x,
  y,
  size = 200,
}: {
  value: number;
  x: number;
  y: number;
  size?: number;
}) {
  const units = ((value % 10) + 10) % 10;
  // The tens drum turns only while the units roll from 9 to 0.
  const whole = Math.floor(value);
  const frac = value - whole;
  const tensBase = Math.floor(whole / 10);
  const tens = tensBase + (whole % 10 === 9 ? frac : 0);
  const drum = (position: number) => {
    const p = ((position % 10) + 10) % 10;
    const digits = [...Array(12).keys()].map((i) => (i % 10).toString());
    return (
      <div
        style={{
          width: size * 0.62,
          height: size,
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(#111 0%, #2a2a2a 18%, #3a3a3a 50%, #2a2a2a 82%, #111 100%)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -p * size,
            transform: 'translateZ(0)',
          }}
        >
          {digits.map((d, i) => (
            <div
              key={i}
              style={{
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: size * 0.72,
                color: '#f6f1e3',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(rgba(0,0,0,0.55), transparent 28%, transparent 72%, rgba(0,0,0,0.55))',
          }}
        />
      </div>
    );
  };
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        padding: 18,
        borderRadius: 26,
        background: 'linear-gradient(#2b2b2b, #0e0e0e)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.15)',
        display: 'flex',
        gap: 12,
      }}
    >
      {drum(tens)}
      {drum(units)}
    </div>
  );
}

/** Where a number sits on the dial: 00 at the top, going round clockwise like a clock. */
export function dialPoint(cx: number, cy: number, r: number, v: number): [number, number] {
  const a = ((v / 100) * 360 - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export interface DialArc {
  readonly from: number;
  /** Steps forward from `from`, 1–10 (or more). */
  readonly steps: number;
  readonly color: string;
  readonly progress: number;
  readonly width?: number;
  /** Drawn from its end back toward its start: a move backward. */
  readonly reverse?: boolean;
  readonly dashed?: boolean;
  readonly opacity?: number;
}
export interface DialDot {
  readonly v: number;
  readonly color: string;
  readonly label?: string;
  readonly opacity?: number;
  readonly r?: number;
}

/** Radii of the dial's rings, from its center. */
export const DIAL = { ticks: 0, arc: 42, label: 106, face: 66 } as const;

/** All the numbers on one dial: 100 marks, like a clock. */
export function Dial({
  cx,
  cy,
  r,
  arcs = [],
  dots = [],
  opacity = 1,
  reveal = 1,
  glowTop = 0,
}: {
  cx: number;
  cy: number;
  r: number;
  arcs?: readonly DialArc[];
  dots?: readonly DialDot[];
  opacity?: number;
  reveal?: number;
  glowTop?: number;
}) {
  const ticks = [...Array(100).keys()];
  const arcPath = (from: number, to: number, radius: number) => {
    if (to - from <= 0.001) return '';
    const [x1, y1] = dialPoint(cx, cy, radius, from);
    const [x2, y2] = dialPoint(cx, cy, radius, to);
    const large = to - from > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  const ra = r + DIAL.arc;
  return (
    <svg
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity }}
      width={1}
      height={1}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r + DIAL.face}
        fill="rgba(3,22,16,0.55)"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={2}
      />
      {glowTop > 0 && (
        <circle
          cx={dialPoint(cx, cy, r + 7, 0)[0]}
          cy={dialPoint(cx, cy, r + 7, 0)[1]}
          r={34}
          fill={C.gold}
          opacity={0.35 * glowTop}
        />
      )}
      {ticks
        .filter((v) => v / 100 <= reveal)
        .map((v) => {
          const major = v % 10 === 0;
          const [x1, y1] = dialPoint(cx, cy, r + 18, v);
          const [x2, y2] = dialPoint(cx, cy, r + (major ? -6 : 4), v);
          return (
            <line
              key={v}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={major ? C.ink : C.ink3}
              strokeWidth={major ? 4 : 2}
              strokeLinecap="round"
            />
          );
        })}
      {ticks
        .filter((v) => v % 10 === 0 && v / 100 <= reveal)
        .map((v) => {
          const [x, y] = dialPoint(cx, cy, r - 44, v);
          return (
            <text
              key={v}
              x={x}
              y={y + 13}
              textAnchor="middle"
              fontFamily={DISPLAY}
              fontWeight={700}
              fontSize={36}
              fill={v === 0 ? C.gold2 : C.ink2}
            >
              {two(v)}
            </text>
          );
        })}
      {arcs.map((a, i) => {
        const done = a.steps * Math.min(1, Math.max(0, a.progress));
        const d = a.reverse
          ? arcPath(a.from + a.steps - done, a.from + a.steps, ra)
          : arcPath(a.from, a.from + done, ra);
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={a.color}
            strokeWidth={a.width ?? 18}
            strokeLinecap="round"
            strokeDasharray={a.dashed ? '2 16' : undefined}
            opacity={a.opacity ?? 0.95}
          />
        );
      })}
      {dots.map((d, i) => {
        const [x, y] = dialPoint(cx, cy, ra, d.v);
        const [lx, ly] = dialPoint(cx, cy, r + DIAL.label, d.v);
        return (
          <g key={i} opacity={d.opacity ?? 1}>
            <circle cx={x} cy={y} r={d.r ?? 16} fill={d.color} stroke="#062018" strokeWidth={4} />
            {d.label && (
              <text
                x={lx}
                y={ly + 16}
                textAnchor="middle"
                fontFamily={DISPLAY}
                fontWeight={700}
                fontSize={46}
                fill={d.color}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A value that steps through a list of (frame, value) changes, each rolling over `frames`. */
export function stepped(
  frame: number,
  steps: readonly (readonly [number, number])[],
  frames = 10,
): number {
  let v = steps[0]?.[1] ?? 0;
  for (let i = 1; i < steps.length; i++) {
    const [at, to] = steps[i] as readonly [number, number];
    if (frame < at) break;
    const t = Math.min(1, (frame - at) / frames);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    v = v + (to - v) * eased;
    if (t < 1) break;
  }
  return v;
}

/** A value that counts up (or down) as it changes: 58 → 68. */
export function useCountTo(from: number, to: number, start: number, frames = 18): number {
  const frame = useCurrentFrame();
  return Math.round(
    interpolate(frame, [start, start + frames], [from, to], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
}

/** A caption that fades and rises in at `at`. */
export function Caption({
  at,
  children,
  x,
  y,
  size = 40,
  color = C.ink,
  align = 'center',
  width = 1600,
}: {
  at: number;
  children: ReactNode;
  x: number;
  y: number;
  size?: number;
  color?: string;
  align?: 'left' | 'center';
  width?: number;
}) {
  const t = useAppear(at);
  return (
    <div
      style={{
        position: 'absolute',
        left: align === 'center' ? x - width / 2 : x,
        top: y,
        width,
        textAlign: align,
        opacity: t,
        transform: `translateY(${(1 - t) * 16}px)`,
        fontFamily: UI,
        fontWeight: 600,
        fontSize: size,
        color,
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}
