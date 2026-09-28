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
  await page.keyboard.press('Escape');
  await expect(rules).toBeHidden();

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
