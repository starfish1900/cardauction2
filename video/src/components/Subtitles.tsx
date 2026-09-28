import { interpolate, useCurrentFrame } from 'remotion';
import { cues } from '../timeline';
import { C, FPS, UI } from '../theme';

/** The subtitle of the moment, centered in the band, with a short fade. */
export function SubtitleText() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const fade = Math.min(
    interpolate(t, [cue.start, cue.start + 0.12], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(t, [cue.end - 0.12, cue.end], [1, 0], { extrapolateLeft: 'clamp' }),
  );
  return (
    <div
      style={{
        opacity: fade,
        fontFamily: UI,
        fontWeight: 500,
        fontSize: 40,
        lineHeight: 1.3,
        color: C.ink,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        maxWidth: 1500,
      }}
    >
      {cue.text}
    </div>
  );
}
