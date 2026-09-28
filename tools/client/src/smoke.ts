/**
 * Smoke test for a running server: checks /healthz, then two bots quick-match and play one whole
 * game of random legal moves, and a bot plays one game against the AI (Easy, which still runs a
 * real search on the AI's worker thread). Exits with 0 when all went well.
 *
 *   pnpm smoke                                          local server on port 3000
 *   pnpm smoke --server https://cardauction-server.onrender.com
 *   pnpm smoke --metrics-token <token>                  also check the AI threads in /metrics
 *
 * A free Render instance sleeps after 15 idle minutes, so the health check waits up to 2 minutes.
 */
import { parseArgs } from 'node:util';
import { runBot } from './bot.js';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:3000' },
    'wake-timeout': { type: 'string', default: '120' },
    'metrics-token': { type: 'string' },
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
const [vsAi] = await runBot({
  url,
  nickname: 'Smoke C',
  mode: { kind: 'ai', level: 'easy' },
  moveDelayMs: 20,
});
if (!vsAi) throw new Error('the game against the AI did not finish');
console.log(
  `  vs AI      ${vsAi.gameId}: ${vsAi.moves} moves by the bot, ${vsAi.result.winner ?? 'nobody'} won (${vsAi.result.reason})`,
);

// With the metrics token: the AI's moves must have come from its threads, not the fallback.
const token = values['metrics-token'];
if (token) {
  const response = await fetch(`${url}/metrics`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`/metrics answered HTTP ${response.status}`);
  const { ai } = (await response.json()) as {
    ai?: { threads: number; searches: number; failed: number; restarts: number; thinkMs: number };
  };
  if (!ai) throw new Error('/metrics has no AI figures: the AI runs without threads');
  if (ai.threads < 1 || ai.searches < 1 || ai.failed > 0 || ai.restarts > 0) {
    throw new Error(`the AI threads are unwell: ${JSON.stringify(ai)}`);
  }
  console.log(
    `  AI threads ${ai.threads}: ${ai.searches} searches, ${(ai.thinkMs / ai.searches).toFixed(0)} ms each`,
  );
}
console.log(`  passed in  ${((Date.now() - started) / 1000).toFixed(1)} s`);
