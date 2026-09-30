import type { ReactNode } from 'react';
import { FlipCard, Num, PlayingCard, Text } from './base';
import { easeInOut, lerp, pop, ramp, toss } from './anim';
import { C, UI } from '../theme';
import { tr } from '../lang';

/**
 * The game laid out from above, shared by the setup and the flow of a game: Player 2's hand at
 * the top, Player 1's at the bottom, the table's 5 × 5 grid in the middle, the bid board on the
 * left.
 */
export const HAND = { w: 70, step: 44, cx: 960, top: 108, bottom: 792 } as const;
export const GRID = { w: 66, dx: 80, dy: 104, x0: 767, y0: 240 } as const;
export const BOARD = { x: 100, y: 236, w: 400, h: 500, card: 80 } as const;

export const tablePos = (r: number, c: number) => ({
  x: GRID.x0 + c * GRID.dx,
  y: GRID.y0 + r * GRID.dy,
  w: GRID.w,
});
export const boardCard = (row: number, col: number) => ({
  x: BOARD.x + 34 + col * 92,
  y: BOARD.y + 70 + row * 138,
  w: BOARD.card,
});

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export interface HandItem {
  readonly key: string;
  readonly id: number;
  /** Face up in the hand: a card taken from the table. */
  readonly faceUp?: boolean;
  /** When it starts flying in (it takes its place in the hand from then on). */
  readonly arriveAt?: number;
  readonly arriveFrames?: number;
  /** When it starts flying out. */
  readonly leaveAt?: number;
  /** Lifted a little, as a card about to be played. */
  readonly liftAt?: number;
}

const presence = (item: HandItem, frame: number) =>
  (item.arriveAt === undefined ? 1 : ramp(frame, item.arriveAt, item.arriveAt + 8)) *
  (item.leaveAt === undefined ? 1 : 1 - ramp(frame, item.leaveAt, item.leaveAt + 8));

/** Where each card of a hand sits: the hand stays centered as cards come and go. */
export function handPlaces(
  items: readonly HandItem[],
  frame: number,
  y: number,
): Record<string, Place> {
  const p = items.map((it) => presence(it, frame));
  const n = p.reduce((a, b) => a + b, 0);
  const x0 = HAND.cx - (HAND.w + Math.max(0, n - 1) * HAND.step) / 2;
  const out: Record<string, Place> = {};
  let before = 0;
  items.forEach((it, i) => {
    const lift =
      it.liftAt === undefined ? 0 : ramp(frame, it.liftAt, it.liftAt + 8) * (y < 400 ? 22 : -22);
    out[it.key] = { x: x0 + before * HAND.step, y: y + lift, w: HAND.w };
    before += p[i] ?? 0;
  });
  return out;
}

/** The cards resting in a hand (not those flying in or out). */
export function Hand({
  items,
  frame,
  y,
  glow,
}: {
  items: readonly HandItem[];
  frame: number;
  y: number;
  glow?: Record<string, string>;
}) {
  const places = handPlaces(items, frame, y);
  return (
    <>
      {items.map((it) => {
        const landed = it.arriveAt === undefined || frame >= it.arriveAt + (it.arriveFrames ?? 10);
        const gone = it.leaveAt !== undefined && frame >= it.leaveAt;
        if (!landed || gone) return null;
        const place = places[it.key] as Place;
        return (
          <PlayingCard
            key={it.key}
            id={it.id}
            w={place.w}
            x={place.x}
            y={place.y}
            faceDown={!it.faceUp}
            glow={glow?.[it.key]}
          />
        );
      })}
    </>
  );
}

/** A card on its way from one place to another, turning over if it must. */
export function Flight({
  id,
  from,
  to,
  start,
  frames = 14,
  flip = [0, 0],
  lift = 70,
  frame,
  glow,
  compact,
}: {
  id: number;
  from: Place;
  to: Place;
  start: number;
  frames?: number;
  flip?: readonly [number, number];
  lift?: number;
  frame: number;
  glow?: string;
  compact?: boolean;
}) {
  if (frame < start || frame >= start + frames) return null;
  const t = ramp(frame, start, start + frames, easeInOut);
  const [x, y] = toss(from.x, from.y, to.x, to.y, t, lift);
  return (
    <FlipCard
      id={id}
      w={lerp(from.w, to.w, t)}
      x={x}
      y={y}
      flip={lerp(flip[0], flip[1], t)}
      glow={glow}
      {...(compact !== undefined ? { compact } : {})}
    />
  );
}

/** The bid board: every bid of the game, the latest one framed in gold. */
export function BoardPanel({ opacity, children }: { opacity: number; children?: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: BOARD.x,
        top: BOARD.y,
        width: BOARD.w,
        height: BOARD.h,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          background: 'rgba(3,22,16,0.45)',
          border: '2px solid rgba(255,255,255,0.08)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 18,
          fontFamily: UI,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: C.ink3,
        }}
      >
        {tr('Bid board')}
      </div>
      {children}
    </div>
  );
}

/** A bid's number beside its two cards on the board, and a gold frame while it is the latest. */
export function BoardValue({
  row,
  value,
  frame,
  at,
  latest,
}: {
  row: number;
  value: string;
  frame: number;
  at: number;
  latest: number;
}) {
  const t = pop(frame, at);
  const place = boardCard(row, 0);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: place.x - 14,
          top: place.y - 12,
          width: 2 * 92 + 170,
          height: place.w * 1.4 + 24,
          borderRadius: 16,
          border: `3px solid ${C.gold}`,
          opacity: latest * Math.min(1, t),
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: place.x + 2 * 92 + 16,
          top: place.y + 24,
          opacity: Math.min(1, t),
          transform: `scale(${0.8 + 0.2 * t})`,
          transformOrigin: 'left center',
        }}
      >
        <Num size={70}>{value}</Num>
      </div>
    </>
  );
}

/** A player's name beside their hand, with the number of cards and whose turn it is. */
export function HandLabel({
  seat,
  y,
  opacity,
  count,
  turn,
}: {
  seat: 1 | 2;
  y: number;
  opacity: number;
  count?: string;
  turn: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 230,
        width: 400,
        top: y + 12,
        textAlign: 'right',
        opacity,
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: C.gold,
            opacity: turn,
            boxShadow: `0 0 ${14 * turn}px ${C.gold}`,
          }}
        />
        <Text size={32} color={turn > 0.5 ? C.gold2 : C.ink}>
          {tr('Player')} {seat}
        </Text>
      </div>
      {count && (
        <div style={{ marginTop: 4 }}>
          <Text size={26} color={C.ink2} weight={500}>
            {count}
          </Text>
        </div>
      )}
    </div>
  );
}

/** An eye: a card everybody can see. */
export function Eye({ size = 40, color = C.gold2 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 100 62">
      <path
        d="M4 31 C22 6 78 6 96 31 C78 56 22 56 4 31 Z"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="31" r="13" fill={color} />
    </svg>
  );
}
