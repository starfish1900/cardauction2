import { useCurrentFrame } from 'remotion';
import { life, pop, pulse, ramp } from '../components/anim';
import { Num, Sfx, Text, Verdict } from '../components/base';
import { C, DISPLAY, UI } from '../theme';
import { useMarks } from '../timeline';

const PLAYER = { 1: C.gold2, 2: '#9cc2ff' } as const;
type Seat = 1 | 2;

const BIDS: readonly (readonly [string, Seat])[] = [
  ['47', 1],
  ['52', 2],
  ['58', 1],
  ['63', 2],
  ['70', 1],
];

const step = (i: number) => ({ x: 420 + i * 185, y: 690 - i * 92 });
const PILL_W = 150;
const PILL_H = 100;

function Badge({
  seat,
  x,
  glow,
  dim,
  note,
  noteColor,
}: {
  seat: Seat;
  x: number;
  glow: number;
  dim: number;
  note: string;
  noteColor: string;
}) {
  const color = PLAYER[seat];
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 330,
        width: 220,
        textAlign: 'center',
        opacity: 1 - dim * 0.55,
      }}
    >
      <div
        style={{
          width: 170,
          height: 170,
          margin: '0 auto',
          borderRadius: 85,
          background: 'rgba(3, 22, 16, 0.6)',
          border: `5px solid ${color}`,
          boxShadow: `0 0 ${10 + glow * 50}px ${glow * 18}px ${color}66`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Num size={96} color={color}>
          {seat}
        </Num>
      </div>
      <div style={{ marginTop: 18 }}>
        <Text size={36} color={C.ink}>
          Player {seat}
        </Text>
      </div>
      <div style={{ marginTop: 10, height: 50 }}>
        <Text size={40} weight={700} color={noteColor}>
          {note}
        </Text>
      </div>
    </div>
  );
}

export function Goal() {
  const frame = useCurrentFrame();
  const m = useMarks('goal');
  const first = m.at('turns', 0.9);
  const every = 30;
  const when = BIDS.map((_, i) => first + i * every);
  const stuckAt = m.at('loses', 0.2);
  const crossAt = m.word('loses', "can't", 0.2);
  const verdictAt = m.word('loses', 'loses', 0.1);
  const lastBid = when[when.length - 1] ?? 0;

  // Whose turn it is: each badge glows as its bid lands; P2 glows again when it is stuck.
  const glow = (seat: Seat) =>
    Math.max(
      ...BIDS.map(([, s], i) => (s === seat ? pulse(frame, (when[i] ?? 0) + 4, 14) : 0)),
      seat === 2 ? pulse(frame, stuckAt + 6, 14) : 0,
      seat === 1 ? ramp(frame, verdictAt, verdictAt + 10) : 0,
    );
  const verdict = ramp(frame, verdictAt, verdictAt + 10);
  const guide = ramp(frame, first, lastBid + 10);

  const a = step(0);
  const b = step(5);
  return (
    <>
      <Badge
        seat={1}
        x={100}
        glow={glow(1)}
        dim={0}
        note={verdict > 0.5 ? 'wins' : ''}
        noteColor={C.gold2}
      />
      <Badge
        seat={2}
        x={1600}
        glow={glow(2)}
        dim={verdict}
        note={verdict > 0.5 ? 'loses' : ''}
        noteColor={C.danger}
      />

      {/* A faint guide up the staircase: each number a little higher than the last. */}
      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        width={1}
        height={1}
      >
        <line
          x1={a.x + PILL_W / 2}
          y1={a.y + PILL_H / 2}
          x2={a.x + PILL_W / 2 + (b.x - a.x) * guide}
          y2={a.y + PILL_H / 2 + (b.y - a.y) * guide}
          stroke="rgba(229,185,90,0.35)"
          strokeWidth={6}
          strokeDasharray="4 16"
          strokeLinecap="round"
        />
      </svg>

      {BIDS.map(([value, seat], i) => {
        const t = pop(frame, when[i] ?? 0);
        const { x, y } = step(i);
        const color = PLAYER[seat];
        return (
          <div
            key={value}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: PILL_W,
              height: PILL_H,
              borderRadius: 22,
              background: 'rgba(3, 22, 16, 0.72)',
              border: `4px solid ${color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: Math.min(1, t),
              transform: `translateY(${(1 - t) * 40}px) scale(${0.8 + 0.2 * t})`,
            }}
          >
            <Num size={64} color={C.ink}>
              {value}
            </Num>
            <div
              style={{
                position: 'absolute',
                top: -34,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: UI,
                fontWeight: 700,
                fontSize: 24,
                color,
              }}
            >
              P{seat}
            </div>
          </div>
        );
      })}

      {/* Player 2 has no bid left. */}
      {(() => {
        const t = life(frame, stuckAt);
        const { x, y } = step(5);
        return (
          <div
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: PILL_W,
              height: PILL_H,
              borderRadius: 22,
              border: `4px dashed ${C.danger}`,
              background: 'rgba(255,134,114,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: t,
            }}
          >
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: C.danger }}>
              ?
            </span>
            <div
              style={{
                position: 'absolute',
                top: -34,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: UI,
                fontWeight: 700,
                fontSize: 24,
                color: PLAYER[2],
              }}
            >
              P2
            </div>
            <div
              style={{
                position: 'absolute',
                right: -34,
                top: -30,
                opacity: pop(frame, crossAt),
                transform: `scale(${pop(frame, crossAt)})`,
              }}
            >
              <Verdict ok={false} size={64} />
            </div>
          </div>
        );
      })()}

      {BIDS.map((_, i) => (
        <Sfx key={i} name="pop" at={when[i] ?? 0} volume={0.22} />
      ))}
      <Sfx name="buzz" at={crossAt} volume={0.2} />
      <Sfx name="chime" at={verdictAt} volume={0.25} />
    </>
  );
}
