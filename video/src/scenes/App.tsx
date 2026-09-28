import { Img, staticFile, useCurrentFrame } from 'remotion';
import { easeInOut, fade, lerp, ramp } from '../components/anim';
import { Sfx, Text } from '../components/base';
import screens from '../screens.json';
import { C, UI } from '../theme';
import { useMarks } from '../timeline';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Cam {
  readonly z: number;
  readonly cx: number;
  readonly cy: number;
}

export const SITE = 'cardauction-web.onrender.com';
const SHOTS = screens.shots as Record<string, { file: string; boxes: Record<string, Box> }>;
const shotBox = (screen: string, name: string): Box => {
  const found = SHOTS[screen]?.boxes[name];
  if (!found) throw new Error(`no box ${name} on screen ${screen}`);
  return found;
};
/** Boxes the capture did not record, measured on the screenshots. */
const EXTRA: Record<string, Box> = {
  units: { x: 1111, y: 556, w: 78, h: 109 },
  assist: { x: 1094, y: 10, w: 96, h: 34 },
  language: { x: 1294, y: 10, w: 46, h: 36 },
  opponent: { x: 76, y: 68, w: 560, h: 70 },
  check: { x: 82, y: 695, w: 1000, h: 95 },
};
const pad = (b: Box, p: number): Box => ({
  x: b.x - p,
  y: b.y - p,
  w: b.w + 2 * p,
  h: b.h + 2 * p,
});
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** The browser window the app is shown in. */
const WIN = { x: 280, y: 96, w: 1360, bar: 44 } as const;
const VIEW = { x: WIN.x, y: WIN.y + WIN.bar, w: 1360, h: 765 } as const;
const K = VIEW.w / 1440;
const FULL: Cam = { z: 1, cx: 720, cy: 405 };
const on = (b: Box, z: number): Cam => ({ z, cx: b.x + b.w / 2, cy: b.y + b.h / 2 });

function camAt(frame: number, keys: readonly (readonly [number, Cam])[], frames = 20): Cam {
  let cam = keys[0]?.[1] ?? FULL;
  for (let i = 1; i < keys.length; i++) {
    const [at, next] = keys[i] as readonly [number, Cam];
    if (frame < at) break;
    const t = ramp(frame, at, at + frames, easeInOut);
    const blended = {
      z: lerp(cam.z, next.z, t),
      cx: lerp(cam.cx, next.cx, t),
      cy: lerp(cam.cy, next.cy, t),
    };
    if (t < 1) return blended;
    cam = next;
  }
  return cam;
}

function place(cam: Cam) {
  const s = K * cam.z;
  const tx = Math.min(0, Math.max(VIEW.w - 1440 * s, VIEW.w / 2 - cam.cx * s));
  const ty = Math.min(0, Math.max(VIEW.h - 810 * s, VIEW.h / 2 - cam.cy * s));
  return { s, tx, ty };
}

interface Mark {
  readonly from: number;
  readonly to: number;
  readonly screen: string;
  readonly box: Box;
}
interface Tap {
  readonly at: number;
  readonly screen: string;
  readonly box: Box;
}

export function App() {
  const frame = useCurrentFrame();
  const m = useMarks('app');
  const b = (screen: string, name: string): Box => EXTRA[name] ?? shotBox(screen, name);

  const winIn = m.end('open', -0.5);
  const tableAt = m.at('table', -0.2);
  const composeAt = m.at('compose', -0.1);
  const unitsAt = m.word('compose', 'then one for the units');
  const checkAt = m.word('compose', 'The app shows');
  const whyAt = m.at('why', -0.1);
  const actionAt = m.at('action', -0.1);
  const confirmAt = m.at('confirm', -0.1);
  const assistAt = m.at('assist', -0.1);
  const litAt = m.word('assist', 'the cards that fit');
  const swapAt = m.at('swap', -0.1);
  const graceAt = m.at('grace', -0.1);
  const resultAt = m.at('result', -0.1);
  const rulesAt = m.at('rules', -0.1);
  const end = m.length;

  const screensAt: readonly (readonly [number, string])[] = [
    [0, 'home'],
    [tableAt, 'table'],
    [composeAt, 'tens'],
    [unitsAt + 8, 'units'],
    [whyAt, 'why'],
    [actionAt, 'action'],
    [confirmAt, 'ready'],
    [assistAt, 'table'],
    [swapAt, 'swap'],
    [graceAt, 'reconnect'],
    [resultAt, 'result'],
    [rulesAt, 'rules'],
  ];
  let current = 0;
  screensAt.forEach(([at], i) => {
    if (frame >= at) current = i;
  });
  const [curAt, curScreen] = screensAt[current] as readonly [number, string];
  const prevScreen = current > 0 ? (screensAt[current - 1] as readonly [number, string])[1] : null;
  const swap = ramp(frame, curAt, curAt + 10);

  const cam = camAt(frame, [
    [0, FULL],
    [m.word('opponent', 'At the top'), on(b('table', 'opponent'), 1.45)],
    [m.at('opponent', 5.2), FULL],
    [composeAt, { z: 1.15, cx: 720, cy: 640 }],
    [actionAt, on(union(b('action', 'plus'), b('action', 'action')), 1.55)],
    [confirmAt, FULL],
  ]);
  const t = place(cam);
  const view = (box: Box) => ({
    x: t.tx + box.x * t.s,
    y: t.ty + box.y * t.s,
    w: box.w * t.s,
    h: box.h * t.s,
  });

  const marks: Mark[] = [
    {
      from: m.word('quick', 'Type your name'),
      to: m.word('quick', 'then pick'),
      screen: 'home',
      box: b('home', 'nickname'),
    },
    {
      from: m.word('quick', 'Quick match'),
      to: m.at('ai'),
      screen: 'home',
      box: b('home', 'quick'),
    },
    { from: m.at('ai'), to: m.at('private'), screen: 'home', box: b('home', 'ai') },
    { from: m.at('private'), to: m.end('private', 0.3), screen: 'home', box: b('home', 'private') },
    {
      from: m.word('table', 'your hand'),
      to: m.word('table', 'the table cards'),
      screen: 'table',
      box: b('table', 'hand'),
    },
    {
      from: m.word('table', 'the table cards'),
      to: m.word('table', 'and the bid board'),
      screen: 'table',
      box: b('table', 'table'),
    },
    {
      from: m.word('table', 'and the bid board'),
      to: m.end('table', 0.2),
      screen: 'table',
      box: b('table', 'board'),
    },
    {
      from: m.word('opponent', 'At the top'),
      to: m.end('opponent'),
      screen: 'table',
      box: b('table', 'opponent'),
    },
    { from: checkAt, to: whyAt, screen: 'units', box: b('units', 'check') },
    { from: whyAt + 8, to: actionAt, screen: 'why', box: b('why', 'status') },
    {
      from: m.word('action', 'the plus 10'),
      to: confirmAt,
      screen: 'action',
      box: pad(union(b('action', 'plus'), b('action', 'minus')), 4),
    },
    { from: assistAt + 6, to: litAt, screen: 'table', box: b('table', 'assist') },
    { from: litAt + 8, to: swapAt, screen: 'table', box: b('table', 'hand') },
    {
      from: m.word('swap', 'or keep your hand'),
      to: graceAt,
      screen: 'swap',
      box: b('swap', 'pass'),
    },
    { from: graceAt + 10, to: resultAt, screen: 'reconnect', box: b('reconnect', 'banner') },
    {
      from: resultAt + 10,
      to: m.word('result', 'ask for a rematch'),
      screen: 'result',
      box: b('result', 'result'),
    },
    {
      from: m.word('result', 'ask for a rematch'),
      to: rulesAt,
      screen: 'result',
      box: b('result', 'rematch'),
    },
    {
      from: rulesAt + 10,
      to: m.word('rules', 'in English'),
      screen: 'rules',
      box: b('rules', 'dialog'),
    },
    { from: m.word('rules', 'in English'), to: end, screen: 'rules', box: b('rules', 'language') },
  ];
  const taps: Tap[] = [
    { at: m.word('quick', 'Type your name', 0.3), screen: 'home', box: b('home', 'nickname') },
    { at: m.word('compose', 'a card for the tens'), screen: 'tens', box: b('tens', 'tens') },
    { at: unitsAt, screen: 'tens', box: EXTRA.units as Box },
    { at: m.word('action', 'tap it'), screen: 'action', box: b('action', 'action') },
    { at: m.word('action', 'the plus 10', 0.5), screen: 'action', box: b('action', 'plus') },
    { at: m.word('confirm', 'tap a table card'), screen: 'ready', box: b('ready', 'take') },
    { at: m.word('confirm', 'press Confirm'), screen: 'ready', box: b('ready', 'confirm') },
    { at: m.word('swap', 'tap a card in your hand'), screen: 'swap', box: b('swap', 'give') },
    { at: m.word('swap', 'and a table card'), screen: 'swap', box: b('swap', 'take') },
  ];

  const winT = ramp(frame, winIn, winIn + 16, easeInOut);
  const urlCard = 1 - ramp(frame, winIn - 4, winIn + 8);
  const typed = Math.round(
    lerp(
      0,
      SITE.length,
      ramp(frame, m.at('open', 0.5), m.at('open', 2.4), (x) => x),
    ),
  );

  return (
    <>
      {/* The address, big, before the app opens. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 300,
          textAlign: 'center',
          opacity: fade(frame, m.at('open', 0.1)) * urlCard,
        }}
      >
        <div>
          <Text size={40} color={C.ink2}>
            Open the website:
          </Text>
        </div>
        <div
          style={{
            marginTop: 30,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 22,
            padding: '26px 44px',
            borderRadius: 999,
            background: '#f6f1e3',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          }}
        >
          <svg
            width={52}
            height={52}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#28413a"
            strokeWidth={1.8}
          >
            <circle cx="12" cy="12" r="9.5" />
            <path d="M2.5 12 H21.5 M12 2.5 C15 6 15 18 12 21.5 M12 2.5 C9 6 9 18 12 21.5" />
          </svg>
          <span
            style={{
              fontFamily: UI,
              fontWeight: 600,
              fontSize: 60,
              color: '#10231d',
              letterSpacing: 0.5,
            }}
          >
            {SITE.slice(0, typed)}
            <span
              style={{
                opacity: Math.floor(frame / 15) % 2 === 0 || typed < SITE.length ? 1 : 0,
                color: C.felt1,
              }}
            >
              |
            </span>
          </span>
        </div>
      </div>

      {/* The browser window. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 930,
          opacity: winT,
          transform: `scale(${lerp(0.94, 1, winT)})`,
          transformOrigin: '960px 500px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: WIN.x - 2,
            top: WIN.y - 2,
            width: WIN.w + 4,
            height: WIN.bar + VIEW.h + 4,
            borderRadius: 18,
            background: '#0b1512',
            boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
            border: '2px solid rgba(255,255,255,0.12)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: WIN.x,
            top: WIN.y,
            width: WIN.w,
            height: WIN.bar,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 18,
          }}
        >
          {['#ff6b5f', '#ffbd2e', '#28c840'].map((c) => (
            <div
              key={c}
              style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.8 }}
            />
          ))}
          <div
            style={{
              marginLeft: 150,
              width: 760,
              height: 30,
              borderRadius: 15,
              background: 'rgba(255,255,255,0.09)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              paddingLeft: 16,
            }}
          >
            <svg width={14} height={16} viewBox="0 0 14 16">
              <rect x="1" y="7" width="12" height="8.5" rx="2" fill="#bcc9c1" />
              <path d="M4 7 V5 A3 3 0 0 1 10 5 V7" fill="none" stroke="#bcc9c1" strokeWidth="1.8" />
            </svg>
            <span style={{ fontFamily: UI, fontSize: 19, fontWeight: 500, color: '#dfe7e2' }}>
              {SITE}
            </span>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: VIEW.x,
            top: VIEW.y,
            width: VIEW.w,
            height: VIEW.h,
            overflow: 'hidden',
            borderRadius: '0 0 16px 16px',
            background: '#0d4534',
          }}
        >
          {prevScreen && swap < 1 && <Shot name={prevScreen} t={t} opacity={1} />}
          <Shot name={curScreen} t={t} opacity={prevScreen ? swap : 1} />
          {marks.map((mk, i) => {
            if (mk.screen !== curScreen || frame < mk.from - 2 || frame > mk.to + 10) return null;
            const o = fade(frame, mk.from, mk.to, 8);
            const r = view(pad(mk.box, 6));
            return (
              <div key={i}>
                <svg
                  style={{ position: 'absolute', left: 0, top: 0 }}
                  width={VIEW.w}
                  height={VIEW.h}
                >
                  <path
                    d={`M0 0 H${VIEW.w} V${VIEW.h} H0 Z M${r.x + 10} ${r.y} H${r.x + r.w - 10} Q${r.x + r.w} ${r.y} ${r.x + r.w} ${r.y + 10} V${r.y + r.h - 10} Q${r.x + r.w} ${r.y + r.h} ${r.x + r.w - 10} ${r.y + r.h} H${r.x + 10} Q${r.x} ${r.y + r.h} ${r.x} ${r.y + r.h - 10} V${r.y + 10} Q${r.x} ${r.y} ${r.x + 10} ${r.y} Z`}
                    fill={`rgba(2,12,9,${0.42 * o})`}
                    fillRule="evenodd"
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    borderRadius: 10,
                    border: `4px solid ${C.gold}`,
                    boxShadow: `0 0 18px rgba(229,185,90,0.6)`,
                    opacity: o,
                  }}
                />
              </div>
            );
          })}
          {taps.map((tap, i) => {
            if (tap.screen !== curScreen && !(tap.screen === 'tens' && curScreen === 'units'))
              return null;
            const d = frame - tap.at;
            if (d < -6 || d > 22) return null;
            const r = view(tap.box);
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const press = d < 0 ? 1 - ((d + 6) / 6) * 0.25 : Math.min(1, 0.75 + d / 24);
            const ring = Math.max(0, d) / 22;
            return (
              <div key={`tap${i}`}>
                <div
                  style={{
                    position: 'absolute',
                    left: cx - 60 * ring - 10,
                    top: cy - 60 * ring - 10,
                    width: 20 + 120 * ring,
                    height: 20 + 120 * ring,
                    borderRadius: '50%',
                    border: `4px solid rgba(255,255,255,${0.9 * (1 - ring)})`,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: cx - 22,
                    top: cy - 22,
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: 'rgba(255,255,255,0.85)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
                    transform: `scale(${press})`,
                    opacity: d > 14 ? 1 - (d - 14) / 8 : 1,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <Sfx name="whoosh" at={winIn} volume={0.16} />
      {taps.map((tap, i) => (
        <Sfx key={i} name="tick" at={tap.at} volume={0.3} />
      ))}
      {screensAt.slice(1).map(([at], i) => (
        <Sfx key={`s${i}`} name="slide" at={at} volume={0.08} />
      ))}
    </>
  );
}

function Shot({
  name,
  t,
  opacity,
}: {
  name: string;
  t: { s: number; tx: number; ty: number };
  opacity: number;
}) {
  return (
    <Img
      src={staticFile(`screens/${name}.png`)}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1440,
        height: 810,
        transformOrigin: '0 0',
        transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`,
        opacity,
      }}
    />
  );
}
