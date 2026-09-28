import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { fade, pop } from '../components/anim';
import { Num, PlayingCard, Sfx, Text } from '../components/base';
import { SuitRow } from '../components/rules';
import { card } from '../cards';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';
import { SITE } from './App';

function Badge({
  at,
  frame,
  icon,
  children,
  x,
  y,
}: {
  at: number;
  frame: number;
  icon: ReactNode;
  children: ReactNode;
  x: number;
  y: number;
}) {
  const t = Math.min(1, pop(frame, at));
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 790,
        height: 150,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 30px',
        borderRadius: 28,
        background: 'rgba(3,22,16,0.6)',
        border: '2px solid rgba(229,185,90,0.35)',
        opacity: t,
        transform: `translateY(${(1 - t) * 24}px) scale(${0.94 + 0.06 * t})`,
      }}
    >
      <div style={{ width: 200, flex: 'none', display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <span
        style={{
          fontFamily: UI,
          fontWeight: 700,
          fontSize: 40,
          color: C.ink,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function Outro() {
  const frame = useCurrentFrame();
  const m = useMarks('outro');
  const titleAt = m.at('recap');
  const countAt = m.word('recap', 'Count up');
  const rollAt = m.word('recap', 'remember that after 99');
  const colorAt = m.word('recap', 'bring a new color');
  const actionAt = m.word('recap', 'and use your action cards');
  const luckAt = m.at('luck');
  const recapOut = m.at('luck', -0.3);

  return (
    <>
      <div style={{ opacity: fade(frame, titleAt, recapOut, 12) }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center' }}>
          <Num size={84} color={C.gold2}>
            That&apos;s everything!
          </Num>
        </div>
        <Badge
          at={countAt}
          frame={frame}
          x={150}
          y={290}
          icon={
            <Num size={48} color={C.mint}>
              +1…10
            </Num>
          }
        >
          Count up 1 to 10 steps
        </Badge>
        <Badge
          at={rollAt}
          frame={frame}
          x={980}
          y={290}
          icon={
            <Num size={48} color={C.gold2}>
              99→00
            </Num>
          }
        >
          After 99 comes 00
        </Badge>
        <Badge at={colorAt} frame={frame} x={150} y={500} icon={<SuitRow size={26} gap={4} />}>
          Bring a new color
        </Badge>
        <Badge
          at={actionAt}
          frame={frame}
          x={980}
          y={500}
          icon={<PlayingCard id={card('A0')} w={82} style={{ position: 'relative' }} />}
        >
          Use action cards wisely
        </Badge>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 250,
          textAlign: 'center',
          opacity: fade(frame, luckAt - 4),
        }}
      >
        <Num size={110} color={C.gold2}>
          Have fun, and good luck!
        </Num>
        <div style={{ marginTop: 50 }}>
          <Text size={30} color={C.ink2} weight={500}>
            Play CardAuction at
          </Text>
        </div>
        <div
          style={{
            marginTop: 16,
            display: 'inline-block',
            padding: '18px 40px',
            borderRadius: 999,
            background: '#f6f1e3',
          }}
        >
          <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 48, color: '#10231d' }}>
            {SITE}
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 770,
          display: 'flex',
          justifyContent: 'center',
          gap: 22,
          opacity: fade(frame, luckAt + 6),
        }}
      >
        {['5H', '8S', 'A1', '9*', '0D'].map((code, i) => (
          <PlayingCard
            key={code}
            id={card(code)}
            w={78}
            style={{ position: 'relative', transform: `rotate(${(i - 2) * 6}deg)` }}
          />
        ))}
      </div>

      <Sfx name="chime" at={countAt} volume={0.14} />
      <Sfx name="chime" at={rollAt} volume={0.14} />
      <Sfx name="chime" at={colorAt} volume={0.14} />
      <Sfx name="chime" at={actionAt} volume={0.14} />
      <Sfx name="whoosh" at={luckAt - 6} volume={0.16} />
    </>
  );
}
