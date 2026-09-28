import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CardBack, CardFace } from '../../../apps/web/src/cards/CardFace';
import { BAND, C, DISPLAY, STAGE, UI } from '../theme';

/** 0 → 1 with a soft spring, starting at `at` (frames). */
export function useAppear(at: number, damping = 18, durationInFrames?: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - at,
    fps,
    config: { damping, mass: 0.9, stiffness: 120 },
    ...(durationInFrames ? { durationInFrames } : {}),
  });
}

/** A linear-in-time value from 0 to 1 between two frames, eased, clamped. */
export function useProgress(from: number, to: number, easing = Easing.inOut(Easing.cubic)): number {
  const frame = useCurrentFrame();
  if (to <= from) return frame >= to ? 1 : 0;
  return interpolate(frame, [from, to], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The green felt of the card room, with its faint weave. */
export function Felt() {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 120% 95% at 50% 40%, ${C.felt1} 0%, ${C.felt2} 58%, ${C.felt3} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage:
            'repeating-linear-gradient(45deg, #000 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, #fff 0 1px, transparent 1px 4px)',
        }}
      />
    </AbsoluteFill>
  );
}

/** The subtitle band: a quiet strip at the bottom, the same in every version of the video. */
export function Band({ children, top = STAGE }: { children?: ReactNode; top?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        height: BAND,
        background: C.band,
        borderTop: `1px solid rgba(229, 185, 90, 0.22)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

/** The teaching area: everything a scene draws lives inside it, above the band. */
export function Stage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: STAGE,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface PlayingCardProps {
  readonly id: number;
  readonly w: number;
  readonly faceDown?: boolean;
  readonly compact?: boolean;
  readonly x?: number;
  readonly y?: number;
  readonly rotate?: number;
  readonly scale?: number;
  readonly opacity?: number;
  /** A colored halo: legal (mint), wrong (danger), chosen (gold). */
  readonly glow?: string | undefined;
  readonly dim?: boolean;
  readonly style?: CSSProperties;
}

/** One card, drawn with the game's own card faces. (x, y) is its top-left corner. */
export function PlayingCard({
  id,
  w,
  faceDown,
  compact,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  opacity = 1,
  glow,
  dim,
  style,
}: PlayingCardProps) {
  const h = Math.round(w * 1.4);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `rotate(${rotate}deg) scale(${scale})`,
        transformOrigin: '50% 60%',
        opacity,
        borderRadius: w * 0.07,
        boxShadow: glow
          ? `0 0 0 ${Math.max(3, w * 0.035)}px ${glow}, 0 0 ${w * 0.35}px ${glow}, 0 6px 16px rgba(0,0,0,0.4)`
          : '0 2px 3px rgba(0,0,0,0.35), 0 8px 18px rgba(0,0,0,0.30)',
        filter: dim ? 'grayscale(0.7) brightness(0.55)' : undefined,
        ...style,
      }}
    >
      {faceDown ? <CardBack /> : <CardFace id={id} compact={compact ?? w < 80} />}
    </div>
  );
}

export function Num({
  children,
  size = 96,
  color = C.ink,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        color,
        fontVariantNumeric: 'lining-nums tabular-nums',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Text({
  children,
  size = 40,
  color = C.ink,
  weight = 600,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: UI,
        fontSize: size,
        fontWeight: weight,
        color,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** A rounded label on the felt. */
export function Pill({
  children,
  color = C.ink,
  bg = C.panelStrong,
  border = C.panelEdge,
  size = 30,
  style,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  border?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.4,
        padding: `${size * 0.35}px ${size * 0.75}px`,
        borderRadius: 999,
        background: bg,
        border: `2px solid ${border}`,
        fontFamily: UI,
        fontWeight: 600,
        fontSize: size,
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A green check or a red cross in a disc. */
export function Verdict({
  ok,
  size = 72,
  style,
}: {
  ok: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  const color = ok ? C.mint : C.danger;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <circle cx="50" cy="50" r="46" fill={color} />
      {ok ? (
        <path
          d="M28 52 L44 67 L73 35"
          fill="none"
          stroke="#0b2b20"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M33 33 L67 67 M67 33 L33 67"
          fill="none"
          stroke="#3a0d06"
          strokeWidth="11"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** A sound effect starting at a frame of the current sequence. */
export function Sfx({ name, at, volume = 0.35 }: { name: string; at: number; volume?: number }) {
  return (
    <Sequence from={Math.max(0, Math.round(at))} layout="none">
      <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** The chapter's name, small, at the top left. */
export function Chapter({ title, number }: { title: string; number?: number }) {
  const t = useAppear(4);
  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        top: 44,
        opacity: t,
        transform: `translateY(${(1 - t) * -12}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: 5, background: C.gold }} />
      <Text
        size={26}
        color={C.gold2}
        weight={600}
        style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}
      >
        {number !== undefined ? `${number} · ` : ''}
        {title}
      </Text>
    </div>
  );
}

/** A card turning over: `flip` 0 shows its back, 1 its face. */
export function FlipCard({
  id,
  w,
  x,
  y,
  flip,
  rotate = 0,
  opacity = 1,
  glow,
  dim,
  compact,
}: {
  id: number;
  w: number;
  x: number;
  y: number;
  flip: number;
  rotate?: number;
  opacity?: number;
  glow?: string | undefined;
  dim?: boolean;
  compact?: boolean;
}) {
  const squeeze = Math.max(0.03, Math.abs(Math.cos(Math.PI * Math.min(1, Math.max(0, flip)))));
  return (
    <PlayingCard
      id={id}
      w={w}
      x={x}
      y={y}
      faceDown={flip < 0.5}
      opacity={opacity}
      glow={glow}
      {...(dim ? { dim } : {})}
      {...(compact !== undefined ? { compact } : {})}
      style={{ transform: `rotate(${rotate}deg) scaleX(${squeeze})` }}
    />
  );
}
