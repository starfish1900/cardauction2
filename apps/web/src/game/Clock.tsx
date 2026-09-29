import { TIMING } from '@cardauction/protocol';
import { useServerNow } from '../ui/hooks';

/** A ring that drains over the whole turn (TIMING.turnMs) and pulses in the last 10 s. */
export function Clock({ deadline, size = 44 }: { deadline: number | null; size?: number }) {
  const now = useServerNow(200);
  if (deadline === null) return null;
  const left = Math.max(0, deadline - now);
  const seconds = Math.ceil(left / 1000);
  const fraction = Math.min(1, left / TIMING.turnMs);
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const tone = seconds <= 10 ? 'danger' : seconds <= 20 ? 'warn' : 'ok';
  // Three digits (100 s and more) get a smaller type to fit inside the ring.
  const digits = seconds >= 100 ? 'clock-seconds clock-seconds--long' : 'clock-seconds';
  return (
    <div
      className={`clock clock--${tone}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${seconds} s`}
    >
      <svg viewBox="0 0 44 44" width={size} height={size}>
        <circle cx="22" cy="22" r={r} className="clock-track" />
        <circle
          cx="22"
          cy="22"
          r={r}
          className="clock-arc"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <span className={digits}>{seconds}</span>
    </div>
  );
}
