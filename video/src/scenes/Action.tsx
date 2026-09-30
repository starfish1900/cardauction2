import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { easeInOut, fade, lerp, pop, ramp, toss } from '../components/anim';
import { Num, PlayingCard, Sfx, Text, Verdict } from '../components/base';
import { SuitRow } from '../components/rules';
import { Bracket, Dial, Hop, Slot, Tile, type TileState } from '../components/teaching';
import { card } from '../cards';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';
import { tr } from '../lang';

const BLUE = '#6ea8ff';
const ROW_Y = 196;
const CARD_W = 140;
const SLOT_L = 652;
const CARD_5 = 812;
const CARD_8 = 968;
const SLOT_R = 1128;
const TW = 66;
const TH = 80;
const STEP = 76;
const TY = 700;

interface Place {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/**
 * Where a thing is, moving from place to place: each key frame is reached over `frames`, along an
 * arc lifted by its `lift` (negative: dipping under what lies between).
 */
function path(
  frame: number,
  keys: readonly (readonly [number, Place, number?])[],
  frames = 18,
): Place {
  let current = keys[0]?.[1] as Place;
  for (let i = 1; i < keys.length; i++) {
    const [at, next, lift = 50] = keys[i] as readonly [number, Place, number?];
    if (frame < at) break;
    const t = ramp(frame, at, at + frames, easeInOut);
    const [x, y] = toss(current.x, current.y, next.x, next.y, t, lift);
    const moving = { x, y, w: lerp(current.w, next.w, t) };
    if (t < 1) return moving;
    current = next;
  }
  return current;
}

function Formula({ children, opacity }: { children: ReactNode; opacity: number }) {
  return (
    <div
      style={{ position: 'absolute', left: 0, right: 0, top: 488, textAlign: 'center', opacity }}
    >
      <Num size={72} color={C.gold2}>
        {children}
      </Num>
    </div>
  );
}

export function Action() {
  const frame = useCurrentFrame();
  const m = useMarks('action');
  const upDownAt = m.word('intro', 'moves the latest bid');
  const sidesAt = m.at('sides');
  const leftAt = m.word('sides', 'on the left');
  const rightAt = m.word('sides', 'on the right');
  const exampleAt = m.at('example');
  const cardsAt = m.word('example', 'your cards can make 72');
  const nothingAt = m.word('example', 'but nothing');
  const plusAt = m.at('plus');
  const plusFormula = m.word('plus', '58 plus 10');
  const fitsAt = m.at('fits');
  const rangeAt = m.word('fits', '69 to 78');
  const fitAt = m.word('fits', '72 fits');
  const minusAt = m.at('minus');
  const minusFormula = m.word('minus', '58 minus 10');
  const minusRange = m.word('minus', 'you may bid');
  const allowedAt = m.word('minus', 'This time');
  const wrapAt = m.at('wrapplus');
  const wpJump = m.word('wrapplus', '95 plus 10');
  const wpRange = m.word('wrapplus', 'so you may bid');
  const wmAt = m.at('wrapminus');
  const wmJump = m.word('wrapminus', '03 minus 10');
  const wmRange = m.word('wrapminus', 'you may bid');
  const colorAt = m.at('stillcolor');

  // The action card: shown big, tried on each side, held in your hand, then played.
  const big: Place = { x: 840, y: 250, w: 240 };
  const left: Place = { x: SLOT_L, y: ROW_Y, w: CARD_W };
  const right: Place = { x: SLOT_R, y: ROW_Y, w: CARD_W };
  const inHand: Place = { x: 1712, y: 246, w: 96 };
  const hold: Place = { x: 1330, y: ROW_Y, w: CARD_W };
  const action = path(frame, [
    [0, big],
    [sidesAt - 14, hold],
    [leftAt - 8, left, -250],
    [rightAt - 8, right, -250],
    [cardsAt, inHand],
    [plusAt, left, -260],
    [minusAt, right, -250],
  ]);
  const actionOpacity = fade(frame, m.at('intro', 0.2), wrapAt - 14, 12);
  const introOut = 1 - ramp(frame, sidesAt - 6, sidesAt + 6);
  const rowIn = fade(frame, sidesAt - 4, wrapAt - 14, 12);
  const slotLit = (place: Place) =>
    Math.abs(action.x - place.x) < 4 && Math.abs(action.y - place.y) < 4 ? 1 : 0;

  // The number line, which pans left for the minus side.
  const camera = lerp(68, 55, ramp(frame, minusAt, minusAt + 24));
  const tileX = (v: number) => 960 + (v - camera) * STEP - TW / 2;
  const center = (v: number) => tileX(v) + TW / 2;
  const trackIn = fade(frame, exampleAt, wrapAt - 14, 12);
  const plusLanded = plusFormula + 16;
  const minusLanded = minusFormula + 16;
  const minusPhase = frame >= minusAt;
  const state = (v: number): TileState => {
    if (!minusPhase) {
      if (v === 58) return frame >= plusLanded ? 'ref' : 'latest';
      if (v === 68 && frame >= plusLanded) return 'latest';
      if (v >= 69 && v <= 78 && frame >= rangeAt + (v - 69) * 2) return 'ok';
      if (v >= 59 && v <= 68 && frame >= nothingAt && frame < plusAt) return 'dim';
      return 'plain';
    }
    if (v === 48 && frame >= minusLanded) return 'latest';
    if (v >= 49 && v <= 58 && frame >= minusRange + (v - 49) * 2) return 'ok';
    if (v === 58) return frame >= minusLanded ? 'ref' : 'latest';
    return 'plain';
  };

  // The dial for the rollovers.
  const dialIn = fade(frame, wrapAt - 6, Number.POSITIVE_INFINITY, 14);
  const plusSide = 1 - ramp(frame, wmAt - 8, wmAt);
  const minusSide = ramp(frame, wmAt, wmAt + 8);

  return (
    <>
      {/* An action card: plus or minus 10. */}
      <div style={{ opacity: fade(frame, m.at('intro', 0.4)) * introOut }}>
        <div
          style={{
            position: 'absolute',
            left: 1130,
            top: 290,
            opacity: fade(frame, upDownAt),
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <svg width={40} height={40} viewBox="0 0 10 10">
            <path d="M5 0 L10 8 L0 8 Z" fill={C.mint} />
          </svg>
          <Text size={46} color={C.mint}>
            {tr('up 10')}
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1130,
            top: 470,
            opacity: fade(frame, upDownAt + 12),
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <svg width={40} height={40} viewBox="0 0 10 10">
            <path d="M5 10 L10 2 L0 2 Z" fill={C.danger} />
          </svg>
          <Text size={46} color={C.danger}>
            {tr('down 10')}
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 300,
            width: 480,
            top: 380,
            textAlign: 'right',
            opacity: fade(frame, m.word('intro', 'Just before')),
          }}
        >
          <Text size={40} color={C.ink2}>
            {tr('just before')}
            <br />
            {tr('you bid')}
          </Text>
        </div>
      </div>

      {/* The latest bid, with a place on each side for an action card. */}
      <div style={{ opacity: rowIn }}>
        <div
          style={{
            position: 'absolute',
            left: CARD_5 - 80,
            width: 2 * CARD_W + 16 + 160,
            top: ROW_Y - 50,
            textAlign: 'center',
          }}
        >
          <Text size={30} color={C.gold2}>
            {tr('latest bid')}
          </Text>
        </div>
        <Slot
          w={CARD_W}
          label="+10"
          x={SLOT_L}
          y={ROW_Y}
          lit={Math.max(slotLit(left), frame >= leftAt && frame < rightAt ? 1 : 0)}
        />
        <Slot
          w={CARD_W}
          label="−10"
          x={SLOT_R}
          y={ROW_Y}
          lit={Math.max(slotLit(right), frame >= rightAt && frame < exampleAt ? 1 : 0)}
        />
        <div
          style={{
            position: 'absolute',
            left: SLOT_L,
            width: CARD_W,
            top: ROW_Y + CARD_W * 1.4 + 12,
            textAlign: 'center',
            opacity: fade(frame, leftAt),
          }}
        >
          <Text size={30} color={C.mint}>
            {tr('adds 10')}
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            left: SLOT_R - 20,
            width: CARD_W + 40,
            top: ROW_Y + CARD_W * 1.4 + 12,
            textAlign: 'center',
            opacity: fade(frame, rightAt),
          }}
        >
          <Text size={30} color={C.danger}>
            {tr('takes 10')}
          </Text>
        </div>
        <PlayingCard id={card('5H')} w={CARD_W} x={CARD_5} y={ROW_Y} />
        <PlayingCard id={card('8S')} w={CARD_W} x={CARD_8} y={ROW_Y} />
      </div>

      {/* Your cards. */}
      <div style={{ opacity: fade(frame, cardsAt - 6, wrapAt - 14, 12) }}>
        <div
          style={{
            position: 'absolute',
            left: 1440,
            top: 180,
            width: 420,
            height: 248,
            borderRadius: 22,
            background: 'rgba(3,22,16,0.45)',
            border: '2px solid rgba(255,255,255,0.08)',
          }}
        />
        <div style={{ position: 'absolute', left: 1464, top: 196 }}>
          <Text size={28} color={C.ink2}>
            {tr('your cards')}
          </Text>
        </div>
        <PlayingCard
          id={card('7H')}
          w={96}
          x={1464}
          y={246}
          glow={frame >= fitAt ? BLUE : undefined}
        />
        <PlayingCard
          id={card('2C')}
          w={96}
          x={1570}
          y={246}
          glow={frame >= fitAt ? BLUE : undefined}
        />
        <div style={{ position: 'absolute', left: 1464, top: 390 }}>
          <Text size={28} color={BLUE}>
            {tr('make 72')}
          </Text>
        </div>
      </div>

      {actionOpacity > 0 && (
        <PlayingCard
          id={card('A0')}
          w={action.w}
          x={action.x}
          y={action.y}
          opacity={actionOpacity}
          glow={frame >= plusAt - 4 && frame < wrapAt ? C.gold : undefined}
        />
      )}

      <Formula opacity={fade(frame, plusFormula, minusAt - 4, 8)}>58 + 10 = 68</Formula>
      <Formula opacity={fade(frame, minusFormula, wrapAt - 14, 8)}>58 − 10 = 48</Formula>

      {/* The number line. */}
      <div style={{ opacity: trackIn }}>
        {Array.from({ length: 41 }, (_, i) => 42 + i).map((v) => (
          <Tile
            key={v}
            label={String(v)}
            state={state(v)}
            x={tileX(v)}
            y={TY}
            w={TW}
            h={TH}
            style={{
              opacity: Math.min(
                1,
                Math.max(0, (tileX(v) - 16) / 70),
                Math.max(0, (1904 - tileX(v) - TW) / 70),
              ),
              ...(v === 72 && frame >= cardsAt && !minusPhase
                ? { boxShadow: `0 0 0 4px ${BLUE}` }
                : {}),
            }}
          />
        ))}
        <div style={{ opacity: 1 - ramp(frame, minusAt - 6, minusAt) }}>
          <Hop
            x1={center(58)}
            x2={center(68)}
            y={TY - 6}
            progress={ramp(frame, plusFormula, plusFormula + 16)}
            label="+10"
            color={C.gold2}
          />
        </div>
        <Hop
          x1={center(58)}
          x2={center(48)}
          y={TY - 6}
          progress={ramp(frame, minusFormula, minusFormula + 16)}
          label="−10"
          color={C.gold2}
        />
        <div style={{ opacity: fade(frame, nothingAt, plusAt - 4, 8) }}>
          <Bracket x1={tileX(59) + 4} x2={tileX(68) + TW - 4} y={TY + TH + 14} color={C.danger}>
            {tr("your cards can't make these")}
          </Bracket>
        </div>
        <div style={{ opacity: 1 - ramp(frame, minusAt - 6, minusAt) }}>
          <Bracket
            x1={tileX(69) + 4}
            x2={tileX(78) + TW - 4}
            y={TY + TH + 14}
            progress={ramp(frame, rangeAt, rangeAt + 12)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              {tr('69 to 78')}
              {frame >= fitAt && (
                <>
                  <Verdict ok size={40} /> {tr('72 fits!')}
                </>
              )}
            </span>
          </Bracket>
        </div>
        <Bracket
          x1={tileX(49) + 4}
          x2={tileX(58) + TW - 4}
          y={TY + TH + 14}
          progress={ramp(frame, minusRange, minusRange + 12)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {tr('49 to 58')}
            {frame >= allowedAt && (
              <>
                <Verdict ok size={40} /> {tr('58 allowed')}
              </>
            )}
          </span>
        </Bracket>
      </div>

      {/* Rolling over, on the dial. */}
      <Dial
        cx={620}
        cy={500}
        r={250}
        opacity={dialIn}
        arcs={[
          {
            from: 95,
            steps: 10,
            color: C.gold2,
            dashed: true,
            width: 10,
            progress: ramp(frame, wpJump, wpJump + 24),
            opacity: plusSide,
          },
          {
            from: 105,
            steps: 10,
            color: C.mint,
            progress: ramp(frame, wpRange, wpRange + 24),
            opacity: 0.95 * plusSide,
          },
          {
            from: 93,
            steps: 10,
            color: C.gold2,
            dashed: true,
            width: 10,
            reverse: true,
            progress: ramp(frame, wmJump, wmJump + 24),
            opacity: minusSide * (1 - ramp(frame, wmRange, wmRange + 6)),
          },
          {
            from: 93,
            steps: 10,
            color: C.mint,
            progress: ramp(frame, wmRange, wmRange + 24),
            opacity: 0.95 * minusSide,
          },
        ]}
        dots={[
          { v: 95, color: C.gold, label: '95', opacity: fade(frame, wrapAt) * plusSide },
          { v: 105, color: C.gold, label: '05', opacity: fade(frame, wpJump + 22) * plusSide },
          { v: 115, color: C.mint, label: '15', opacity: fade(frame, wpRange + 22) * plusSide },
          { v: 103, color: C.gold, label: '03', opacity: fade(frame, wmAt) * minusSide },
          { v: 93, color: C.gold, label: '93', opacity: fade(frame, wmJump + 22) * minusSide },
        ]}
      />
      <div style={{ position: 'absolute', left: 1080, top: 250, opacity: dialIn }}>
        <div style={{ position: 'absolute', top: 0, opacity: plusSide }}>
          <div style={{ opacity: fade(frame, wpJump) }}>
            <Num size={96} color={C.gold2}>
              95 + 10 = 05
            </Num>
          </div>
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: fade(frame, wpRange),
            }}
          >
            <Text size={40} color={C.ink}>
              {tr('bid')}
            </Text>
            <Num size={72} color={C.mint}>
              {tr('06 to 15')}
            </Num>
            <Verdict ok size={52} />
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, opacity: minusSide }}>
          <div style={{ opacity: fade(frame, wmJump) }}>
            <Num size={96} color={C.gold2}>
              03 − 10 = 93
            </Num>
          </div>
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: fade(frame, wmRange),
            }}
          >
            <Text size={40} color={C.ink}>
              {tr('bid')}
            </Text>
            <Num size={72} color={C.mint}>
              {tr('94 to 03')}
            </Num>
            <Verdict ok size={52} />
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1080,
          top: 640,
          opacity: fade(frame, colorAt),
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '18px 26px',
          borderRadius: 24,
          background: 'rgba(3,22,16,0.6)',
          border: '2px solid rgba(229,185,90,0.35)',
        }}
      >
        <div>
          <Text size={32} color={C.gold2}>
            {tr('Rule 2 still applies:')}
          </Text>
          <div style={{ marginTop: 6 }}>
            <Text size={32} color={C.ink}>
              {tr('bring a new color')}
            </Text>
          </div>
        </div>
        <SuitRow size={40} gap={8} />
      </div>

      <Sfx name="whoosh" at={m.at('intro', 0.3)} volume={0.15} />
      <Sfx name="pop" at={upDownAt} volume={0.16} />
      <Sfx name="pop" at={upDownAt + 12} volume={0.16} />
      <Sfx name="slide" at={leftAt - 6} volume={0.2} />
      <Sfx name="slide" at={rightAt - 6} volume={0.2} />
      <Sfx name="card" at={cardsAt + 10} volume={0.2} />
      <Sfx name="card" at={plusAt + 14} volume={0.26} />
      <Sfx name="tick" at={plusFormula + 12} volume={0.22} />
      <Sfx name="chime" at={fitAt} volume={0.22} />
      <Sfx name="card" at={minusAt + 14} volume={0.26} />
      <Sfx name="tick" at={minusFormula + 12} volume={0.22} />
      <Sfx name="chime" at={allowedAt} volume={0.2} />
      <Sfx name="whoosh" at={wrapAt - 8} volume={0.15} />
      <Sfx name="roll" at={wpJump + 10} volume={0.22} />
      <Sfx name="slide" at={wpRange + 4} volume={0.18} />
      <Sfx name="roll" at={wmJump + 10} volume={0.22} />
      <Sfx name="slide" at={wmRange + 4} volume={0.18} />
      <Sfx name="pop" at={colorAt} volume={0.18} />
    </>
  );
}
