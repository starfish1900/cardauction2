import { useCurrentFrame } from 'remotion';
import { fade, pop, ramp } from '../components/anim';
import { PlayingCard, Sfx, Text, Verdict } from '../components/base';
import { RuleCard, RuleHeader, StairsIcon, SuitRow } from '../components/rules';
import { Bracket, Hop, Tile, type TileState } from '../components/teaching';
import { card } from '../cards';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';
import { tr } from '../lang';

const FIRST = 55;
const LAST = 70;
const TW = 96;
const TH = 116;
const GAP = 10;
const X0 = (1920 - ((LAST - FIRST + 1) * (TW + GAP) - GAP)) / 2;
const TY = 560;
const tileX = (v: number) => X0 + (v - FIRST) * (TW + GAP);
const center = (v: number) => tileX(v) + TW / 2;

export function Count() {
  const frame = useCurrentFrame();
  const m = useMarks('count');
  const titleAt = m.at('heart');
  const rulesAt = m.word('heart', 'A bid must');
  const ruleAt = m.at('rule');
  const detailAt = m.word('rule', 'Your number');
  const trackAt = m.at('latest', -0.3);
  const latestAt = m.word('latest', '58');
  // Hop k (1–10) lands on 58 + k: one step at a time, in time with the counting.
  const hopAt = (k: number): number => {
    if (k === 1) return m.at('c1', 0.1);
    if (k === 2) return m.at('c2', 0.1);
    const from = m.at('c10', 0.1);
    const to = m.word('c10', '68');
    return from + ((k - 3) * (to - from)) / 7;
  };
  const rangeAt = m.at('range');
  const no58 = m.word('nope', '58 itself');
  const no69 = m.word('nope', 'And 69');
  const eleven = m.word('nope', 'eleven steps');

  const cardsOut = ramp(frame, ruleAt - 6, ruleAt + 6);
  const hopsDim = 1 - 0.5 * ramp(frame, rangeAt, rangeAt + 10);

  const state = (v: number): TileState => {
    if (v === 58) return frame >= no58 ? 'bad' : frame >= latestAt ? 'latest' : 'plain';
    if (v === 69 && frame >= no69 + 10) return 'bad';
    if (v >= 59 && v <= 68 && frame >= hopAt(v - 58) + 6) return 'ok';
    return 'plain';
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 150,
          textAlign: 'center',
          opacity: fade(frame, titleAt, ruleAt - 6, 10),
        }}
      >
        <Text size={56} color={C.gold2} weight={700}>
          {tr('The heart of the game')}
        </Text>
      </div>
      {/* The two rules. */}
      <RuleCard
        n={1}
        title={tr('Count up')}
        x={370}
        y={340}
        opacity={Math.min(1, pop(frame, rulesAt)) * (1 - cardsOut)}
        scale={0.92 + 0.08 * Math.min(1, pop(frame, rulesAt))}
      >
        <StairsIcon size={90} />
      </RuleCard>
      <RuleCard
        n={2}
        title={tr('A new color')}
        x={990}
        y={340}
        opacity={Math.min(1, pop(frame, rulesAt + 8)) * (1 - cardsOut)}
        scale={0.92 + 0.08 * Math.min(1, pop(frame, rulesAt + 8))}
      >
        <SuitRow />
      </RuleCard>

      <RuleHeader
        n={1}
        title={tr('Count up')}
        detail={tr('1 to 10 steps above the latest bid')}
        opacity={fade(frame, ruleAt, Number.POSITIVE_INFINITY, 12)}
        detailOpacity={fade(frame, detailAt)}
      />

      {/* The latest bid, as cards. */}
      <div style={{ opacity: fade(frame, latestAt - 4) }}>
        <div
          style={{
            position: 'absolute',
            left: center(58) - 160,
            width: 320,
            top: 236,
            textAlign: 'center',
          }}
        >
          <Text size={28} color={C.gold2}>
            {tr('latest bid')}
          </Text>
        </div>
        <PlayingCard id={card('5H')} w={78} x={center(58) - 82} y={280} compact />
        <PlayingCard id={card('8S')} w={78} x={center(58) + 4} y={280} compact />
      </div>

      {/* The number line. */}
      {Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i).map((v, i) => {
        const t = Math.min(1, pop(frame, trackAt + i * 1.2));
        const s = state(v);
        const bump =
          v === 58 ? pop(frame, latestAt) : v >= 59 && v <= 68 ? pop(frame, hopAt(v - 58) + 6) : 0;
        const scale = bump > 0 && bump < 1 ? 1 + 0.12 * Math.sin(Math.PI * Math.min(1, bump)) : 1;
        return (
          <Tile
            key={v}
            label={String(v)}
            state={s}
            x={tileX(v)}
            y={TY + (1 - t) * 30}
            w={TW}
            h={TH}
            pop={scale}
            style={{ opacity: t }}
          />
        );
      })}

      {/* Counting up, one hop per step. */}
      <div style={{ opacity: hopsDim }}>
        {Array.from({ length: 10 }, (_, j) => j + 1).map((k) => (
          <Hop
            key={k}
            x1={center(57 + k)}
            x2={center(58 + k)}
            y={TY - 6}
            progress={ramp(frame, hopAt(k), hopAt(k) + 8)}
            label={String(k)}
          />
        ))}
      </div>
      <Hop
        x1={center(68)}
        x2={center(69)}
        y={TY - 6}
        progress={ramp(frame, no69, no69 + 10)}
        label="11"
        color={C.danger}
      />

      <Bracket
        x1={tileX(59) + 6}
        x2={tileX(68) + TW - 6}
        y={TY + TH + 16}
        progress={ramp(frame, rangeAt, rangeAt + 12)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <Verdict ok size={44} /> {tr('59 to 68: fine')}
        </span>
      </Bracket>

      {/* 58 is no step up; 69 is eleven steps. */}
      <div
        style={{
          position: 'absolute',
          left: tileX(58) + TW - 30,
          top: TY - 26,
          opacity: Math.min(1, pop(frame, no58)),
          transform: `scale(${Math.min(1.1, pop(frame, no58))})`,
        }}
      >
        <Verdict ok={false} size={54} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: tileX(58) + TW - 260,
          width: 260,
          top: TY + TH + 22,
          textAlign: 'right',
          opacity: fade(frame, no58 + 6),
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 30,
          color: C.danger,
        }}
      >
        {tr('no step up')}
      </div>
      <div
        style={{
          position: 'absolute',
          left: tileX(69) + TW - 30,
          top: TY - 26,
          opacity: Math.min(1, pop(frame, no69 + 10)),
          transform: `scale(${Math.min(1.1, pop(frame, no69 + 10))})`,
        }}
      >
        <Verdict ok={false} size={54} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: tileX(69),
          width: 200,
          top: TY + TH + 22,
          textAlign: 'left',
          opacity: fade(frame, eleven),
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 30,
          color: C.danger,
        }}
      >
        {tr('11 steps')}
      </div>

      <Sfx name="pop" at={rulesAt} volume={0.2} />
      <Sfx name="pop" at={rulesAt + 8} volume={0.2} />
      <Sfx name="whoosh" at={ruleAt} volume={0.15} />
      <Sfx name="chime" at={latestAt} volume={0.12} />
      {Array.from({ length: 10 }, (_, j) => (
        <Sfx key={j} name="tick" at={hopAt(j + 1) + 5} volume={0.22} />
      ))}
      <Sfx name="chime" at={rangeAt + 4} volume={0.2} />
      <Sfx name="buzz" at={no58} volume={0.18} />
      <Sfx name="buzz" at={no69 + 10} volume={0.18} />
    </>
  );
}
