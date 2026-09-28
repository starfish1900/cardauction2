import { useCurrentFrame } from 'remotion';
import { fade, lerp, pop, pulse, ramp } from '../components/anim';
import { Num, Pill, PlayingCard, Sfx, Text, Verdict } from '../components/base';
import {
  Bracket,
  Dial,
  Hop,
  Odometer,
  stepped,
  Tile,
  two,
  type TileState,
} from '../components/teaching';
import { card } from '../cards';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';

const FIRST = 93;
const N = 15;
const TW = 100;
const TH = 116;
const GAP = 12;
const X0 = (1920 - (N * (TW + GAP) - GAP)) / 2;
const TY = 560;
const tileX = (v: number) => X0 + (v - FIRST) * (TW + GAP);
const center = (v: number) => tileX(v) + TW / 2;
const COUNT_IDS = ['n96', 'n97', 'n98', 'n99', 'n00', 'n01', 'n02', 'n03', 'n04', 'n05'] as const;

/** A car's dashboard: a speed gauge over the mileage counter. */
function Dashboard({ value, panel }: { value: number; panel: number }) {
  const cx = 960;
  const cy = 440;
  const r = 190;
  const ticks = [...Array(13).keys()];
  const needle = -150 + 120 * Math.min(1, panel);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 560,
          top: 180,
          width: 800,
          height: 580,
          borderRadius: 60,
          background: 'linear-gradient(#1d2421, #0c100e)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.08)',
          opacity: panel,
        }}
      />
      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: panel }}
        width={1}
        height={1}
      >
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={14}
        />
        {ticks.map((i) => {
          const a = ((180 + i * 15) * Math.PI) / 180;
          const inner = i % 2 === 0 ? r - 34 : r - 22;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * inner}
              y1={cy + Math.sin(a) * inner}
              x2={cx + Math.cos(a) * (r - 6)}
              y2={cy + Math.sin(a) * (r - 6)}
              stroke="#e8e2d2"
              strokeWidth={i % 2 === 0 ? 5 : 3}
              strokeLinecap="round"
            />
          );
        })}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos((needle * Math.PI) / 180) * (r - 40)}
          y2={cy + Math.sin((needle * Math.PI) / 180) * (r - 40)}
          stroke={C.danger}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={16} fill="#e8e2d2" />
      </svg>
      <Odometer value={value} x={960 - 148} y={470} size={200} />
      <div
        style={{
          position: 'absolute',
          left: 960 + 170,
          top: 640,
          opacity: panel,
          fontFamily: UI,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 2,
          color: '#9aa39e',
        }}
      >
        MILES
      </div>
    </>
  );
}

export function Rollover() {
  const frame = useCurrentFrame();
  const m = useMarks('rollover');
  // The mileage counter.
  const twoDigits = m.word('top', 'only two digits');
  const top99 = m.word('top', 'so after 99', -0.1);
  const top00 = m.word('top', 'comes 00');
  const rollAt = m.at('roll');
  const dip1 = (m.end('top') + rollAt) / 2;
  const roll99 = m.word('roll', 'after 99');
  const roll00 = m.word('roll', 'rolls over');
  const from95 = m.at('from95');
  const latestAt = m.word('from95', '95');
  const hopAt = (k: number) => m.at(COUNT_IDS[k - 1] as string);
  const windowAt = m.word('window', 'you may bid');
  const no94 = m.word('nope', '94');
  const no06 = m.word('nope', '06');
  const eleven = m.word('nope', 'eleven');
  const dialAt = m.at('dial');
  const marksAt = m.word('dial', '100 marks');
  const forwardAt = m.word('dial', 'You always move forward');
  const keepAt = m.word('dial', 'and after 99');
  const after99 = m.at('after99');
  const smallAt = m.at('small');

  const value =
    frame < dip1
      ? stepped(frame, [
          [0, 97],
          [twoDigits, 98],
          [top99, 99],
          [top00, 100],
        ])
      : frame < from95 + 6
        ? stepped(frame, [
            [0, 97],
            [m.word('roll', 'in a car'), 98],
            [roll99, 99],
            [roll00, 100],
            [m.word('roll', '01'), 101],
            [m.word('roll', '02'), 102],
            [m.word('roll', 'and so on'), 103],
            [m.word('roll', 'and so on') + 12, 104],
          ])
        : stepped(frame, [[0, 95], ...COUNT_IDS.map((_, i) => [hopAt(i + 1), 96 + i] as const)]);
  const dip = (a: number) => 1 - pulse(frame, a, 7);
  const odoOpacity = fade(frame, 0, dialAt - 10, 10) * dip(dip1) * dip(from95 + 6);
  const panel = ramp(frame, rollAt, rollAt + 14);
  const shrink = ramp(frame, from95 - 4, from95 + 16);
  const trackOut = 1 - ramp(frame, dialAt - 12, dialAt);
  const trackIn = fade(frame, from95 + 8);

  const state = (v: number): TileState => {
    if (v === 95) return frame >= latestAt ? 'latest' : 'plain';
    if (v === 94 && frame >= no94) return 'bad';
    if (v === 106 && frame >= no06 + 10) return 'bad';
    if (v >= 96 && v <= 105 && frame >= hopAt(v - 95) + 6) return 'ok';
    return 'plain';
  };

  // The dial.
  const dialIn = fade(frame, dialAt - 4, Number.POSITIVE_INFINITY, 14);
  const phase1 = 1 - ramp(frame, after99 - 8, after99);
  const phase2 = ramp(frame, after99, after99 + 8) * (1 - ramp(frame, smallAt - 8, smallAt));
  const phase3 = ramp(frame, smallAt, smallAt + 8);

  return (
    <>
      {/* Two digits, then the mileage counter of a car. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: odoOpacity,
          transformOrigin: '960px 470px',
          transform: `translate(${740 * shrink}px, ${-262 * shrink}px) scale(${lerp(1, 0.34, shrink)})`,
        }}
      >
        <Dashboard value={value} panel={panel} />
        <div
          style={{
            position: 'absolute',
            left: 960 - 200,
            width: 400,
            top: 408,
            textAlign: 'center',
            opacity: fade(frame, twoDigits, rollAt - 12, 8),
          }}
        >
          <Text size={34} color={C.gold2}>
            only two digits
          </Text>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1380,
          top: 520,
          opacity: fade(frame, top00 + 6, rollAt - 12, 8),
        }}
      >
        <Pill size={34} color={C.goldInk} bg={C.gold} border={C.gold2}>
          after 99 comes 00
        </Pill>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1400,
          top: 520,
          opacity: fade(frame, roll00 + 8, from95 - 6, 8),
        }}
      >
        <Pill size={34} color={C.goldInk} bg={C.gold} border={C.gold2}>
          99 → 00
        </Pill>
      </div>

      {/* Counting up from 95, past 99. */}
      <div style={{ opacity: trackIn * trackOut }}>
        <div
          style={{
            position: 'absolute',
            left: center(95) - 100,
            width: 200,
            top: 236,
            textAlign: 'center',
            opacity: fade(frame, latestAt - 4),
          }}
        >
          <Text size={28} color={C.gold2}>
            latest bid
          </Text>
        </div>
        <div style={{ opacity: fade(frame, latestAt - 4) }}>
          <PlayingCard id={card('9H')} w={78} x={center(95) - 82} y={280} compact />
          <PlayingCard id={card('5S')} w={78} x={center(95) + 4} y={280} compact />
        </div>
        {Array.from({ length: N }, (_, i) => FIRST + i).map((v, i) => {
          const t = Math.min(1, pop(frame, from95 + 8 + i * 1.2));
          const bump =
            v >= 96 && v <= 105
              ? pop(frame, hopAt(v - 95) + 6)
              : v === 95
                ? pop(frame, latestAt)
                : 0;
          const scale = bump > 0 && bump < 1 ? 1 + 0.12 * Math.sin(Math.PI * Math.min(1, bump)) : 1;
          return (
            <Tile
              key={v}
              label={two(v)}
              state={state(v)}
              x={tileX(v)}
              y={TY + (1 - t) * 30}
              w={TW}
              h={TH}
              pop={scale}
              style={{ opacity: t }}
            />
          );
        })}
        {Array.from({ length: 10 }, (_, j) => j + 1).map((k) => (
          <Hop
            key={k}
            x1={center(94 + k)}
            x2={center(95 + k)}
            y={TY - 6}
            progress={ramp(frame, hopAt(k), hopAt(k) + 8)}
            label={String(k)}
            color={k === 5 ? C.gold2 : C.mint}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: (center(99) + center(100)) / 2 - 160,
            width: 320,
            top: 382,
            textAlign: 'center',
            opacity: fade(frame, hopAt(5) + 4, windowAt, 8),
          }}
        >
          <Pill size={28} color={C.goldInk} bg={C.gold} border={C.gold2}>
            after 99 comes 00
          </Pill>
        </div>
        <Hop
          x1={center(105)}
          x2={center(106)}
          y={TY - 6}
          progress={ramp(frame, no06, no06 + 10)}
          label="11"
          color={C.danger}
        />
        <Bracket
          x1={tileX(96) + 6}
          x2={tileX(105) + TW - 6}
          y={TY + TH + 16}
          progress={ramp(frame, windowAt, windowAt + 12)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            <Verdict ok size={44} /> 96 to 05: ten steps
          </span>
        </Bracket>
        <div
          style={{
            position: 'absolute',
            left: tileX(94) + TW - 30,
            top: TY - 26,
            opacity: Math.min(1, pop(frame, no94)),
            transform: `scale(${Math.min(1.1, pop(frame, no94))})`,
          }}
        >
          <Verdict ok={false} size={54} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: tileX(94) + TW - 260,
            width: 260,
            top: TY + TH + 22,
            textAlign: 'right',
            opacity: fade(frame, no94 + 6),
            fontFamily: UI,
            fontWeight: 600,
            fontSize: 30,
            color: C.danger,
          }}
        >
          backward
        </div>
        <div
          style={{
            position: 'absolute',
            left: tileX(106) + TW - 30,
            top: TY - 26,
            opacity: Math.min(1, pop(frame, no06 + 10)),
            transform: `scale(${Math.min(1.1, pop(frame, no06 + 10))})`,
          }}
        >
          <Verdict ok={false} size={54} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: tileX(106),
            width: 220,
            top: TY + TH + 22,
            textAlign: 'left',
            opacity: fade(frame, eleven),
            fontFamily: UI,
            fontWeight: 600,
            fontSize: 30,
            color: C.danger,
          }}
        >
          11 steps
        </div>
      </div>

      {/* The dial. */}
      <Dial
        cx={960}
        cy={490}
        r={280}
        opacity={dialIn}
        reveal={ramp(frame, dialAt, dialAt + 36)}
        glowTop={Math.max(pulse(frame, keepAt + 10, 18), pulse(frame, after99 + 20, 18))}
        arcs={[
          {
            from: 95,
            steps: 10,
            color: C.mint,
            progress: ramp(frame, forwardAt + 6, forwardAt + 50),
            opacity: 0.95 * phase1,
          },
          {
            from: 99,
            steps: 10,
            color: C.mint,
            progress: ramp(frame, after99 + 6, after99 + 40),
            opacity: 0.95 * phase2,
          },
          {
            from: 97,
            steps: 6,
            color: C.mint,
            progress: ramp(frame, smallAt + 6, smallAt + 32),
            opacity: 0.95 * phase3,
          },
        ]}
        dots={[
          { v: 95, color: C.gold, label: '95', opacity: fade(frame, forwardAt) * phase1 },
          { v: 105, color: C.mint, label: '05', opacity: fade(frame, forwardAt + 48) * phase1 },
          { v: 99, color: C.gold, label: '99', opacity: fade(frame, after99) * phase2 },
          { v: 109, color: C.mint, label: '09', opacity: fade(frame, after99 + 38) * phase2 },
          { v: 97, color: C.gold, label: '97', opacity: fade(frame, smallAt) * phase3 },
          { v: 103, color: C.mint, label: '03', opacity: fade(frame, smallAt + 30) * phase3 },
        ]}
      />
      {/* Always forward, round and round. */}
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'visible',
          opacity: dialIn * fade(frame, forwardAt),
        }}
        width={1}
        height={1}
      >
        <defs>
          <marker
            id="fwd"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill={C.mint} />
          </marker>
        </defs>
        <path
          d={`M ${960 + 110 * Math.cos((-150 * Math.PI) / 180)} ${490 + 110 * Math.sin((-150 * Math.PI) / 180)} A 110 110 0 1 1 ${960 + 110 * Math.cos((150 * Math.PI) / 180)} ${490 + 110 * Math.sin((150 * Math.PI) / 180)}`}
          fill="none"
          stroke={C.mint}
          strokeWidth={10}
          strokeLinecap="round"
          markerEnd="url(#fwd)"
          opacity={0.8}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 960 - 100,
          width: 200,
          top: 490 - 22,
          textAlign: 'center',
          opacity: dialIn * fade(frame, forwardAt),
        }}
      >
        <Text size={38} color={C.mint}>
          forward
        </Text>
      </div>
      <div style={{ position: 'absolute', left: 70, width: 480, top: 360, opacity: dialIn }}>
        <div style={{ opacity: fade(frame, marksAt) }}>
          <Text size={40} color={C.ink}>
            100 marks,
            <br />
            like a clock
          </Text>
        </div>
        <div style={{ marginTop: 40, opacity: fade(frame, forwardAt) }}>
          <Text size={40} color={C.mint}>
            Always forward:
            <br />1 to 10 marks
          </Text>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1380, width: 480, top: 380, opacity: dialIn }}>
        <div style={{ position: 'absolute', top: 0, opacity: fade(frame, keepAt, after99 - 8, 8) }}>
          <Text size={40} color={C.gold2}>
            After 99,
            <br />
            keep going
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 0,
            opacity: fade(frame, after99 + 8, smallAt - 8, 8),
          }}
        >
          <Text size={40} color={C.gold2}>
            Right after 99:
          </Text>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
            <Num size={64} color={C.mint}>
              00 to 09
            </Num>
            <Verdict ok size={52} />
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, opacity: fade(frame, smallAt + 20) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Num size={64} color={C.mint}>
              03
            </Num>
            <Text size={40} color={C.ink}>
              tops
            </Text>
            <Num size={64} color={C.gold2}>
              97
            </Num>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Verdict ok size={46} />
            <Text size={34} color={C.ink2}>
              6 steps up, past 99
            </Text>
          </div>
        </div>
      </div>

      <Sfx name="roll" at={twoDigits} volume={0.2} />
      <Sfx name="roll" at={top99} volume={0.2} />
      <Sfx name="roll" at={top00} volume={0.28} />
      <Sfx name="chime" at={top00 + 6} volume={0.14} />
      <Sfx name="roll" at={m.word('roll', 'in a car')} volume={0.2} />
      <Sfx name="roll" at={roll99} volume={0.2} />
      <Sfx name="roll" at={roll00} volume={0.28} />
      <Sfx name="roll" at={m.word('roll', '01')} volume={0.2} />
      <Sfx name="roll" at={m.word('roll', '02')} volume={0.2} />
      <Sfx name="whoosh" at={from95 - 4} volume={0.15} />
      {Array.from({ length: 10 }, (_, j) => (
        <Sfx key={j} name="tick" at={hopAt(j + 1) + 5} volume={j === 4 ? 0.3 : 0.22} />
      ))}
      <Sfx name="chime" at={windowAt + 4} volume={0.2} />
      <Sfx name="buzz" at={no94} volume={0.18} />
      <Sfx name="buzz" at={no06 + 10} volume={0.18} />
      <Sfx name="whoosh" at={dialAt - 6} volume={0.15} />
      <Sfx name="slide" at={forwardAt + 6} volume={0.18} />
      <Sfx name="chime" at={keepAt + 10} volume={0.14} />
      <Sfx name="slide" at={after99 + 6} volume={0.18} />
      <Sfx name="slide" at={smallAt + 6} volume={0.18} />
      <Sfx name="chime" at={smallAt + 30} volume={0.18} />
    </>
  );
}
