// A stand-in for the AI's worker thread, for the pool's tests: it answers every search at once
// with a pass, except that it crashes on a search of 777 iterations and never answers one of 778.
import process from 'node:process';
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (request) => {
  if (request.iterations === 777) process.exit(3);
  if (request.iterations === 778) return;
  parentPort.postMessage({
    id: request.id,
    ok: true,
    move: { type: 'pass' },
    iterations: request.iterations,
    elapsedMs: 1,
    winRate: null,
    random: false,
  });
});
parentPort.postMessage({ ready: true });
