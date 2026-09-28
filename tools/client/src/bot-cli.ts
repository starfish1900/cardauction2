/**
 * Runs bots that play random legal moves against a server.
 *
 *   pnpm bot --server http://localhost:3000 --bots 10 --games 5
 *   pnpm bot --ai easy --games 3             each bot plays the server's AI
 *   pnpm bot --join K7M2QX                   one bot joins a private game (play the other side)
 */
import { parseArgs } from 'node:util';
import { AI_LEVELS, type AiLevel } from '@cardauction/protocol';
import { runBot, type BotMode } from './bot.js';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:3000' },
    bots: { type: 'string', default: '2' },
    games: { type: 'string', default: '1' },
    delay: { type: 'string', default: '300' },
    ai: { type: 'string' },
    join: { type: 'string' },
  },
});

const level = values.ai as AiLevel | undefined;
if (level !== undefined && !AI_LEVELS.includes(level))
  throw new Error(`--ai must be one of ${AI_LEVELS.join(', ')}`);
const mode: BotMode = values.join
  ? { kind: 'join', code: values.join }
  : level
    ? { kind: 'ai', level }
    : { kind: 'quick' };
const count = values.join ? 1 : Number(values.bots);

const runs = await Promise.allSettled(
  Array.from({ length: count }, (_, i) =>
    runBot({
      url: values.server,
      nickname: `Bot ${i + 1}`,
      mode,
      games: Number(values.games),
      moveDelayMs: Number(values.delay),
      log: (line) => console.log(line),
    }),
  ),
);
const failures = runs.filter((run) => run.status === 'rejected');
for (const failure of failures) console.error(String(failure.reason));
console.log(`${count - failures.length}/${count} bots finished.`);
process.exitCode = failures.length > 0 ? 1 : 0;
