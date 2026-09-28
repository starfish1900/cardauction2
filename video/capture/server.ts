/**
 * A local game server for the screenshots: the real server, with reproducible deals and an AI
 * that answers quickly. Run from the video folder with the server's tsx:
 *
 *   ../apps/server/node_modules/.bin/tsx capture/server.ts
 */
import { newGame, seededRng } from '../../packages/engine/src/index.ts';
import { SearchAi } from '../../apps/server/src/ai.ts';
import { loadConfig } from '../../apps/server/src/config.ts';
import { createGameServer } from '../../apps/server/src/server.ts';

const port = Number(process.env.PORT ?? 3100);
let seed = Number(process.env.DEAL_SEED ?? 11);
const server = createGameServer({
  config: loadConfig({
    NODE_ENV: 'test',
    PORT: String(port),
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:4173',
    LOG_LEVEL: 'warn',
    AI_THREADS: '0',
  }),
  deal: () => newGame(seededRng(seed++)),
  random: seededRng(5),
  ai: new SearchAi({ minMoveMs: [500, 700] }),
});
await server.listen(port, '127.0.0.1');
console.log(`capture server on ${port}`);
