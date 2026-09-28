import { useCurrentFrame } from 'remotion';
import { fade, ramp } from '../components/anim';
import { Pill, PlayingCard, Sfx, Text, Verdict } from '../components/base';
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
import { TABLE } from './Setup';

const HAND = ['9S', '2H', '6H', '0S', '3D', '7C'] as const;
const HW = 80;
const HSTEP = 92;
const HY = 806;
const handX = (i: number) => 960 - (HW + (HAND.length - 1) * HSTEP) / 2 + i * HSTEP;
/** The second example, on the right: an action card from the table with two cards from the hand. */
const COMBO_Y = 610;
const COMBO: Record<string, Place> = {
  A0: { x: 1290, y: COMBO_Y, w: 90 },
  '6H': { x: 1480, y: COMBO_Y, w: 90 },
  '0S': { x: 1582, y: COMBO_Y, w: 90 },
};

export function First() {
  const frame = useCurrentFrame();
  const m = useMarks('first');
  const titleAt = m.at('remember');
  const startAt = m.word('setup', 'the starting number');
  const starAt = m.word('setup', '5 of stars');
  const heartAt = m.word('setup', '2 of hearts');
  const bidAt = m.at('bid', 0.1);
  const valueAt = bidAt + 22;
  const stepsAt = m.word('bid', 'five steps up');
  const colorAt = m.word('bid', 'with a new color');
  const actionAt = m.at('action');
  const flyAction = m.word('action', 'an action card');
  const flyHand = m.word('action', 'two cards from your hand');

  const litTable = (code: string) =>
    code === '5*'
      ? ramp(frame, starAt, starAt + 8)
      : code === 'A0'
        ? ramp(frame, actionAt, actionAt + 8)
        : 0;
  const litHand = (code: string) =>
    code === '2H'
      ? ramp(frame, heartAt, heartAt + 8)
      : code === '6H' || code === '0S'
        ? ramp(frame, flyHand - 10, flyHand)
        : 0;
  const leftAt: Record<string, number> = {
    '5*': bidAt,
    A0: flyAction,
    '2H': bidAt + 5,
    '6H': flyHand,
    '0S': flyHand + 4,
  };

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
          opacity: fade(frame, titleAt),
        }}
      >
        <Pill size={34} color={C.gold2} border="rgba(229,185,90,0.5)">
          Player 1&apos;s first bid: exactly 1 table card
        </Pill>
      </div>

      <BoardPanel opacity={fade(frame, startAt - 10)} />
      <div style={{ opacity: fade(frame, startAt) }}>
        <PlayingCard
          id={card('4C')}
          compact
          w={boardCard(0, 0).w}
          x={boardCard(0, 0).x}
          y={boardCard(0, 0).y}
        />
        <PlayingCard
          id={card('7D')}
          compact
          w={boardCard(0, 1).w}
          x={boardCard(0, 1).x}
          y={boardCard(0, 1).y}
        />
      </div>
      <BoardValue
        row={0}
        value="47"
        frame={frame}
        at={startAt}
        latest={1 - ramp(frame, valueAt, valueAt + 6)}
      />
      {frame >= bidAt + 18 && (
        <PlayingCard
          id={card('5*')}
          compact
          w={boardCard(1, 0).w}
          x={boardCard(1, 0).x}
          y={boardCard(1, 0).y}
        />
      )}
      {frame >= bidAt + 23 && (
        <PlayingCard
          id={card('2H')}
          compact
          w={boardCard(1, 1).w}
          x={boardCard(1, 1).x}
          y={boardCard(1, 1).y}
        />
      )}
      <BoardValue
        row={1}
        value="52"
        frame={frame}
        at={valueAt}
        latest={ramp(frame, valueAt, valueAt + 6)}
      />

      {/* The table, with the 5 of stars to use. */}
      <div style={{ opacity: fade(frame, m.at('remember', 0.6)) }}>
        {TABLE.flatMap((row, r) =>
          row.map((code, c) => {
            const place = tablePos(r, c);
            const lit = litTable(code);
            const left = leftAt[code];
            if (left !== undefined && frame >= left) return null;
            return (
              <PlayingCard
                key={code}
                id={card(code)}
                w={GRID.w}
                x={place.x}
                y={place.y - lit * 10}
                glow={lit > 0 ? C.gold : undefined}
                dim={frame >= starAt && lit === 0 && frame < m.end('bid')}
              />
            );
          }),
        )}
      </div>
      <Flight
        id={card('5*')}
        from={tablePos(0, 0)}
        to={boardCard(1, 0)}
        start={bidAt}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
        glow={C.gold}
        compact
      />
      <Flight
        id={card('A0')}
        from={tablePos(0, 2)}
        to={COMBO.A0 as Place}
        start={flyAction}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
        glow={C.gold}
      />
      {frame >= flyAction + 18 && (
        <PlayingCard id={card('A0')} w={90} x={(COMBO.A0 as Place).x} y={COMBO_Y} glow={C.gold} />
      )}

      {/* Your hand, with the 2 of hearts. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1920,
          top: HY - 46,
          textAlign: 'center',
          opacity: fade(frame, m.at('remember', 1)),
        }}
      >
        <Text size={28} color={C.ink2}>
          your hand
        </Text>
      </div>
      {HAND.map((code, i) => {
        const left = leftAt[code];
        if (left !== undefined && frame >= left) return null;
        const lit = litHand(code);
        return (
          <PlayingCard
            key={code}
            id={card(code)}
            w={HW}
            x={handX(i)}
            y={HY - lit * 16}
            opacity={fade(frame, m.at('remember', 1) + i * 2)}
            glow={lit > 0 ? C.gold : undefined}
          />
        );
      })}
      <Flight
        id={card('2H')}
        from={{ x: handX(1), y: HY - 16, w: HW }}
        to={boardCard(1, 1)}
        start={bidAt + 5}
        frames={18}
        flip={[1, 1]}
        lift={80}
        frame={frame}
        glow={C.gold}
        compact
      />
      <Flight
        id={card('6H')}
        from={{ x: handX(2), y: HY - 16, w: HW }}
        to={COMBO['6H'] as Place}
        start={flyHand}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
      />
      <Flight
        id={card('0S')}
        from={{ x: handX(3), y: HY - 16, w: HW }}
        to={COMBO['0S'] as Place}
        start={flyHand + 4}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
      />
      {frame >= flyHand + 18 && (
        <PlayingCard id={card('6H')} w={90} x={(COMBO['6H'] as Place).x} y={COMBO_Y} />
      )}
      {frame >= flyHand + 22 && (
        <PlayingCard id={card('0S')} w={90} x={(COMBO['0S'] as Place).x} y={COMBO_Y} />
      )}

      {/* Why 52 works. */}
      <div
        style={{
          position: 'absolute',
          left: 1250,
          top: 250,
          opacity: fade(frame, stepsAt),
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Verdict ok size={52} />
        <Text size={38} color={C.mint}>
          5 steps up from 47
        </Text>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1250,
          top: 330,
          opacity: fade(frame, colorAt),
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Verdict ok size={52} />
        <Text size={38} color={C.mint}>
          new colors: gold, red
        </Text>
      </div>

      {/* Or: an action card from the table, two cards from the hand. */}
      <div style={{ opacity: fade(frame, actionAt) }}>
        <div style={{ position: 'absolute', left: 1240, top: 520 }}>
          <Text size={32} color={C.gold2}>
            or:
          </Text>
        </div>
        <div style={{ position: 'absolute', left: 1406, top: COMBO_Y + 36 }}>
          <Text size={56} color={C.ink2}>
            +
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1255,
            width: 160,
            top: COMBO_Y + 140,
            textAlign: 'center',
            opacity: fade(frame, flyAction + 10),
          }}
        >
          <Text size={28} color={C.ink2} weight={500}>
            the table
          </Text>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1470,
            width: 212,
            top: COMBO_Y + 140,
            textAlign: 'center',
            opacity: fade(frame, flyHand + 10),
          }}
        >
          <Text size={28} color={C.ink2} weight={500}>
            your hand
          </Text>
        </div>
      </div>

      <Sfx name="pop" at={starAt} volume={0.16} />
      <Sfx name="pop" at={heartAt} volume={0.16} />
      <Sfx name="card" at={bidAt + 16} volume={0.24} />
      <Sfx name="card" at={bidAt + 21} volume={0.24} />
      <Sfx name="chime" at={stepsAt} volume={0.16} />
      <Sfx name="chime" at={colorAt} volume={0.16} />
      <Sfx name="slide" at={flyAction + 2} volume={0.18} />
      <Sfx name="slide" at={flyHand + 2} volume={0.18} />
      <Sfx name="pop" at={titleAt} volume={0.14} />
    </>
  );
}
