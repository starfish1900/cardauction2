// The AI worker from the TypeScript sources (pnpm dev, tests): tsx compiles them on the fly.
// The bundled server uses its own entry instead (apps/server/src/ai-worker.ts).
import { register } from 'tsx/esm/api';

register();
const { serveSearches } = await import('./worker.ts');
serveSearches();
