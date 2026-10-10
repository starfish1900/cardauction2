import { expect, test } from '@playwright/test';
import { expectClean, isMyTurn, newPlayer, playUntilOver, view } from './helpers';

test('a game against the AI, played to the end', async ({ browser }) => {
  const page = await newPlayer(browser, 'Carol');
  await page.getByRole('radio', { name: 'P1' }).click();
  await page.getByTestId('ai-start').click();
  await expect(page.getByTestId('game')).toBeVisible();
  await expect(page.getByTestId('game')).toHaveAttribute('data-seat', 'P1');
  // Assist mode is on against the AI: some cards are highlighted when it is our turn.
  await expect.poll(async () => isMyTurn(await view(page)), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('.card--playable').first()).toBeVisible();

  await playUntilOver([page]);
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('opponent')).not.toContainText('Known');
  await expectClean(page);
});

test('the composer explains an illegal bid before it is sent', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.getByRole('radio', { name: 'P1' }).click();
  await page.getByTestId('ai-start').click();
  await expect.poll(async () => isMyTurn(await view(page)), { timeout: 20_000 }).toBe(true);

  // Two hand cards and no table card: P1's first bid must use one table card.
  const v = await view(page);
  const digits = (v?.you.hand ?? []).filter((id) => id < 100);
  expect(digits.length).toBeGreaterThan(1);
  for (const id of digits.slice(0, 2)) {
    await page.locator(`[data-zone="hand"][data-card-id="${id}"]`).click();
  }
  await expect(page.getByTestId('composer')).toHaveAttribute('data-stage', 'invalid');
  await expect(page.getByTestId('status')).not.toBeEmpty();
  await expect(page.getByTestId('confirm')).toHaveAttribute('aria-disabled', 'true');
  // Confirm does nothing but shake; the move is never sent.
  const version = v?.version;
  await page.getByTestId('confirm').click({ force: true });
  expect((await view(page))?.version).toBe(version);

  // Resigning ends the game at once.
  await page.getByTestId('resign').click();
  await page.getByTestId('resign-confirm').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-outcome', 'lose');
  await expectClean(page);
});

test('the column titles of the bids stay apart, in English and in French', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.getByTestId('ai-start').click();
  await expect(page.getByTestId('board')).toBeVisible();
  for (const tens of ['Tens', 'Dizaines']) {
    await expect(page.locator('.board-title--tens')).toHaveText(tens);
    // Each title's text as drawn: two on one line must not touch, and none may leave the header.
    const titles = await page.locator('.board-title').evaluateAll((spans) =>
      spans.map((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const { left, right, top, bottom } = range.getBoundingClientRect();
        return { text: span.textContent ?? '', left, right, top, bottom };
      }),
    );
    const head = await page.locator('.board-grid--head').boundingBox();
    expect(titles).toHaveLength(4);
    for (const [i, a] of titles.entries()) {
      expect(a.left, a.text).toBeGreaterThanOrEqual(head?.x ?? Infinity);
      expect(a.right, a.text).toBeLessThanOrEqual((head?.x ?? 0) + (head?.width ?? 0));
      for (const b of titles.slice(i + 1)) {
        if (Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top)) continue;
        const gap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
        expect(gap, `${a.text} and ${b.text}`).toBeGreaterThanOrEqual(3);
      }
    }
    await page.getByTestId('language').click();
  }
  await page.getByTestId('resign').click();
  await page.getByTestId('resign-confirm').click();
  await expect(page.getByTestId('result')).toBeVisible();
  await expectClean(page);
});

test('language, rules and the invitation code screen', async ({ browser }) => {
  const page = await newPlayer(browser);
  await expect(page.getByTestId('quick')).toBeVisible();

  await page.getByTestId('language').click();
  await expect(page.getByTestId('home')).toContainText('Partie rapide');
  await page.getByTestId('language').click();
  await expect(page.getByTestId('home')).toContainText('Quick match');

  await page.getByRole('button', { name: /How to play/ }).click();
  const rules = page.getByRole('dialog');
  await expect(rules).toContainText('Outbid your opponent');
  // The video tutorial opens on YouTube, in a new tab.
  const tutorial = rules.getByRole('link', { name: /Watch the tutorial/ });
  await expect(tutorial).toHaveAttribute('href', 'https://youtu.be/rnim6YZoadw');
  await expect(tutorial).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Escape');
  await expect(rules).toBeHidden();

  // In French, the button opens the French video.
  await page.getByTestId('language').click();
  await page.getByRole('button', { name: /Comment jouer/ }).click();
  const tutoriel = rules.getByRole('link', { name: /Regarder le tutoriel/ });
  await expect(tutoriel).toHaveAttribute('href', 'https://youtu.be/xwfvwQZjbys');
  await expect(tutoriel).toContainText('Vidéo de 8 minutes sur YouTube');
  await expect(tutoriel).not.toContainText('anglais');
  await page.keyboard.press('Escape');
  await expect(rules).toBeHidden();
  await page.getByTestId('language').click();
  await expect(page.getByTestId('home')).toContainText('Quick match');

  await page.getByTestId('create-code').click();
  await expect(page.getByTestId('host')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('home')).toBeVisible();

  // An unknown code is refused with a message.
  await page.getByTestId('code-input').fill('ZZZZZZ');
  await page.getByTestId('join').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expectClean(page);
});
