/**
 * Plays real games in the app through a browser and takes the screenshots of the tutorial's
 * "Playing in the app" scene, with the boxes of the things the video points at.
 *
 *   ../apps/server/node_modules/.bin/tsx capture/capture.ts
 *
 * Needs the capture server on :3100 and the web app's production build on :4173.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  chromium,
  type Locator,
  type Page,
} from '../../apps/web/node_modules/@playwright/test/index.mjs';
import {
  bidValue,
  isAction,
  isDigit,
  validateMove,
  type BidChoice,
  type CardId,
} from '../../packages/engine/src/index.ts';
import { fromWireSeat, stateFromView, type WireView } from '../../packages/protocol/src/index.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'screens');
mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL ?? 'http://localhost:4173';
const VIEWPORT = { width: 1440, height: 810 };

type Box = { x: number; y: number; w: number; h: number };
const shots: Record<string, { file: string; boxes: Record<string, Box> }> = {};

// The app asks for Inter and Georgia; give the browser the same fonts as the video.
const font = (file: string) =>
  readFileSync(path.join(ROOT, 'node_modules', '@fontsource', file)).toString('base64');
const faces = [
  ['Inter', 'inter/files/inter-latin-400-normal.woff2', 400],
  ['Inter', 'inter/files/inter-latin-500-normal.woff2', 500],
  ['Inter', 'inter/files/inter-latin-600-normal.woff2', 600],
  ['Inter', 'inter/files/inter-latin-700-normal.woff2', 700],
  ['Georgia', 'gelasio/files/gelasio-latin-400-normal.woff2', 400],
  ['Georgia', 'gelasio/files/gelasio-latin-700-normal.woff2', 700],
] as const;
const fontCss = faces
  .map(
    ([family, file, weight]) =>
      `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${font(file)}) format('woff2');}`,
  )
  .join('\n');

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});

async function newPlayer(name: string) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    bypassCSP: true,
  });
  const page = await context.newPage();
  await page.addInitScript((css) => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, fontCss);
  await page.goto(WEB);
  await page.waitForFunction(() => window.__cardauction?.getState().connection === 'online');
  await page.getByTestId('nickname').fill(name);
  await page.getByTestId('nickname').press('Enter');
  await page.waitForFunction((n) => window.__cardauction?.getState().me?.nickname === n, name);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function box(locator: Locator): Promise<Box | null> {
  const b = await locator.first().boundingBox();
  return b
    ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    : null;
}

async function shot(page: Page, name: string, targets: Record<string, Locator>, settleMs = 900) {
  await page.waitForTimeout(settleMs); // let the card animations land
  const boxes: Record<string, Box> = {};
  for (const [key, locator] of Object.entries(targets)) {
    const b = await box(locator);
    if (b) boxes[key] = b;
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  shots[name] = { file: `screens/${name}.png`, boxes };
  console.log(`  shot ${name}: ${Object.keys(boxes).join(', ')}`);
}

const view = (page: Page): Promise<WireView | null> =>
  page.evaluate(() => window.__cardauction?.getState().game?.view ?? null);
const myTurn = (v: WireView | null) =>
  v !== null && v.status === 'playing' && v.toMove === v.you.seat;
const cardAt = (page: Page, zone: string, id: CardId) =>
  page.locator(`[data-zone="${zone}"][data-card-id="${id}"]`);

async function waitMyTurnOrOver(page: Page): Promise<WireView> {
  for (let i = 0; i < 600; i++) {
    const v = await view(page);
    if (v && (myTurn(v) || v.status === 'over')) return v;
    await page.waitForTimeout(200);
  }
  throw new Error('waited too long for a turn');
}

async function play(
  page: Page,
  v: WireView,
  bid: BidChoice,
  shots_: { tens?: string; units?: string; ready?: string; action?: string } = {},
) {
  const hand = new Set(v.you.hand);
  const zone = (id: CardId) => (hand.has(id) ? 'hand' : 'table');
  if (bid.action) {
    await cardAt(page, zone(bid.action.card), bid.action.card).click();
  }
  await cardAt(page, zone(bid.tens), bid.tens).click();
  if (shots_.tens)
    await shot(page, shots_.tens, {
      tens: cardAt(page, zone(bid.tens), bid.tens),
      composer: page.getByTestId('composer'),
      hand: page.getByTestId('hand'),
    });
  await cardAt(page, zone(bid.units), bid.units).click();
  if (bid.action) {
    if (shots_.action) {
      await shot(page, shots_.action, {
        plus: page.getByTestId('board-column-1'),
        minus: page.getByTestId('board-column-4'),
        board: page.getByTestId('board'),
        composer: page.getByTestId('composer'),
        action: cardAt(page, zone(bid.action.card), bid.action.card),
      });
    }
    await page.getByTestId(`board-column-${bid.action.column}`).click();
  }
  if (shots_.units)
    await shot(page, shots_.units, {
      status: page.getByTestId('status'),
      composer: page.getByTestId('composer'),
      board: page.getByTestId('board'),
      table: page.getByTestId('table'),
    });
  const used = new Set<CardId>([bid.tens, bid.units, ...(bid.action ? [bid.action.card] : [])]);
  const take = v.table.find((id) => !used.has(id));
  if (take !== undefined) await cardAt(page, 'table', take).click();
  if (shots_.ready)
    await shot(page, shots_.ready, {
      take: cardAt(page, 'table', take ?? -1),
      confirm: page.getByTestId('confirm').last(),
      status: page.getByTestId('status'),
      composer: page.getByTestId('composer'),
    });
  await page.getByTestId('confirm').last().click();
  await page.waitForFunction(
    (version) => (window.__cardauction?.getState().game?.view.version ?? 0) > version,
    v.version,
  );
}

/** Two digits of the hand that make a number in range but add no new color: the "why" example. */
function illegalPair(v: WireView): [CardId, CardId] | null {
  const state = stateFromView(v);
  const seat = fromWireSeat(v.you.seat);
  const digits = v.you.hand.filter(isDigit);
  for (const tens of digits) {
    for (const units of digits) {
      if (tens === units) continue;
      const take = v.table.find(() => true);
      const check = validateMove(state, seat, {
        type: 'bid',
        tens,
        units,
        ...(take !== undefined ? { take } : {}),
      });
      if (!check.ok && check.error === 'NO_NEW_COLOR') return [tens, units];
    }
  }
  return null;
}

async function legalBids(page: Page): Promise<BidChoice[]> {
  return page.evaluate(() => window.__cardauction?.legalBids() ?? []);
}

// 1. Home, with the name typed and Hard selected.
const ada = await newPlayer('Ada');
const { page } = ada;
await page.getByRole('radio', { name: 'Hard' }).click();
await page.getByRole('radio', { name: 'P1' }).click();
await shot(page, 'home', {
  nickname: page.getByTestId('nickname'),
  quick: page.locator('.home-card', { has: page.getByTestId('quick') }),
  ai: page.locator('.home-card', { has: page.getByTestId('ai-start') }),
  private: page.locator('.home-card', { has: page.getByTestId('create-code') }),
  language: page.getByTestId('language'),
});

// 2. Games against the AI as Player 1, until every step of a turn has been captured.
const needed = new Set(['table', 'why', 'tens', 'units', 'ready', 'action', 'result']);
for (let game = 0; game < 8 && needed.size > 0; game++) {
  if (game > 0) {
    await page.getByTestId('lobby').click();
    await page.getByRole('radio', { name: 'Easy' }).click();
    await page.getByRole('radio', { name: 'P1' }).click();
  }
  await page.getByTestId('ai-start').click();
  let v = await waitMyTurnOrOver(page);
  if (needed.has('table') && v.status === 'playing') {
    await shot(
      page,
      'table',
      {
        hand: page.getByTestId('hand'),
        table: page.getByTestId('table'),
        board: page.getByTestId('board'),
        opponent: page.getByTestId('opponent'),
        composer: page.getByTestId('composer'),
        assist: page.getByText('Assist').first(),
      },
      1600,
    );
    needed.delete('table');
  }
  let turns = 0;
  while (v.status !== 'over' && turns < 40) {
    const bids = await legalBids(page);
    const inHand = (id: CardId) => v.you.hand.includes(id);
    const plain = bids.filter((b) => !b.action && inHand(b.tens) && inHand(b.units));
    const withAction = bids.filter(
      (b) => b.action && inHand(b.action.card) && inHand(b.tens) && inHand(b.units),
    );
    if (v.phase === 'bid' && needed.has('why')) {
      const pair = illegalPair(v);
      if (pair) {
        await cardAt(page, 'hand', pair[0]).click();
        await cardAt(page, 'hand', pair[1]).click();
        await shot(page, 'why', {
          status: page.getByTestId('status'),
          composer: page.getByTestId('composer'),
          tens: cardAt(page, 'hand', pair[0]),
          units: cardAt(page, 'hand', pair[1]),
        });
        await page.getByRole('button', { name: 'Clear', exact: true }).click();
        await page.waitForTimeout(400);
        needed.delete('why');
      }
    }
    if (v.phase === 'bid' && needed.has('tens') && plain.length > 0) {
      await play(page, v, plain[0]!, { tens: 'tens', units: 'units', ready: 'ready' });
      needed.delete('tens');
      needed.delete('units');
      needed.delete('ready');
    } else if (v.phase === 'bid' && needed.has('action') && withAction.length > 0) {
      await play(page, v, withAction[0]!, { action: 'action' });
      needed.delete('action');
    } else {
      const bid = plain[0] ?? bids[0];
      if (!bid) throw new Error('no legal bid for the capture player');
      await play(page, v, bid);
    }
    turns++;
    v = await waitMyTurnOrOver(page);
  }
  if (v.status !== 'over') throw new Error('the capture game did not end');
  if (needed.has('result')) {
    await shot(
      page,
      'result',
      {
        result: page.getByTestId('result'),
        rematch: page.getByTestId('rematch'),
        opponent: page.getByTestId('opponent'),
      },
      2500,
    );
    needed.delete('result');
  }
  console.log(`  game ${game + 1} over; still missing: ${[...needed].join(', ') || 'nothing'}`);
}

// 3. A game as Player 2: the swap, then a lost connection.
await page.getByTestId('lobby').click();
await page.getByRole('radio', { name: 'Easy' }).click();
await page.getByRole('radio', { name: 'P2' }).click();
await page.getByTestId('ai-start').click();
const p2 = await waitMyTurnOrOver(page);
if (p2.phase === 'exchange') {
  const give = p2.you.hand[p2.you.hand.length - 1]!;
  const takeCard = p2.table.find((id) => isAction(id)) ?? p2.table[0]!;
  await cardAt(page, 'hand', give).click();
  await cardAt(page, 'table', takeCard).click();
  await shot(page, 'swap', {
    status: page.getByTestId('status'),
    pass: page.getByTestId('pass'),
    confirm: page.getByTestId('confirm').last(),
    give: cardAt(page, 'hand', give),
    take: cardAt(page, 'table', takeCard),
  });
  await page.getByTestId('pass').click();
  await page.waitForTimeout(800);
}
await ada.context.setOffline(true);
await page.getByTestId('banner').waitFor({ timeout: 10_000 });
await page.waitForTimeout(3500);
await shot(page, 'reconnect', { banner: page.getByTestId('banner') }, 200);
await ada.context.setOffline(false);
await page.waitForFunction(
  () => window.__cardauction?.getState().connection === 'online',
  undefined,
  { timeout: 20_000 },
);
await page.waitForTimeout(1500);

// 4. The rules, over the game.
await page.getByTitle('Rules').first().click();
await page.waitForTimeout(900);
await shot(page, 'rules', { dialog: page.getByRole('dialog').first() });

writeFileSync(
  path.join(ROOT, 'src', 'screens.json'),
  JSON.stringify({ viewport: VIEWPORT, shots }, null, 1),
);
await browser.close();
console.log(`captured ${Object.keys(shots).length} screens`);
