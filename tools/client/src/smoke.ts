/**
 * Smoke test for a running server: checks /healthz, then two bots quick-match and play one whole
 * game of random legal moves. Exits with 0 when both saw the same result.
 *
 *   pnpm smoke                                          local server on port 3000
 *   pnpm smoke --server https://cardauction-server.onrender.com
 *
 * A free Render instance sleeps after 15 idle minutes, so the health check waits up to 2 minutes.
 */
import { parseArgs } from 'node:util';
import { runBot } from './bot.js';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:3000' },
    'wake-timeout': { type: 'string', default: '120' },
  },
});
const url = values.server.replace(/\/$/u, '');

async function waitForHealth(): Promise<object> {
  const deadline = Date.now() + Number(values['wake-timeout']) * 1000;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) return (await response.json()) as object;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${url}/healthz is not healthy (${last})`);
}

const started = Date.now();
console.log(`Smoke test against ${url}`);
const health = await waitForHealth();
console.log(`  health     ${JSON.stringify(health)}`);
const [a, b] = await Promise.all([
  runBot({ url, nickname: 'Smoke A', mode: { kind: 'quick' }, moveDelayMs: 20 }),
  runBot({ url, nickname: 'Smoke B', mode: { kind: 'quick' }, moveDelayMs: 20 }),
]);
const gameA = a[0];
const gameB = b[0];
if (!gameA || !gameB || gameA.gameId !== gameB.gameId)
  throw new Error('the bots did not play the same game');
if (JSON.stringify(gameA.result) !== JSON.stringify(gameB.result))
  throw new Error('the bots saw different results');
const winner = gameA.result.winner === null ? 'nobody' : gameA.result.winner;
console.log(
  `  game       ${gameA.gameId}: ${gameA.moves + gameB.moves} moves, ${winner} won (${gameA.result.reason})`,
);
console.log(`  passed in  ${((Date.now() - started) / 1000).toFixed(1)} s`);
