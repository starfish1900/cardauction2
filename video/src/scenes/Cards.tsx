import type { Suit } from '@cardauction/engine';
import { useCurrentFrame } from 'remotion';
import { easeOut, fade, lerp, life, pop, ramp, toss } from '../components/anim';
import { FlipCard, Num, Pill, PlayingCard, Sfx, Text } from '../components/base';
import { SuitChip } from '../components/SuitChip';
import { card } from '../cards';
import { C, SUIT_NAMES, SUIT_ON_FELT, UI } from '../theme';
import { useMarks } from '../timeline';

const CODE = ['*', 'D', 'C', 'H', 'S'] as const;
const CW = 96;
const COL = 110;
const ROW = 146;
const GX = 536;
const GY = 150;
const LX = 302;
const DECK = { x: 885, y: 290, w: 150 };

/** The grid as it shrinks to make room for the action cards. */
const SHRUNK = { s: 0.72, dx: -137.4, dy: 97 };

export function Cards() {
  const frame = useCurrentFrame();
  const m = useMarks('cards');
  const deckAt = m.at('deck');
  const digitsAt = m.at('digits', 0.3);
  const rowAt = [
    m.word('suits', 'gold stars'),
    m.word('suits', 'blue diamonds'),
    m.word('suits', 'green clubs'),
    m.word('suits', 'red hearts'),
    m.word('suits', 'black spades'),
  ];
  const sameAt = m.word('copies', 'color and suit');
  const copiesAt = m.word('copies', 'two copies');
  const actionsAt = m.at('actions');
  const buildAt = m.at('build');
  const tensAt = m.word('build', 'the left one');
  const unitsAt = m.word('build', 'the right one');
  const s73 = m.at('seventythree');
  const v73 = m.word('seventythree', 'make 73');
  const s05 = m.at('zerofive');
  const v05 = m.word('zerofive', 'make 05');
  const just5 = m.word('zerofive', 'just five');

  const shrink = ramp(frame, actionsAt, actionsAt + 22);
  const gridOut = 1 - ramp(frame, buildAt - 8, buildAt + 6);
  const deckOpacity = fade(frame, deckAt, digitsAt + 30, 12);
  const count = Math.round(lerp(0, 120, ramp(frame, deckAt + 6, deckAt + 30, easeOut)));

  return (
    <>
      {/* The deck, and how many cards it holds. */}
      {deckOpacity > 0 &&
        [5, 4, 3, 2, 1, 0].map((k) => (
          <PlayingCard
            key={k}
            id={0}
            faceDown
            w={DECK.w}
            x={DECK.x - k * 3}
            y={DECK.y - k * 3}
            opacity={deckOpacity}
          />
        ))}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: DECK.y + 240,
          textAlign: 'center',
          opacity: deckOpacity,
        }}
      >
        <Num size={84} color={C.gold2}>
          {count}
        </Num>
        <Text size={40} color={C.ink2} style={{ marginLeft: 16 }}>
          cards
        </Text>
      </div>

      {/* Five suits of ten digits: the number cards. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 930,
          opacity: gridOut,
          transformOrigin: '0 0',
          transform: `translate(${SHRUNK.dx * shrink}px, ${SHRUNK.dy * shrink}px) scale(${lerp(1, SHRUNK.s, shrink)})`,
        }}
      >
        {CODE.map((code, row) => {
          const labelT = pop(frame, rowAt[row] ?? 0);
          const lit = row === 0 ? 1 : 1;
          return (
            <div key={code}>
              <div
                style={{
                  position: 'absolute',
                  left: LX,
                  top: GY + row * ROW + 40,
                  width: 210,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  opacity: Math.min(1, labelT) * lit,
                  transform: `translateX(${(1 - Math.min(1, labelT)) * -30}px)`,
                }}
              >
                <SuitChip suit={row as Suit} size={50} />
                <Text size={34} color={SUIT_ON_FELT[row]}>
                  {SUIT_NAMES[row]}
                </Text>
              </div>
              {[...Array(10).keys()].map((digit) => {
                const x = GX + digit * COL;
                const y = GY + row * ROW;
                const copyT = ramp(
                  frame,
                  copiesAt + (row * 10 + digit) * 0.35,
                  copiesAt + (row * 10 + digit) * 0.35 + 10,
                  easeOut,
                );
                const copy = copyT > 0 && (
                  <PlayingCard
                    key={`c${digit}`}
                    id={card(`${digit}${code}2`)}
                    w={CW}
                    x={x + 8 * copyT}
                    y={y + 8 * copyT}
                    opacity={copyT}
                  />
                );
                if (row === 0) {
                  // Dealt from the deck, face down, turning over as it lands.
                  const start = digitsAt + digit * 2.2;
                  const t = ramp(frame, start, start + 14, easeOut);
                  if (t <= 0) return null;
                  const [px, py] = toss(DECK.x + (DECK.w - CW) / 2, DECK.y + 20, x, y, t, 70);
                  return (
                    <div key={digit}>
                      {copy}
                      <FlipCard
                        id={card(`${digit}${code}`)}
                        w={CW}
                        x={px}
                        y={py}
                        flip={ramp(frame, start + 6, start + 16)}
                      />
                    </div>
                  );
                }
                const start = (rowAt[row] ?? 0) + digit * 1.4;
                const t = ramp(frame, start, start + 10, easeOut);
                if (t <= 0) return null;
                return (
                  <div key={digit}>
                    {copy}
                    <PlayingCard
                      id={card(`${digit}${code}`)}
                      w={CW}
                      x={x - (1 - t) * 90}
                      y={y}
                      opacity={t}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* One digit per card; then the five colors, before their rows are dealt. */}
      <div
        style={{
          position: 'absolute',
          left: GX,
          width: 9 * COL + CW,
          top: GY + 150,
          textAlign: 'center',
          opacity: fade(frame, digitsAt + 30, m.at('suits'), 10),
        }}
      >
        <Text size={40} color={C.ink2}>
          one digit on each card: 0 to 9
        </Text>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: 470,
          display: 'flex',
          justifyContent: 'center',
          gap: 44,
          opacity: fade(frame, m.at('suits'), (rowAt[1] ?? 0) - 6, 8),
        }}
      >
        {([0, 1, 2, 3, 4] as Suit[]).map((suit, i) => (
          <div
            key={suit}
            style={{
              opacity: Math.min(1, pop(frame, m.at('suits') + i * 3)),
              transform: `scale(${0.7 + 0.3 * Math.min(1, pop(frame, m.at('suits') + i * 3))})`,
            }}
          >
            <SuitChip suit={suit} size={120} />
          </div>
        ))}
      </div>
      {/* Color and suit are the same thing; two copies of each card. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 66,
          textAlign: 'center',
          opacity: fade(frame, sameAt, copiesAt - 4, 8),
        }}
      >
        <Pill size={32} color={C.gold2} border="rgba(229,185,90,0.5)">
          color = suit
        </Pill>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 66,
          textAlign: 'center',
          opacity: fade(frame, copiesAt + 4, actionsAt, 8),
        }}
      >
        <Pill size={32} color={C.gold2} border="rgba(229,185,90,0.5)">
          2 copies of every card
        </Pill>
      </div>

      {/* The action cards. */}
      {[0, 1, 2, 3, 4].map((i) => {
        const t = pop(frame, actionsAt + 14 + i * 4);
        const angle = (i - 2) * 9;
        return (
          <PlayingCard
            key={i}
            id={card(`A${i}`)}
            w={170}
            x={1380 + (i - 2) * 58 * Math.min(1, t)}
            y={260 + Math.abs(i - 2) * 12}
            rotate={angle * Math.min(1, t)}
            opacity={Math.min(1, t) * gridOut}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 1180,
          width: 570,
          top: 580,
          textAlign: 'center',
          opacity: fade(frame, actionsAt + 30, buildAt - 8),
        }}
      >
        <Num size={72} color={C.gold2}>
          20
        </Num>
        <Text size={40} color={C.ink} style={{ marginLeft: 14 }}>
          action cards
        </Text>
        <div style={{ marginTop: 12 }}>
          <Text size={34} color={C.ink2} weight={500}>
            ±10: plus or minus 10
          </Text>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 80,
          width: 948,
          top: 742,
          textAlign: 'center',
          opacity: fade(frame, actionsAt + 24, buildAt - 8),
        }}
      >
        <Num size={72} color={C.gold2}>
          100
        </Num>
        <Text size={40} color={C.ink} style={{ marginLeft: 14 }}>
          number cards
        </Text>
      </div>

      <Build
        frame={frame}
        at={buildAt}
        tensAt={tensAt}
        unitsAt={unitsAt}
        s73={s73}
        v73={v73}
        s05={s05}
        v05={v05}
        just5={just5}
      />

      <Sfx name="whoosh" at={deckAt} volume={0.2} />
      {[0, 3, 6, 9].map((i) => (
        <Sfx key={i} name="card" at={digitsAt + i * 2.2 + 12} volume={0.18} />
      ))}
      {rowAt.slice(1).map((at, i) => (
        <Sfx key={`r${i}`} name="slide" at={at} volume={0.16} />
      ))}
      <Sfx name="pop" at={sameAt} volume={0.2} />
      <Sfx name="slide" at={copiesAt} volume={0.2} />
      <Sfx name="whoosh" at={actionsAt} volume={0.18} />
      <Sfx name="card" at={s73 + 2} volume={0.25} />
      <Sfx name="card" at={s73 + 9} volume={0.25} />
      <Sfx name="card" at={s05 + 8} volume={0.25} />
      <Sfx name="card" at={s05 + 15} volume={0.25} />
    </>
  );
}

const SLOT_W = 220;
const SLOT_H = Math.round(SLOT_W * 1.4);
const TENS_X = 640;
const UNITS_X = 900;
const SLOT_Y = 280;

function Build({
  frame,
  at,
  tensAt,
  unitsAt,
  s73,
  v73,
  s05,
  v05,
  just5,
}: {
  frame: number;
  at: number;
  tensAt: number;
  unitsAt: number;
  s73: number;
  v73: number;
  s05: number;
  v05: number;
  just5: number;
}) {
  const slots = life(frame, at + 6);
  const drop = (start: number) => ramp(frame, start, start + 12, easeOut);
  const leave = (start: number) => ramp(frame, start, start + 10);
  const out73 = leave(s05);
  const card7 = drop(s73);
  const card3 = drop(s73 + 7);
  const card0 = drop(s05 + 6);
  const card5 = drop(s05 + 13);
  const slot = (x: number, label: string, labelAt: number) => {
    const t = pop(frame, labelAt);
    return (
      <>
        <div
          style={{
            position: 'absolute',
            left: x,
            top: SLOT_Y,
            width: SLOT_W,
            height: SLOT_H,
            borderRadius: 18,
            border: '4px dashed rgba(229,185,90,0.55)',
            background: 'rgba(229,185,90,0.06)',
            opacity: slots,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: x,
            width: SLOT_W,
            top: SLOT_Y - 84,
            textAlign: 'center',
            opacity: Math.min(1, t),
            transform: `translateY(${(1 - Math.min(1, t)) * 14}px)`,
          }}
        >
          <Pill size={34} color={C.goldInk} bg={C.gold} border={C.gold2}>
            {label}
          </Pill>
        </div>
      </>
    );
  };
  return (
    <>
      {slot(TENS_X, 'tens', tensAt)}
      {slot(UNITS_X, 'units', unitsAt)}
      {card7 > 0 && (
        <PlayingCard
          id={card('7D')}
          w={SLOT_W}
          x={TENS_X}
          y={SLOT_Y - (1 - card7) * 120 + out73 * 90}
          opacity={Math.min(1, card7) * (1 - out73)}
        />
      )}
      {card3 > 0 && (
        <PlayingCard
          id={card('3C')}
          w={SLOT_W}
          x={UNITS_X}
          y={SLOT_Y - (1 - card3) * 120 + out73 * 90}
          opacity={Math.min(1, card3) * (1 - out73)}
        />
      )}
      {card0 > 0 && (
        <PlayingCard
          id={card('0S')}
          w={SLOT_W}
          x={TENS_X}
          y={SLOT_Y - (1 - card0) * 120}
          opacity={card0}
        />
      )}
      {card5 > 0 && (
        <PlayingCard
          id={card('5H')}
          w={SLOT_W}
          x={UNITS_X}
          y={SLOT_Y - (1 - card5) * 120}
          opacity={card5}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: 1190,
          top: SLOT_Y + 90,
          opacity: fade(frame, v73, s05, 8),
        }}
      >
        <Num size={150}>= 73</Num>
      </div>
      <div
        style={{ position: 'absolute', left: 1190, top: SLOT_Y + 90, opacity: fade(frame, v05) }}
      >
        <Num size={150}>= 05</Num>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1196,
          top: SLOT_Y + 270,
          opacity: fade(frame, just5),
          fontFamily: UI,
          fontSize: 40,
          fontWeight: 600,
          color: C.ink2,
        }}
      >
        just 5, with two digits
      </div>
    </>
  );
}
