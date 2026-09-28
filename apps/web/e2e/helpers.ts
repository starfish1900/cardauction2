import type { BidChoice, CardId } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import { expect, type Browser, type Page } from '@playwright/test';

/** Opens the app in a fresh browser context (a new guest) and waits for the server. */
export async function newPlayer(
  browser: Browser,
  name?: string,
  prepare?: (page: Page) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Anything the Content-Security-Policy blocks, and any uncaught error, fails the test.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const w = window as unknown as { __violations?: string[] };
      (w.__violations ??= []).push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const errors: string[] = [];
  problems.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  if (prepare) await prepare(page);
  await page.goto('/');
  await waitOnline(page);
  if (name) await setName(page, name);
  return page;
}

const problems = new WeakMap<Page, string[]>();

/** No page error and nothing blocked by the Content-Security-Policy. */
export async function expectClean(...pages: Page[]): Promise<void> {
  for (const page of pages) {
    const violations = await page.evaluate(
      () => (window as unknown as { __violations?: string[] }).__violations ?? [],
    );
    expect(violations).toEqual([]);
    expect(problems.get(page) ?? []).toEqual([]);
  }
}

export async function waitOnline(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__cardauction?.getState().connection === 'online');
}

export async function setName(page: Page, name: string): Promise<void> {
  await page.getByTestId('nickname').fill(name);
  await page.getByTestId('nickname').press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__cardauction?.getState().me?.nickname))
    .toBe(name);
}

export function view(page: Page): Promise<WireView | null> {
  return page.evaluate(() => window.__cardauction?.getState().game?.view ?? null);
}

export function isMyTurn(v: WireView | null): boolean {
  return v !== null && v.status === 'playing' && v.toMove === v.you.seat;
}

/** Taps a card where it lies: in the hand or on the table. */
async function tapCard(page: Page, zone: 'hand' | 'table', id: CardId): Promise<void> {
  await page.locator(`[data-zone="${zone}"][data-card-id="${id}"]`).click();
}

/**
 * Plays one turn through the interface, like a person: tap the cards, choose the column, tap a
 * table card to take, Confirm. `variety` picks between the legal moves so that games differ.
 */
export async function playTurn(page: Page, variety: number): Promise<void> {
  const v = await view(page);
  if (!v || !isMyTurn(v)) throw new Error('not this player’s turn');
  const confirm = page.getByTestId('confirm');
  if (v.phase === 'exchange') {
    if (variety % 2 === 0) {
      await page.getByTestId('pass').click();
    } else {
      await tapCard(page, 'hand', v.you.hand[v.you.hand.length - 1] as CardId);
      await tapCard(page, 'table', v.table[0] as CardId);
      await expect(page.getByTestId('status')).toContainText('?');
      await confirm.click();
    }
  } else {
    const bids: BidChoice[] = await page.evaluate(() => window.__cardauction?.legalBids() ?? []);
    expect(bids.length).toBeGreaterThan(0);
    const withAction = bids.filter((b) => b.action);
    const pool = variety % 3 === 0 && withAction.length > 0 ? withAction : bids;
    const bid = pool[variety % pool.length] as BidChoice;
    const hand = new Set(v.you.hand);
    const zone = (id: CardId): 'hand' | 'table' => (hand.has(id) ? 'hand' : 'table');
    if (bid.action) await tapCard(page, zone(bid.action.card), bid.action.card);
    await tapCard(page, zone(bid.tens), bid.tens);
    await tapCard(page, zone(bid.units), bid.units);
    if (bid.action) {
      await expect(page.getByTestId('composer')).toHaveAttribute('data-stage', 'pickColumn');
      // Alternate between the board's column buttons and the composer's.
      const button =
        variety % 2 === 0
          ? page.getByTestId(`board-column-${bid.action.column}`)
          : page.getByTestId(`column-${bid.action.column}`);
      await button.click();
    }
    const used = new Set<CardId>([bid.tens, bid.units, ...(bid.action ? [bid.action.card] : [])]);
    const take = v.table.find((id) => !used.has(id));
    if (take !== undefined) {
      await expect(page.getByTestId('composer')).toHaveAttribute('data-stage', 'pickTake');
      await tapCard(page, 'table', take);
    }
    await expect(page.getByTestId('composer')).toHaveAttribute('data-stage', 'ready');
    await confirm.click();
  }
  await page.waitForFunction(
    (version) => (window.__cardauction?.getState().game?.view.version ?? 0) > version,
    v.version,
  );
}

/** Plays every turn that falls to one of these pages (the AI plays its own) until the end. */
export async function playUntilOver(pages: readonly Page[]): Promise<number> {
  let turns = 0;
  for (let round = 0; round < 2000; round++) {
    const views = await Promise.all(pages.map(view));
    if (views.every((v) => v?.status === 'over')) return turns;
    const index = views.findIndex(isMyTurn);
    const page = pages[index];
    if (!page) {
      await pages[0]?.waitForTimeout(150);
      continue;
    }
    await playTurn(page, turns);
    turns += 1;
  }
  throw new Error('the game did not end');
}

/** Starts a private game: the host creates a code, the guest opens the invitation link. */
export async function privateGame(host: Page, guest: Page): Promise<void> {
  await host.getByTestId('create-code').click();
  const code = await host.getByTestId('private-code').getAttribute('aria-label');
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await guest.goto(`/join/${code}`);
  await expect(host.getByTestId('game')).toBeVisible();
  await expect(guest.getByTestId('game')).toBeVisible();
}

/** The page whose turn it is, once the game has started. */
export async function whoseTurn(pages: readonly Page[]): Promise<Page> {
  for (let round = 0; round < 400; round++) {
    const views = await Promise.all(pages.map(view));
    const page = pages[views.findIndex(isMyTurn)];
    if (page) return page;
    await pages[0]?.waitForTimeout(100);
  }
  throw new Error('nobody is to move');
}
