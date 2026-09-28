import { expect, test } from '@playwright/test';
import type { WebSocketRoute } from '@playwright/test';
import {
  expectClean,
  newPlayer,
  playTurn,
  playUntilOver,
  privateGame,
  view,
  whoseTurn,
} from './helpers';

test('two browsers play a full game, then a rematch', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice');
  const bob = await newPlayer(browser, 'Bob');
  await privateGame(alice, bob);

  // Each sees the other.
  await expect(alice.getByTestId('opponent')).toContainText('Bob');
  await expect(bob.getByTestId('opponent')).toContainText('Alice');
  const first = await view(alice);
  expect(first).not.toBeNull();

  const turns = await playUntilOver([alice, bob]);
  expect(turns).toBeGreaterThan(0);

  // Both see the result, one winner and one loser, and both hands face up.
  await expect(alice.getByTestId('result')).toBeVisible();
  await expect(bob.getByTestId('result')).toBeVisible();
  const outcomes = [
    await alice.getByTestId('result').getAttribute('data-outcome'),
    await bob.getByTestId('result').getAttribute('data-outcome'),
  ].sort();
  expect(outcomes).toEqual(['lose', 'win']);

  // Rematch: both accept, a new game starts with the seats swapped.
  await alice.getByTestId('rematch').click();
  await expect(bob.getByTestId('result')).toContainText('Alice');
  await bob.getByTestId('rematch').click();
  await expect.poll(async () => (await view(alice))?.gameId).not.toBe(first?.gameId);
  const second = await view(alice);
  expect(second?.you.seat).not.toBe(first?.you.seat);
  await expect(alice.getByTestId('composer')).toBeVisible();

  // Back to the lobby after resigning the rematch.
  await playTurn(await whoseTurn([alice, bob]), 1);
  await alice.getByTestId('resign').click();
  await alice.getByTestId('resign-confirm').click();
  await expect(alice.getByTestId('result')).toHaveAttribute('data-outcome', 'lose');
  await expect(bob.getByTestId('result')).toHaveAttribute('data-outcome', 'win');
  await alice.getByTestId('lobby').click();
  await expect(alice.getByTestId('home')).toBeVisible();
  await expectClean(alice, bob);
});

test('a player who loses the connection comes back to the same game', async ({ browser }) => {
  // Bob's network: every connection goes through here, so it can be cut and restored.
  let offline = false;
  const open: WebSocketRoute[] = [];
  const alice = await newPlayer(browser, 'Alice');
  const bob = await newPlayer(browser, 'Bob', (page) =>
    page.routeWebSocket(/\/socket\.io\//, (ws) => {
      if (offline) {
        void ws.close();
        return;
      }
      const server = ws.connectToServer();
      open.push(ws, server);
    }),
  );
  await privateGame(alice, bob);
  await playTurn(await whoseTurn([alice, bob]), 0);

  offline = true;
  await Promise.all(open.splice(0).map((ws) => ws.close().catch(() => undefined)));
  // Bob sees that he is reconnecting; Alice sees him away, with the time he has left.
  await expect(bob.getByTestId('banner')).toBeVisible();
  await expect(alice.getByTestId('away')).toBeVisible();

  offline = false;
  await expect(bob.getByTestId('banner')).toBeHidden({ timeout: 20_000 });
  await expect(alice.getByTestId('away')).toBeHidden();

  // A reload (or a closed and reopened tab) lands in the same game too.
  const before = await view(bob);
  await bob.reload();
  await expect(bob.getByTestId('game')).toBeVisible();
  expect((await view(bob))?.gameId).toBe(before?.gameId);

  // The game goes on where it was.
  const turns = await playUntilOver([alice, bob]);
  expect(turns).toBeGreaterThan(0);
  await expect(alice.getByTestId('result')).toBeVisible();
  await expectClean(alice, bob);
});
