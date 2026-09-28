import { useCurrentFrame } from 'remotion';
import { fade, lerp, pop, ramp } from '../components/anim';
import { Num, Pill, PlayingCard, Sfx, Text, Verdict } from '../components/base';
import { Bracket, Tile, type TileState } from '../components/teaching';
import { card } from '../cards';
import { C, DISPLAY, UI } from '../theme';
import { useMarks } from '../timeline';

const FIRST = 86;
const N = 13;
const TW = 96;
const TH = 108;
const GAP = 12;
const X0 = 470;
const TY = 300;
const tileX = (v: number) => X0 + (v - FIRST) * (TW + GAP);
const HAND = ['2*', '3D', '4C', '1*', '6C'] as const;

function Clock({
  cx,
  cy,
  r,
  left,
  opacity,
}: {
  cx: number;
  cy: number;
  r: number;
  left: number;
  opacity: number;
}) {
  const share = left / 60;
  const a = share * 2 * Math.PI;
  const end = [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = share > 0.5 ? 1 : 0;
  const color = left <= 10 ? C.danger : C.gold;
  return (
    <div style={{ opacity }}>
      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        width={1}
        height={1}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r + 26}
          fill="rgba(3,22,16,0.6)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={18}
        />
        {share > 0.001 && (
          <path
            d={
              share >= 0.999
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`
                : `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${end[0]} ${end[1]}`
            }
            fill="none"
            stroke={color}
            strokeWidth={18}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cx - 120,
          width: 240,
          top: cy - 58,
          textAlign: 'center',
        }}
      >
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: C.ink }}>
          {Math.ceil(left)}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: cx - 120,
          width: 240,
          top: cy + 48,
          textAlign: 'center',
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 26,
          color: C.ink2,
        }}
      >
        seconds
      </div>
    </div>
  );
}

export function End() {
  const frame = useCurrentFrame();
  const m = useMarks('end');
  const ruleAt = m.at('rule');
  const latestAt = m.at('example');
  const rangeAt = m.word('example', '88 to 97');
  const tensAt = m.word('example', 'your tens card');
  const stuckAt = m.at('stuck');
  const no8 = m.word('stuck', 'no 8');
  const no9 = m.word('stuck', 'no 9');
  const noAction = m.word('stuck', 'no action card');
  const loseAt = m.word('stuck', "you're stuck");
  const openAt = m.at('open');
  const p2Wins = m.word('open', 'Player 2 wins');
  const clockAt = m.at('clock');
  const mustBid = m.word('clock', 'If it runs out while');
  const swapAt = m.word('clock', "during Player 2's swap");

  const part1 = 1 - ramp(frame, openAt - 12, openAt);
  const state = (v: number): TileState => {
    if (v === 87) return 'latest';
    if (v >= 88 && v <= 97 && frame >= rangeAt + (v - 88) * 2)
      return frame >= loseAt ? 'dim' : 'ok';
    return 'plain';
  };
  const tens = ramp(frame, tensAt, tensAt + 10);
  const left = lerp(
    60,
    0,
    ramp(frame, clockAt + 20, mustBid + 10, (t) => t),
  );

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 104,
          display: 'flex',
          justifyContent: 'center',
          opacity: fade(frame, ruleAt) * part1,
        }}
      >
        <Pill size={34} color={C.gold2} border="rgba(229,185,90,0.5)">
          No legal bid on your turn: you lose
        </Pill>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: 330,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 26,
          opacity: fade(frame, ruleAt + 20, latestAt - 8, 8),
        }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              width: 150,
              height: 210,
              borderRadius: 14,
              border: `4px dashed ${C.danger}`,
              background: 'rgba(255,134,114,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 96,
              color: C.danger,
            }}
          >
            ?
          </div>
        ))}
        <div
          style={{
            marginLeft: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            opacity: fade(frame, m.word('rule', 'that player loses')),
          }}
        >
          <Verdict ok={false} size={72} />
          <Text size={52} color={C.danger} weight={700}>
            that player loses
          </Text>
        </div>
      </div>
      <div style={{ opacity: part1 }}>
        {/* The latest bid and the numbers it allows. */}
        <div style={{ opacity: fade(frame, latestAt) }}>
          <div
            style={{ position: 'absolute', left: 110, width: 280, top: 214, textAlign: 'center' }}
          >
            <Text size={28} color={C.gold2}>
              latest bid
            </Text>
          </div>
          <PlayingCard id={card('8H')} w={100} x={140} y={262} />
          <PlayingCard id={card('7S')} w={100} x={256} y={262} />
        </div>
        {Array.from({ length: N }, (_, i) => FIRST + i).map((v, i) => {
          const t = Math.min(1, pop(frame, latestAt + 4 + i * 1.2));
          const lit = v >= 88 && v <= 97 ? tens : 0;
          const label = (
            <span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0 5px',
                  margin: '0 1px',
                  borderRadius: 8,
                  background: `rgba(229,185,90,${lit})`,
                  color: lit > 0.5 ? C.goldInk : undefined,
                }}
              >
                {String(v)[0]}
              </span>
              {String(v)[1]}
            </span>
          );
          return (
            <Tile
              key={v}
              label={label}
              state={state(v)}
              x={tileX(v)}
              y={TY + (1 - t) * 30}
              w={TW}
              h={TH}
              style={{ opacity: t }}
            />
          );
        })}
        <Bracket
          x1={tileX(88) + 6}
          x2={tileX(97) + TW - 6}
          y={TY + TH + 16}
          progress={ramp(frame, rangeAt, rangeAt + 12)}
        >
          88 to 97
        </Bracket>
        <div
          style={{
            position: 'absolute',
            left: tileX(88),
            width: tileX(97) + TW - tileX(88),
            top: TY + TH + 112,
            textAlign: 'center',
            opacity: fade(frame, tensAt),
          }}
        >
          <Text size={38} color={C.gold2}>
            tens card: 8 or 9
          </Text>
        </div>

        {/* Your hand has neither. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: 1920,
            top: 598,
            textAlign: 'center',
            opacity: fade(frame, stuckAt - 6),
          }}
        >
          <Text size={28} color={C.ink2}>
            your hand
          </Text>
        </div>
        {HAND.map((code, i) => (
          <PlayingCard
            key={code}
            id={card(code)}
            w={104}
            x={960 - (104 * 5 + 16 * 4) / 2 + i * 120}
            y={644}
            opacity={fade(frame, stuckAt - 6 + i * 2)}
            dim={frame >= loseAt}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: 1920,
            top: 818,
            display: 'flex',
            justifyContent: 'center',
            gap: 22,
          }}
        >
          {[
            ['no 8', no8],
            ['no 9', no9],
            ['no action card', noAction],
          ].map(([label, at]) => (
            <div
              key={label as string}
              style={{
                opacity: Math.min(1, pop(frame, at as number)),
                transform: `scale(${0.8 + 0.2 * Math.min(1, pop(frame, at as number))})`,
              }}
            >
              <Pill size={30} color="#3a0d06" bg={C.danger} border="#ffc2b6">
                {label}
              </Pill>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1330,
            top: 676,
            opacity: Math.min(1, pop(frame, loseAt)),
            transform: `scale(${0.8 + 0.2 * Math.min(1, pop(frame, loseAt))})`,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <Verdict ok={false} size={76} />
          <Text size={60} color={C.danger} weight={700}>
            you lose
          </Text>
        </div>
      </div>

      {/* Player 1 with no first bid. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: lerp(400, 120, ramp(frame, clockAt - 10, clockAt + 8)),
          display: 'flex',
          justifyContent: 'center',
          gap: 30,
          alignItems: 'center',
          opacity: fade(frame, openAt),
          transform: `scale(${lerp(1.25, 1, ramp(frame, clockAt - 10, clockAt + 8))})`,
        }}
      >
        <Pill size={34} color={C.ink}>
          Player 1 can&apos;t make the first bid
        </Pill>
        <svg width={60} height={30} viewBox="0 0 60 30" style={{ opacity: fade(frame, p2Wins) }}>
          <path
            d="M2 15 H50 M40 5 L54 15 L40 25"
            fill="none"
            stroke={C.gold2}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ opacity: fade(frame, p2Wins) }}>
          <Pill size={34} color={C.goldInk} bg={C.gold} border={C.gold2}>
            Player 2 wins
          </Pill>
        </div>
      </div>

      {/* The clock of the app. */}
      <Clock
        cx={520}
        cy={560}
        r={170}
        left={frame < clockAt ? 60 : left}
        opacity={fade(frame, clockAt)}
      />
      <div style={{ position: 'absolute', left: 820, top: 330, opacity: fade(frame, clockAt + 6) }}>
        <Text size={40} color={C.ink}>
          In the app: 60 seconds a turn
        </Text>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 820,
          top: 440,
          width: 1000,
          opacity: fade(frame, mustBid),
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '22px 28px',
          borderRadius: 22,
          background: 'rgba(3,22,16,0.55)',
          border: '2px solid rgba(255,134,114,0.5)',
        }}
      >
        <Verdict ok={false} size={60} />
        <div>
          <Text size={34} color={C.ink2} weight={500}>
            Time runs out when you must bid:
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text size={40} color={C.danger} weight={700}>
              you lose
            </Text>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 820,
          top: 630,
          width: 1000,
          opacity: fade(frame, swapAt),
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '22px 28px',
          borderRadius: 22,
          background: 'rgba(3,22,16,0.55)',
          border: '2px solid rgba(229,185,90,0.45)',
        }}
      >
        <svg width={60} height={60} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill={C.gold} />
          <path
            d="M30 42 A22 22 0 1 1 34 68"
            fill="none"
            stroke={C.goldInk}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M18 36 L30 44 L38 30"
            fill="none"
            stroke={C.goldInk}
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <Text size={34} color={C.ink2} weight={500}>
            Time runs out during Player 2&apos;s swap:
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text size={40} color={C.gold2} weight={700}>
              they keep their hand
            </Text>
          </div>
        </div>
      </div>

      <Sfx name="pop" at={ruleAt} volume={0.14} />
      <Sfx name="chime" at={rangeAt} volume={0.14} />
      <Sfx name="pop" at={no8} volume={0.16} />
      <Sfx name="pop" at={no9} volume={0.16} />
      <Sfx name="pop" at={noAction} volume={0.16} />
      <Sfx name="buzz" at={loseAt} volume={0.2} />
      <Sfx name="whoosh" at={openAt - 8} volume={0.14} />
      <Sfx name="chime" at={p2Wins} volume={0.18} />
      <Sfx name="tick" at={clockAt + 20} volume={0.16} />
      <Sfx name="tick" at={clockAt + 50} volume={0.16} />
      <Sfx name="buzz" at={mustBid + 10} volume={0.16} />
      <Sfx name="pop" at={swapAt} volume={0.16} />
    </>
  );
}
