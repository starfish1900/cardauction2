import { useCurrentFrame } from 'remotion';
import { fade, pop, ramp } from '../components/anim';
import { Pill, PlayingCard, Sfx, Text } from '../components/base';
import {
  BoardPanel,
  BoardValue,
  boardCard,
  Flight,
  GRID,
  Hand,
  HAND,
  HandLabel,
  handPlaces,
  tablePos,
  type HandItem,
  type Place,
} from '../components/table';
import { card } from '../cards';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';
import { TABLE } from './Setup';

function Step({
  n,
  label,
  x,
  y,
  opacity,
  lit,
}: {
  n: string;
  label: string;
  x: number;
  y: number;
  opacity: number;
  lit: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 26px 12px 14px',
        borderRadius: 999,
        background: lit > 0.5 ? C.gold : C.panelStrong,
        border: `2px solid ${lit > 0.5 ? C.gold2 : C.panelEdge}`,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background: lit > 0.5 ? C.goldInk : C.gold,
          color: lit > 0.5 ? C.gold2 : C.goldInk,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: UI,
          fontWeight: 800,
          fontSize: 26,
        }}
      >
        {n}
      </div>
      <span
        style={{
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 30,
          color: lit > 0.5 ? C.goldInk : C.ink,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function Flow() {
  const frame = useCurrentFrame();
  const m = useMarks('flow');
  const p2Turn = m.at('swap', 0.1);
  const swapLift = m.word('swap', 'swap one card');
  const swapAt = m.word('swap', 'for one on the table');
  const keepAt = m.word('swap', 'or keep their hand');
  const p1Turn = m.at('first');
  const tableCardAt = m.word('first', 'exactly one card');
  const handCardAt = m.word('first', 'with cards from their hand');
  const show52 = handCardAt + 24;
  const p1TakeAt = Math.max(show52 + 12, m.end('first', -0.9));
  const loopAt = m.at('loop');
  const p2Turn2 = loopAt + 6;
  const p2BidAt = m.word('loop', 'you make a bid');
  const show58 = p2BidAt + 24;
  const p2TakeAt = Math.max(show58 + 6, m.word('loop', 'then take one card'));

  // Player 2: gives a card to the table and takes 7♠; later bids 5♥ 8♠ and takes 6★.
  const p2: HandItem[] = [];
  for (let i = 0; i < 13; i++) {
    if (i === 6) {
      p2.push({ key: 'q6', id: card('3D'), liftAt: swapLift, leaveAt: swapAt });
      p2.push({ key: 'swap', id: card('7S'), faceUp: true, arriveAt: swapAt, arriveFrames: 18 });
    } else if (i === 2)
      p2.push({ key: 'q2', id: card('5H'), liftAt: p2BidAt - 8, leaveAt: p2BidAt });
    else if (i === 9)
      p2.push({ key: 'q9', id: card('8S'), liftAt: p2BidAt - 8, leaveAt: p2BidAt + 4 });
    else p2.push({ key: `q${i}`, id: 0 });
  }
  p2.push({ key: 'take', id: card('6*'), faceUp: true, arriveAt: p2TakeAt, arriveFrames: 18 });
  // Player 1: bids 2♥ with the table's 5★, then takes 3♥.
  const p1: HandItem[] = [];
  for (let i = 0; i < 13; i++) {
    if (i === 3)
      p1.push({ key: 'r3', id: card('2H'), liftAt: handCardAt - 8, leaveAt: handCardAt + 4 });
    else p1.push({ key: `r${i}`, id: 0 });
  }
  p1.push({ key: 'take', id: card('3H'), faceUp: true, arriveAt: p1TakeAt, arriveFrames: 18 });

  const p2At = (f: number) => handPlaces(p2, f, HAND.top);
  const p1At = (f: number) => handPlaces(p1, f, HAND.bottom);
  const leaving: Record<string, number> = {
    '7S': swapAt,
    '5*': tableCardAt + 6,
    '3H': p1TakeAt,
    '6*': p2TakeAt,
  };
  const glowFrom: Record<string, number> = {
    '7S': swapLift,
    '5*': tableCardAt - 6,
    '3H': p1TakeAt - 8,
    '6*': p2TakeAt - 8,
  };

  const turn2 = Math.max(fade(frame, p2Turn, p1Turn, 8), fade(frame, p2Turn2));
  const turn1 = fade(frame, p1Turn, p2Turn2 - 6, 8);
  const latest0 = 1 - ramp(frame, show52, show52 + 6);
  const latest1 = ramp(frame, show52, show52 + 6) * (1 - ramp(frame, show58, show58 + 6));
  const latest2 = ramp(frame, show58, show58 + 6);

  return (
    <>
      <BoardPanel opacity={1} />
      {[
        ['4C', 0, 0, -1],
        ['7D', 0, 1, -1],
        ['5*', 1, 0, tableCardAt + 22],
        ['2H', 1, 1, handCardAt + 20],
        ['5H', 2, 0, p2BidAt + 16],
        ['8S', 2, 1, p2BidAt + 20],
      ].map(([code, row, col, at]) =>
        frame >= (at as number) ? (
          <PlayingCard
            key={code as string}
            id={card(code as string)}
            compact
            w={boardCard(row as number, col as number).w}
            x={boardCard(row as number, col as number).x}
            y={boardCard(row as number, col as number).y}
          />
        ) : null,
      )}
      <BoardValue row={0} value="47" frame={frame} at={-30} latest={latest0} />
      <BoardValue row={1} value="52" frame={frame} at={show52} latest={latest1} />
      <BoardValue row={2} value="58" frame={frame} at={show58} latest={latest2} />

      {/* The table. */}
      {TABLE.flatMap((row, r) =>
        row.map((code, c) => {
          const place = tablePos(r, c);
          const leaves = leaving[code];
          if (leaves !== undefined && frame >= leaves) return null;
          const lit =
            glowFrom[code] !== undefined
              ? ramp(frame, glowFrom[code] ?? 0, (glowFrom[code] ?? 0) + 6)
              : 0;
          return (
            <PlayingCard
              key={code}
              id={card(code)}
              w={GRID.w}
              x={place.x}
              y={place.y - lit * 8}
              glow={lit > 0 ? C.gold : undefined}
            />
          );
        }),
      )}
      {frame >= swapAt + 18 && (
        <PlayingCard id={card('3D')} w={GRID.w} x={tablePos(0, 4).x} y={tablePos(0, 4).y} />
      )}

      <Hand
        items={p2}
        frame={frame}
        y={HAND.top}
        glow={{
          q6: frame >= swapLift ? C.gold : '',
          q2: frame >= p2BidAt - 8 ? C.gold : '',
          q9: frame >= p2BidAt - 8 ? C.gold : '',
        }}
      />
      <Hand
        items={p1}
        frame={frame}
        y={HAND.bottom}
        glow={{ r3: frame >= handCardAt - 8 ? C.gold : '' }}
      />

      {/* The swap: a card from the hand for a card from the table. */}
      <Flight
        id={card('3D')}
        from={p2At(swapAt).q6 as Place}
        to={tablePos(0, 4)}
        start={swapAt}
        frames={18}
        flip={[0, 1]}
        lift={-40}
        frame={frame}
      />
      <Flight
        id={card('7S')}
        from={tablePos(0, 4)}
        to={p2At(swapAt + 18).swap as Place}
        start={swapAt}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
        glow={C.gold}
      />
      {/* Player 1's first bid: 5★ from the table, 2♥ from the hand; then a card to take. */}
      <Flight
        id={card('5*')}
        from={tablePos(0, 0)}
        to={boardCard(1, 0)}
        start={tableCardAt + 6}
        frames={16}
        flip={[1, 1]}
        lift={50}
        frame={frame}
        glow={C.gold}
        compact
      />
      <Flight
        id={card('2H')}
        from={p1At(handCardAt + 4).r3 as Place}
        to={boardCard(1, 1)}
        start={handCardAt + 4}
        frames={16}
        flip={[0, 1]}
        lift={60}
        frame={frame}
        compact
      />
      <Flight
        id={card('3H')}
        from={tablePos(1, 1)}
        to={p1At(p1TakeAt + 18).take as Place}
        start={p1TakeAt}
        frames={18}
        flip={[1, 1]}
        lift={40}
        frame={frame}
      />
      {/* Player 2's bid, then a card to take. */}
      <Flight
        id={card('5H')}
        from={p2At(p2BidAt).q2 as Place}
        to={boardCard(2, 0)}
        start={p2BidAt}
        frames={16}
        flip={[0, 1]}
        lift={40}
        frame={frame}
        compact
      />
      <Flight
        id={card('8S')}
        from={p2At(p2BidAt + 4).q9 as Place}
        to={boardCard(2, 1)}
        start={p2BidAt + 4}
        frames={16}
        flip={[0, 1]}
        lift={40}
        frame={frame}
        compact
      />
      <Flight
        id={card('6*')}
        from={tablePos(1, 2)}
        to={p2At(p2TakeAt + 18).take as Place}
        start={p2TakeAt}
        frames={18}
        flip={[1, 1]}
        lift={50}
        frame={frame}
      />

      <HandLabel seat={2} y={HAND.top} opacity={1} turn={turn2} />
      <HandLabel seat={1} y={HAND.bottom} opacity={1} turn={turn1} />

      {/* Player 2's choice. */}
      <div
        style={{
          position: 'absolute',
          left: 1300,
          top: 96,
          opacity: fade(frame, swapLift, p1Turn),
          transform: `scale(${0.9 + 0.1 * Math.min(1, pop(frame, swapLift))})`,
          transformOrigin: 'left center',
        }}
      >
        <Pill size={28} color={C.goldInk} bg={C.gold} border={C.gold2}>
          swap one card
        </Pill>
      </div>
      <div
        style={{ position: 'absolute', left: 1300, top: 160, opacity: fade(frame, keepAt, p1Turn) }}
      >
        <Pill size={28} color={C.ink}>
          or keep the hand
        </Pill>
      </div>

      {/* Player 1's first bid. */}
      <div
        style={{
          position: 'absolute',
          left: 1190,
          top: 250,
          opacity: fade(frame, tableCardAt - 4, loopAt),
        }}
      >
        <Pill size={28} color={C.gold2} border="rgba(229,185,90,0.5)">
          exactly 1 table card
        </Pill>
        <div style={{ marginTop: 10, marginLeft: 8, opacity: fade(frame, handCardAt) }}>
          <Text size={26} color={C.ink2} weight={500}>
            + cards from the hand
          </Text>
        </div>
      </div>

      {/* Every turn after that. */}
      <div style={{ position: 'absolute', left: 1290, top: 360, opacity: fade(frame, loopAt) }}>
        <Text
          size={28}
          color={C.ink2}
          weight={600}
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Each turn
        </Text>
      </div>
      <Step
        n="1"
        label="make a bid"
        x={1290}
        y={410}
        opacity={fade(frame, loopAt + 4)}
        lit={ramp(frame, p2BidAt - 8, p2BidAt) * (1 - ramp(frame, p2TakeAt - 8, p2TakeAt))}
      />
      <Step
        n="2"
        label="take a table card"
        x={1290}
        y={490}
        opacity={fade(frame, loopAt + 8)}
        lit={ramp(frame, p2TakeAt - 8, p2TakeAt)}
      />

      <Sfx name="pop" at={swapLift} volume={0.18} />
      <Sfx name="slide" at={swapAt + 2} volume={0.22} />
      <Sfx name="card" at={swapAt + 16} volume={0.22} />
      <Sfx name="pop" at={keepAt} volume={0.16} />
      <Sfx name="card" at={tableCardAt + 20} volume={0.24} />
      <Sfx name="card" at={handCardAt + 18} volume={0.24} />
      <Sfx name="slide" at={p1TakeAt + 2} volume={0.18} />
      <Sfx name="card" at={p2BidAt + 14} volume={0.22} />
      <Sfx name="card" at={p2BidAt + 19} volume={0.22} />
      <Sfx name="slide" at={p2TakeAt + 2} volume={0.18} />
    </>
  );
}
