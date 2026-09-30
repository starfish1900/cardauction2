import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { card } from '../cards';
import { fade, pop } from '../components/anim';
import { Num, PlayingCard, Sfx, Text, useAppear, useProgress, Verdict } from '../components/base';
import { C } from '../theme';
import { useMarks } from '../timeline';
import { tr } from '../lang';

const FAN = ['3*', '9D', 'A0', '5H', '0C', '8S', '7D'];

export function Intro() {
  const frame = useCurrentFrame();
  const m = useMarks('intro');
  const title = useAppear(6);
  const fanIn = useAppear(14, 16);
  const pair = useProgress(m.at('idea'), m.at('idea', 0.9), Easing.out(Easing.cubic));
  const value = useAppear(m.at('idea', 0.8));
  const count = useProgress(m.at('promise'), m.at('promise', 2.2), Easing.out(Easing.quad));
  const hundred = Math.round(interpolate(count, [0, 1], [1, 100]));
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 150,
          textAlign: 'center',
          opacity: title,
          transform: `translateY(${(1 - title) * 30}px)`,
        }}
      >
        <Num
          size={132}
          color={C.gold2}
          style={{ letterSpacing: 1, textShadow: '0 4px 18px rgba(0,0,0,0.35)' }}
        >
          {tr('CardAuction')}
        </Num>
        <div style={{ marginTop: 18 }}>
          <Text size={44} color={C.ink2} weight={500}>
            {tr('How to play')}
          </Text>
        </div>
      </div>
      {FAN.map((code, i) => {
        const spread = (i - (FAN.length - 1) / 2) * fanIn;
        const centerPair = code === '5H' || code === '8S';
        const t = centerPair ? pair : 0;
        const baseX = 960 - 80 + spread * 105;
        const baseY = 520 + Math.abs(spread) * 14;
        const targetX = code === '5H' ? 650 : 870;
        const x = interpolate(t, [0, 1], [baseX, targetX]);
        const y = interpolate(t, [0, 1], [baseY, 470]);
        const rotate = interpolate(t, [0, 1], [spread * 7, 0]);
        const w = interpolate(t, [0, 1], [160, 190]);
        const fade = centerPair ? 1 : 1 - pair;
        return (
          <PlayingCard
            key={code}
            id={card(code)}
            w={w}
            x={x}
            y={y}
            rotate={rotate}
            opacity={fanIn * fade}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 1110,
          top: 555,
          opacity: value,
          transform: `scale(${0.7 + value * 0.3})`,
          transformOrigin: 'left center',
        }}
      >
        <Num size={150} color={C.ink}>
          = 58
        </Num>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 790,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 22,
          opacity: fade(frame, m.at('promise', -0.1), m.at('promise', 5.6), 10),
        }}
      >
        <Text size={40} color={C.ink2} weight={500}>
          {tr('count to')}
        </Text>
        <Pill100 value={hundred} />
        <div
          style={{
            opacity: Math.min(1, pop(frame, m.at('promise', 2.3))),
            transform: `scale(${Math.min(1.1, pop(frame, m.at('promise', 2.3)))})`,
          }}
        >
          <Verdict ok size={64} />
        </div>
      </div>
      <Sfx name="whoosh" at={10} volume={0.25} />
      <Sfx name="card" at={m.at('idea', 0.6)} volume={0.3} />
      <Sfx name="chime" at={m.at('promise', 2.3)} volume={0.18} />
    </>
  );
}

function Pill100({ value }: { value: number }) {
  return (
    <div
      style={{
        padding: '14px 28px',
        borderRadius: 20,
        background: 'rgba(3,22,16,0.6)',
        border: '2px solid rgba(229,185,90,0.4)',
      }}
    >
      <Num size={64} color={C.gold2}>
        {value}
      </Num>
    </div>
  );
}
