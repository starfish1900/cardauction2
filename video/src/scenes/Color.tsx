import type { Suit } from '@cardauction/engine';
import { useCurrentFrame } from 'remotion';
import { fade, pop, pulse, ramp } from '../components/anim';
import { Num, PlayingCard, Sfx, Text, Verdict } from '../components/base';
import { RuleHeader } from '../components/rules';
import { SuitChip } from '../components/SuitChip';
import { card } from '../cards';
import { C } from '../theme';
import { useMarks } from '../timeline';
import { tr } from '../lang';

const BLUE_GLOW = '#6ea8ff';

interface Row {
  readonly cards: readonly [string, string];
  readonly value: string;
  readonly ok: boolean;
  readonly caption: string;
  readonly inAt: number;
  readonly verdictAt: number;
  readonly captionAt: number;
  readonly glow: readonly [string | undefined, string | undefined];
  readonly note?: string;
}

const ROW_Y = [292, 442, 592, 742] as const;
const CW = 96;

export function Color() {
  const frame = useCurrentFrame();
  const m = useMarks('color');
  const ruleAt = m.at('rule');
  const detailAt = m.word('rule', 'your bid needs');
  const latestAt = m.at('latest');
  const colorsAt = m.word('latest', 'in red and black');
  const targetAt = m.word('latest', "You'd like");
  const redBlackAt = m.word('no', 'red and black');

  const rows: Row[] = [
    {
      cards: ['6*', '3S'],
      value: '63',
      ok: true,
      caption: tr('the gold star is new'),
      inAt: m.at('yes'),
      verdictAt: m.word('yes', 'Yes!'),
      captionAt: m.word('yes', 'The gold star'),
      glow: [C.gold, undefined],
    },
    {
      cards: ['6H', '3S'],
      value: '63',
      ok: false,
      caption: tr('red and black: both in 58'),
      inAt: m.at('no'),
      verdictAt: m.word('no', 'No:'),
      captionAt: redBlackAt,
      glow: [undefined, undefined],
    },
    {
      cards: ['6D', '3D'],
      value: '63',
      ok: true,
      caption: tr('blue is new'),
      inAt: m.word('share', '6 of diamonds'),
      verdictAt: m.word('share', 'works'),
      captionAt: m.word('share', 'because blue'),
      glow: [BLUE_GLOW, BLUE_GLOW],
    },
    {
      cards: ['6D', '6D2'],
      value: '66',
      ok: true,
      caption: tr('both copies of one card'),
      inAt: m.word('pair', 'two 6s'),
      verdictAt: m.word('pair', 'make 66'),
      captionAt: m.word('pair', 'both copies', -0.2),
      glow: [BLUE_GLOW, BLUE_GLOW],
    },
  ];
  // The caption of the pair comes as soon as the row does: "both copies" is said before "two 6s".
  const pairRow = rows[3] as Row;
  rows[3] = { ...pairRow, captionAt: pairRow.inAt + 10 };

  const panelIn = fade(frame, latestAt - 6);
  const matchPulse = pulse(frame, redBlackAt + 8, 16);

  return (
    <>
      <RuleHeader
        n={2}
        title={tr('A new color')}
        detail={tr("one color the latest bid doesn't have")}
        opacity={fade(frame, ruleAt, Number.POSITIVE_INFINITY, 12)}
        detailOpacity={fade(frame, detailAt)}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: 380,
          display: 'flex',
          justifyContent: 'center',
          gap: 44,
          opacity: fade(frame, detailAt, latestAt - 8, 8),
        }}
      >
        {([0, 1, 2, 3, 4] as Suit[]).map((suit, i) => (
          <div
            key={suit}
            style={{
              opacity: Math.min(1, pop(frame, detailAt + i * 3)),
              transform: `scale(${0.7 + 0.3 * Math.min(1, pop(frame, detailAt + i * 3))})`,
            }}
          >
            <SuitChip suit={suit} size={130} />
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: 560,
          textAlign: 'center',
          opacity: fade(frame, detailAt + 16, latestAt - 8, 8),
        }}
      >
        <Text size={40} color={C.ink2}>
          {tr('five colors: one per suit')}
        </Text>
      </div>
      {/* The latest bid and its colors. */}
      <div
        style={{
          position: 'absolute',
          left: 90,
          top: 236,
          width: 520,
          height: 640,
          borderRadius: 28,
          background: 'rgba(3,22,16,0.45)',
          border: '2px solid rgba(255,255,255,0.08)',
          opacity: panelIn,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 90,
          width: 520,
          top: 262,
          textAlign: 'center',
          opacity: panelIn,
        }}
      >
        <Text size={30} color={C.gold2}>
          {tr('latest bid')}
        </Text>
      </div>
      <PlayingCard
        id={card('5H')}
        w={150}
        x={186}
        y={320}
        opacity={Math.min(1, pop(frame, latestAt))}
        glow={matchPulse > 0.05 ? `rgba(255,134,114,${matchPulse})` : undefined}
      />
      <PlayingCard
        id={card('8S')}
        w={150}
        x={364}
        y={320}
        opacity={Math.min(1, pop(frame, latestAt + 5))}
        glow={matchPulse > 0.05 ? `rgba(255,134,114,${matchPulse})` : undefined}
      />
      <div
        style={{
          position: 'absolute',
          left: 90,
          width: 520,
          top: 548,
          textAlign: 'center',
          opacity: fade(frame, latestAt + 10),
        }}
      >
        <Num size={104}>58</Num>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 90,
          width: 520,
          top: 690,
          display: 'flex',
          justifyContent: 'center',
          gap: 34,
          opacity: fade(frame, colorsAt),
        }}
      >
        {([3, 4] as Suit[]).map((suit) => (
          <div
            key={suit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transform: `scale(${1 + 0.12 * matchPulse})`,
            }}
          >
            <SuitChip
              suit={suit}
              size={58}
              style={{
                boxShadow: matchPulse > 0.05 ? `0 0 0 ${4 * matchPulse}px ${C.danger}` : undefined,
              }}
            />
            <Text size={34} color={C.ink}>
              {suit === 3 ? tr('red') : tr('black')}
            </Text>
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 90,
          width: 520,
          top: 780,
          textAlign: 'center',
          opacity: fade(frame, colorsAt + 8),
        }}
      >
        <Text size={28} color={C.ink2} weight={500}>
          {tr('colors already in 58')}
        </Text>
      </div>

      {/* The bids you might make. */}
      <div style={{ position: 'absolute', left: 700, top: 222, opacity: fade(frame, targetAt) }}>
        <Text size={32} color={C.ink2} weight={500}>
          {tr("You'd like to bid")} <span style={{ color: C.ink, fontWeight: 700 }}>63</span>
          {tr(':')}
        </Text>
      </div>
      {rows.map((row, i) => {
        const t = Math.min(1, pop(frame, row.inAt));
        const next = rows[i + 1];
        const dim = next ? 1 - 0.45 * ramp(frame, next.inAt, next.inAt + 10) : 1;
        const y = ROW_Y[i] ?? 0;
        const lit = ramp(frame, row.captionAt, row.captionAt + 8);
        const bad = !row.ok && frame >= row.verdictAt;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              opacity: t * dim,
              transform: `translateX(${(1 - t) * 40}px)`,
            }}
          >
            <PlayingCard
              id={card(row.cards[0])}
              w={CW}
              x={720}
              y={y}
              glow={
                lit > 0 && row.glow[0] ? row.glow[0] : bad ? 'rgba(255,134,114,0.9)' : undefined
              }
            />
            <PlayingCard
              id={card(row.cards[1])}
              w={CW}
              x={828}
              y={y}
              glow={
                lit > 0 && row.glow[1] ? row.glow[1] : bad ? 'rgba(255,134,114,0.9)' : undefined
              }
            />
            <div style={{ position: 'absolute', left: 952, top: y + 30 }}>
              <Num size={76} color={C.ink}>
                = {row.value}
              </Num>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 1150,
                top: y + 32,
                opacity: Math.min(1, pop(frame, row.verdictAt)),
                transform: `scale(${Math.min(1.1, pop(frame, row.verdictAt))})`,
              }}
            >
              <Verdict ok={row.ok} size={68} />
            </div>
            <div
              style={{
                position: 'absolute',
                left: 1244,
                top: y + 44,
                width: 620,
                opacity: fade(frame, row.captionAt),
              }}
            >
              <Text size={36} color={row.ok ? C.mint : C.danger}>
                {row.caption}
              </Text>
            </div>
          </div>
        );
      })}

      <Sfx name="whoosh" at={ruleAt} volume={0.14} />
      <Sfx name="card" at={latestAt + 2} volume={0.22} />
      <Sfx name="card" at={latestAt + 7} volume={0.22} />
      {rows.map((row, i) => (
        <Sfx key={`in${i}`} name="slide" at={row.inAt} volume={0.16} />
      ))}
      {rows.map((row, i) => (
        <Sfx
          key={`v${i}`}
          name={row.ok ? 'chime' : 'buzz'}
          at={row.verdictAt}
          volume={row.ok ? 0.2 : 0.18}
        />
      ))}
    </>
  );
}
