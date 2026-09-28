import { AiPool, devWorkerUrl } from '@cardauction/ai/pool';
import { SearchAi } from './ai.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createGameServer } from './server.js';

const config = loadConfig();
const logger = createLogger(config.logLevel, config.commit);

// An exception outside any game is a bug in the server itself: log it and exit, and Render
// restarts the process. Exceptions inside a game are caught and end only that game.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  logger.fatal({ err: error }, 'unhandled rejection');
  process.exit(1);
});

// The AI thinks on worker threads. The bundled server ships its worker as dist/ai-worker.js;
// run from the sources (pnpm dev), the worker loads the TypeScript through tsx.
const bundled = import.meta.url.endsWith('.js');
const pool =
  config.aiThreads > 0
    ? new AiPool({
        threads: config.aiThreads,
        workerUrl: bundled ? new URL('./ai-worker.js', import.meta.url) : devWorkerUrl(),
        maxThinkMs: config.aiMaxThinkMs,
      })
    : undefined;
const server = createGameServer({
  config,
  logger,
  ai: new SearchAi({ pool, logger }),
  ...(pool ? { aiStats: () => pool.stats() } : {}),
});
const port = await server.listen(config.port, config.host);
logger.info(
  {
    port,
    store: config.stateStore,
    maxGames: config.maxGames,
    maxAiGames: config.maxAiGames,
    aiThreads: config.aiThreads,
    origins: config.corsOrigins,
  },
  'CardAuction server listening',
);

let stopping = false;
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('shutdown took too long: exiting');
    process.exit(1);
  }, 15_000).unref();
  server
    .close(`server stopped (${signal})`)
    .then(() => pool?.close())
    .then(
      () => {
        logger.info('stopped');
        process.exit(0);
      },
      (error: unknown) => {
        logger.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
