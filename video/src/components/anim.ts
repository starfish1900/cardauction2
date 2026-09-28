import { Easing, interpolate, spring } from 'remotion';
import { FPS } from '../theme';

/** 0 → 1 with a soft spring from frame `at` (0 before it). */
export function pop(frame: number, at: number, damping = 18): number {
  if (frame < at) return 0;
  return spring({ frame: frame - at, fps: FPS, config: { damping, mass: 0.9, stiffness: 120 } });
}

/** 0 → 1 between two frames, eased and clamped. */
export function ramp(
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.inOut(Easing.cubic),
): number {
  if (to <= from) return frame >= to ? 1 : 0;
  return interpolate(frame, [from, to], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Springs in at `inAt`, fades out over `fade` frames from `outAt`. */
export function life(
  frame: number,
  inAt: number,
  outAt = Number.POSITIVE_INFINITY,
  fade = 10,
): number {
  return Math.min(1, pop(frame, inAt)) * (1 - ramp(frame, outAt, outAt + fade));
}

/** Fades in over `fade` frames at `inAt`, out at `outAt`. No spring: for things that must not bounce. */
export function fade(
  frame: number,
  inAt: number,
  outAt = Number.POSITIVE_INFINITY,
  fadeFrames = 10,
): number {
  return ramp(frame, inAt, inAt + fadeFrames) * (1 - ramp(frame, outAt, outAt + fadeFrames));
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A point on the way from A to B, lifted into an arc in the middle, as a card is tossed. */
export function toss(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
  lift = 80,
): [number, number] {
  return [lerp(ax, bx, t), lerp(ay, by, t) - Math.sin(Math.PI * t) * lift];
}

/** A soft pulse (0 → 1 → 0) around frame `at`. */
export function pulse(frame: number, at: number, width = 12): number {
  const d = Math.abs(frame - at);
  return d >= width ? 0 : 0.5 + 0.5 * Math.cos((d / width) * Math.PI);
}

export const easeOut = Easing.out(Easing.cubic);
export const easeInOut = Easing.inOut(Easing.cubic);
