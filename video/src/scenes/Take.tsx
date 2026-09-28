import { useCurrentFrame } from 'remotion';
import { fade, pop, pulse, ramp } from '../components/anim';
import { PlayingCard, Sfx, Text } from '../components/base';
import {
  BoardPanel,
  BoardValue,
  boardCard,
  Flight,
  GRID,
  tablePos,
  type Place,
} from '../components/table';
import { card } from '../cards';
import { C } from '../theme';
import { useMarks } from '../timeline';

const TABLE: readonly (readonly (string | null)[])[] = [
  ['5*', null, 'A0', '2C', null],
  [null, '3H', '4*', '8C', '1D'],
  ['1S', null, null, '9C', null],
  ['7H', '2*', '6D', null, '3C'],
  [null, '4H', null, 'A2', '6S'],
];
const HAND = ['2D', '5C', '7H2', '3D', '8H', '0C'] as const;
const HW = 80;
const HSTEP = 92;
const HY = 806;

const handX = (i: number, n: number) => 960 - (HW + (n - 1) * HSTEP) / 2 + i * HSTEP;

export function Take() {
  const frame = useCurrentFrame();
  const m = useMarks('take');
  const takeAt = m.at('take');
  const numberAt = m.word('take', 'a missing number');
  const colorAt = m.word('take', 'a new color');
  const actionAt = m.word('take', 'or an action card');
  const grabAt = m.end('take', -0.5);
  const boardAt = m.at('board');
  const emptyAt = m.word('board', 'When the table is empty');
  const nothingAt = m.word('board', 'you take nothing');

  const n = HAND.length + ramp(frame, grabAt, grabAt + 12);
  const landing: Place = { x: handX(HAND.length, HAND.length + 1), y: HY, w: HW };
  const callouts: readonly { code: string; at: number; title: string; note: string }[] = [
    { code: '9C', at: numberAt, title: 'a missing number', note: 'no 9 in your hand' },
    { code: '4*', at: colorAt, title: 'a new color', note: 'no gold star yet' },
    { code: 'A0', at: actionAt, title: 'an action card', note: 'up or down 10, later' },
  ];
  const lit = (code: string) => {
    const c = callouts.find((x) => x.code === code);
    return c ? ramp(frame, c.at, c.at + 8) * (1 - ramp(frame, emptyAt - 10, emptyAt)) : 0;
  };
  const boardGlow = pulse(frame, boardAt + 14, 20);

  return (
    <>
      <BoardPanel opacity={1}>
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 28,
            border: `4px solid ${C.gold}`,
            opacity: boardGlow,
          }}
        />
      </BoardPanel>
      {[
        ['4C', 0, 0],
        ['7D', 0, 1],
        ['5*2', 1, 0],
        ['2H', 1, 1],
        ['5H', 2, 0],
        ['8S', 2, 1],
      ].map(([code, row, col]) => {
        const place = boardCard(row as number, col as number);
        return (
          <PlayingCard
            key={code as string}
            id={card(code as string)}
            compact
            w={place.w}
            x={place.x}
            y={place.y}
          />
        );
      })}
      <BoardValue row={0} value="47" frame={frame} at={-30} latest={0} />
      <BoardValue row={1} value="52" frame={frame} at={-30} latest={0} />
      <BoardValue row={2} value="58" frame={frame} at={-30} latest={1} />

      {/* The table: its empty places, and the cards left on it. */}
      {TABLE.flatMap((row, r) =>
        row.map((code, c) => {
          const place = tablePos(r, c);
          const j = r * 5 + c;
          const gone = ramp(frame, emptyAt + j * 0.8, emptyAt + j * 0.8 + 8);
          return (
            <div key={`${r}-${c}`}>
              <div
                style={{
                  position: 'absolute',
                  left: place.x,
                  top: place.y,
                  width: GRID.w,
                  height: GRID.w * 1.4,
                  borderRadius: 6,
                  border: '2px dashed rgba(255,255,255,0.14)',
                }}
              />
              {code && !(code === 'A0' && frame >= grabAt) && gone < 1 && (
                <PlayingCard
                  id={card(code)}
                  w={GRID.w}
                  x={place.x}
                  y={place.y - lit(code) * 10 - gone * 30}
                  opacity={1 - gone}
                  glow={lit(code) > 0 ? C.gold : undefined}
                />
              )}
            </div>
          );
        }),
      )}
      <Flight
        id={card('A0')}
        from={tablePos(0, 2)}
        to={landing}
        start={grabAt}
        frames={18}
        flip={[1, 1]}
        lift={80}
        frame={frame}
        glow={C.gold}
      />
      <div
        style={{
          position: 'absolute',
          left: 767 - 80,
          width: 386 + 160,
          top: 440,
          textAlign: 'center',
          opacity: fade(frame, nothingAt),
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '16px 30px',
            borderRadius: 20,
            background: 'rgba(3,22,16,0.8)',
            border: '2px solid rgba(229,185,90,0.4)',
          }}
        >
          <Text size={38} color={C.gold2}>
            empty table:
            <br />
            take nothing
          </Text>
        </div>
      </div>

      {/* Your hand. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: HY - 46,
          textAlign: 'center',
          opacity: fade(frame, takeAt),
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
          w={HW}
          x={handX(i, n)}
          y={HY}
          opacity={fade(frame, takeAt + i * 2)}
        />
      ))}
      {frame >= grabAt + 18 && (
        <PlayingCard id={card('A0')} w={HW} x={landing.x} y={HY} glow={C.gold} />
      )}

      {/* Why a card is worth taking. */}
      {callouts.map((c, i) => {
        const t = Math.min(1, pop(frame, c.at));
        return (
          <div
            key={c.code}
            style={{
              position: 'absolute',
              left: 1250,
              top: 250 + i * 170,
              opacity: t * (1 - 0.6 * ramp(frame, emptyAt - 10, emptyAt)),
              transform: `translateX(${(1 - t) * 30}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 22,
            }}
          >
            <PlayingCard id={card(c.code)} w={74} x={0} y={0} style={{ position: 'relative' }} />
            <div>
              <Text size={36} color={C.gold2}>
                {c.title}
              </Text>
              <div style={{ marginTop: 6 }}>
                <Text size={28} color={C.ink2} weight={500}>
                  {c.note}
                </Text>
              </div>
            </div>
          </div>
        );
      })}

      {callouts.map((c) => (
        <Sfx key={c.code} name="pop" at={c.at} volume={0.18} />
      ))}
      <Sfx name="card" at={grabAt + 16} volume={0.26} />
      <Sfx name="chime" at={boardAt + 12} volume={0.14} />
      <Sfx name="whoosh" at={emptyAt} volume={0.18} />
      <Sfx name="pop" at={nothingAt} volume={0.18} />
    </>
  );
}
