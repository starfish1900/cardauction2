import { useCurrentFrame } from 'remotion';
import { fade, lerp, pop, ramp } from '../components/anim';
import { Num, Pill, PlayingCard, Sfx, Text } from '../components/base';
import {
  BoardPanel,
  BoardValue,
  boardCard,
  Eye,
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
import { C } from '../theme';
import { useMarks } from '../timeline';
import { tr } from '../lang';

/** The 25 cards of the table, row by row. */
export const TABLE = [
  ['5*', '9H', 'A0', '2C', '7S'],
  ['0D', '3H', '6*', '8C', '1D'],
  ['1S', '4D', 'A1', '5C', '9S'],
  ['7H', '2*', '6D', '0S', '3C'],
  ['8*', '4H', '5D', 'A2', '6S'],
] as const;

const DECK_BIG: Place = { x: 885, y: 300, w: 150 };
const DECK_DEAL: Place = { x: 925, y: 420, w: 70 };
const STOCK: Place = { x: 1640, y: 320, w: 100 };
const DEAL_EVERY = 2.5;

export function Setup() {
  const frame = useCurrentFrame();
  const m = useMarks('setup');
  const shuffleFrom = m.at('start', 0.2);
  const flip1 = m.word('start', 'The first two');
  const shuffleTo = flip1 - 8;
  const flip2 = flip1 + 16;
  const show47 = m.word('start', 'here, 47');
  const dealAt = m.at('deal', 0.1);
  const handsLabel = m.word('deal', '13 cards');
  const tableAt = m.word('deal', 'and 25 go');
  const tableLabel = m.word('deal', "that's the table");
  const stockAt = m.at('stock');
  const visibleAt = m.at('visible', 0.3);
  const takeAt = visibleAt + 14;

  // The deck: big while shuffled, small while dealt, then set aside as the stock.
  const toDeal = ramp(frame, dealAt - 14, dealAt);
  const toStock = ramp(frame, stockAt, stockAt + 18);
  const deck: Place = {
    x: lerp(lerp(DECK_BIG.x, DECK_DEAL.x, toDeal), STOCK.x, toStock),
    y: lerp(lerp(DECK_BIG.y, DECK_DEAL.y, toDeal), STOCK.y, toStock),
    w: lerp(lerp(DECK_BIG.w, DECK_DEAL.w, toDeal), STOCK.w, toStock),
  };
  const shuffling = frame >= shuffleFrom && frame < shuffleTo;
  const phase = shuffling ? (frame - shuffleFrom) / (shuffleTo - shuffleFrom) : 0;
  const riffle = shuffling ? Math.sin(Math.PI * ((phase * 2) % 1)) : 0;

  // The hands, dealt one card at a time, Player 1 first.
  const p1: HandItem[] = [];
  const p2: HandItem[] = [];
  for (let k = 0; k < 26; k++) {
    const item: HandItem = { key: `d${k}`, id: 0, arriveAt: dealAt + k * DEAL_EVERY };
    (k % 2 === 0 ? p1 : p2).push(item);
  }
  p1.push({ key: 'take', id: card('9S'), faceUp: true, arriveAt: takeAt, arriveFrames: 18 });
  const p1Places = handPlaces(p1, frame, HAND.bottom);
  const p2Places = handPlaces(p2, frame, HAND.top);
  const takeLanding = handPlaces(p1, takeAt + 18, HAND.bottom).take as Place;

  const boardIn = fade(frame, flip1 - 10, Number.POSITIVE_INFINITY, 12);
  const start1 = boardCard(0, 0);
  const start2 = boardCard(0, 1);
  const stockDim = ramp(frame, stockAt + 18, stockAt + 30);

  return (
    <>
      <BoardPanel opacity={boardIn}>
        <div
          style={{
            position: 'absolute',
            left: 34,
            top: 70 + 118,
            opacity: fade(frame, show47 + 6),
          }}
        >
          <Text size={26} color={C.ink2} weight={500}>
            {tr('starting number')}
          </Text>
        </div>
      </BoardPanel>
      {frame >= flip1 + 16 && (
        <PlayingCard id={card('4C')} compact w={start1.w} x={start1.x} y={start1.y} />
      )}
      {frame >= flip2 + 16 && (
        <PlayingCard id={card('7D')} compact w={start2.w} x={start2.x} y={start2.y} />
      )}
      <BoardValue row={0} value="47" frame={frame} at={show47} latest={1} />

      {/* The deck: shuffled as two halves riffling together. */}
      {[4, 3, 2, 1, 0].map((k) => {
        const side = k % 2 === 0 ? -1 : 1;
        return (
          <PlayingCard
            key={k}
            id={0}
            faceDown
            w={deck.w}
            x={deck.x - k * 2 + side * riffle * 120}
            y={deck.y - k * 2 - riffle * 10}
            rotate={side * riffle * 7}
            opacity={1 - stockDim * 0.45}
          />
        );
      })}
      <Flight
        id={card('4C')}
        from={DECK_BIG}
        to={start1}
        start={flip1}
        frames={16}
        flip={[0, 1]}
        frame={frame}
        compact
      />
      <Flight
        id={card('7D')}
        from={DECK_BIG}
        to={start2}
        start={flip2}
        frames={16}
        flip={[0, 1]}
        frame={frame}
        compact
      />

      {/* Dealing: the hands, face down, then the table, face up. */}
      {[...p1, ...p2].map((it) =>
        it.key === 'take' ? null : (
          <Flight
            key={it.key}
            id={0}
            from={DECK_DEAL}
            to={
              (p1.includes(it)
                ? handPlaces(p1, (it.arriveAt ?? 0) + 10, HAND.bottom)
                : handPlaces(p2, (it.arriveAt ?? 0) + 10, HAND.top))[it.key] as Place
            }
            start={it.arriveAt ?? 0}
            frames={10}
            lift={30}
            frame={frame}
          />
        ),
      )}
      <Hand
        items={p1}
        frame={frame}
        y={HAND.bottom}
        glow={{ take: frame < takeAt + 60 ? C.gold : '' }}
      />
      <Hand items={p2} frame={frame} y={HAND.top} />
      {TABLE.flatMap((row, r) =>
        row.map((code, c) => {
          const j = r * 5 + c;
          const start = tableAt + j * 2;
          const place = tablePos(r, c);
          const taken = code === '9S' && frame >= takeAt;
          if (frame < start || taken) return null;
          if (frame < start + 12) {
            return (
              <Flight
                key={code}
                id={card(code)}
                from={DECK_DEAL}
                to={place}
                start={start}
                frames={12}
                flip={[0, 1]}
                lift={40}
                frame={frame}
              />
            );
          }
          const lit = code === '9S' ? ramp(frame, visibleAt, visibleAt + 8) : 0;
          return (
            <PlayingCard
              key={code}
              id={card(code)}
              w={GRID.w}
              x={place.x}
              y={place.y - lit * 10}
              glow={lit > 0 ? C.gold : undefined}
            />
          );
        }),
      )}
      <Flight
        id={card('9S')}
        from={tablePos(2, 4)}
        to={takeLanding}
        start={takeAt}
        frames={18}
        flip={[1, 1]}
        lift={60}
        frame={frame}
        glow={C.gold}
      />

      <HandLabel
        seat={2}
        y={HAND.top}
        opacity={fade(frame, handsLabel)}
        count={tr('13 cards')}
        turn={0}
      />
      <HandLabel
        seat={1}
        y={HAND.bottom}
        opacity={fade(frame, handsLabel)}
        {...(frame < takeAt ? { count: tr('13 cards') } : {})}
        turn={0}
      />

      <div style={{ position: 'absolute', left: 1190, top: 440, opacity: fade(frame, tableLabel) }}>
        <Pill size={30} color={C.gold2} border="rgba(229,185,90,0.5)">
          {tr('the table')}
        </Pill>
        <div style={{ marginTop: 12, marginLeft: 6 }}>
          <Text size={26} color={C.ink2} weight={500}>
            {tr('25 cards, face up')}
          </Text>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: STOCK.x - 80,
          width: STOCK.w + 160,
          top: STOCK.y + 170,
          textAlign: 'center',
          opacity: fade(frame, stockAt + 16),
        }}
      >
        <Num size={56} color={C.ink2}>
          67
        </Num>
        <Text size={30} color={C.ink2} style={{ marginLeft: 10 }}>
          {tr('cards')}
        </Text>
        <div style={{ marginTop: 6 }}>
          <Text size={26} color={C.ink3} weight={500}>
            {tr('out of the game')}
          </Text>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: (p1Places.take?.x ?? 0) + 96,
          top: HAND.bottom + 30,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: fade(frame, takeAt + 20),
        }}
      >
        <Eye size={46} />
        <Text size={30} color={C.gold2}>
          {tr('visible to your opponent')}
        </Text>
      </div>

      <Sfx name="slide" at={shuffleFrom + 4} volume={0.22} />
      <Sfx name="slide" at={shuffleFrom + (shuffleTo - shuffleFrom) / 2 + 4} volume={0.22} />
      <Sfx name="flip" at={flip1 + 4} volume={0.3} />
      <Sfx name="flip" at={flip2 + 4} volume={0.3} />
      {[0, 4, 8, 12, 16, 20, 24].map((k) => (
        <Sfx key={k} name="card" at={dealAt + k * DEAL_EVERY + 8} volume={0.14} />
      ))}
      {[0, 6, 12, 18, 24].map((j) => (
        <Sfx key={`t${j}`} name="flip" at={tableAt + j * 2 + 8} volume={0.14} />
      ))}
      <Sfx name="slide" at={stockAt} volume={0.2} />
      <Sfx name="card" at={takeAt + 16} volume={0.25} />
      <Sfx name="pop" at={takeAt + 20} volume={0.18} />
    </>
  );
}
