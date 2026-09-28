import type { Suit } from '@cardauction/engine';
import type { ReactNode } from 'react';
import { C, DISPLAY, UI } from '../theme';
import { SuitChip } from './SuitChip';

/** A rule as a card: its number, its name and a small picture. */
export function RuleCard({
  n,
  title,
  x,
  y,
  opacity,
  scale = 1,
  children,
}: {
  n: number;
  title: string;
  x: number;
  y: number;
  opacity: number;
  scale?: number;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 560,
        height: 300,
        borderRadius: 28,
        background: 'rgba(3, 22, 16, 0.62)',
        border: '2px solid rgba(229,185,90,0.35)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
        opacity,
        transform: `scale(${scale})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            background: C.gold,
            color: C.goldInk,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 50,
          }}
        >
          {n}
        </div>
        <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 54, color: C.ink }}>{title}</span>
      </div>
      <div style={{ height: 100, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

/** The rule being taught, as a bar at the top of the stage. */
export function RuleHeader({
  n,
  title,
  detail,
  opacity,
  detailOpacity = 1,
}: {
  n: number;
  title: string;
  detail: ReactNode;
  opacity: number;
  detailOpacity?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 104,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${(1 - opacity) * -16}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '14px 34px 14px 16px',
          borderRadius: 999,
          background: 'rgba(3,22,16,0.62)',
          border: '2px solid rgba(229,185,90,0.35)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: C.gold,
            color: C.goldInk,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 36,
          }}
        >
          {n}
        </div>
        <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 40, color: C.gold2 }}>
          {title}
        </span>
        <span
          style={{
            fontFamily: UI,
            fontWeight: 500,
            fontSize: 36,
            color: C.ink,
            opacity: detailOpacity,
            maxWidth: 900 * Math.min(1, detailOpacity * 1.6),
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            display: 'inline-block',
          }}
        >
          {detail}
        </span>
      </div>
    </div>
  );
}

/** A little staircase: counting up. */
export function StairsIcon({ size = 120 }: { size?: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 160 100">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={8 + i * 38}
          y={78 - i * 22}
          width={32}
          height={14 + i * 22}
          rx={5}
          fill={i === 3 ? C.mint : 'rgba(126,226,184,0.45)'}
        />
      ))}
      <path
        d="M14 66 L134 6"
        stroke={C.gold2}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray="2 12"
      />
    </svg>
  );
}

/** The five colors. */
export function SuitRow({ size = 56, gap = 14 }: { size?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', gap }}>
      {([0, 1, 2, 3, 4] as Suit[]).map((s) => (
        <SuitChip key={s} suit={s} size={size} />
      ))}
    </div>
  );
}
