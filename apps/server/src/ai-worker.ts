// The AI worker thread's entry, bundled next to main.js (dist/ai-worker.js).
import { serveSearches } from '@cardauction/ai/worker';

serveSearches();
