/**
 * Random-play simulator: plays many complete games with uniformly random legal moves, checks
 * every invariant after every move, and reports statistics about the rules.
 *
 *   pnpm sim                         1,000,000 games on all CPU cores
 *   pnpm sim --games 20000 --seed 7  a smaller, reproducible run
 *   pnpm sim --games 1 --seed 4242   replay one game (the seed printed with any violation)
 */
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findViolations, playRandomGame, seededRng } from '../src/index.js';

const JOB_ENV = 'CARDAUCTION_SIM_JOB';

interface Stats {
  games: number;
  winsP1: number;
  winsP2: number;
  p1CouldNotOpen: number;
  bids: number;
  minBids: number;
  maxBids: number;
  histogram: number[];
  exchanges: number;
  firstBidTableAction: number;
  actionPlays: number;
  bidsWithoutTake: number;
  moves: number;
  violation: { seed: number; problems: string[] } | null;
}

function emptyStats(): Stats {
  return {
    games: 0,
    winsP1: 0,
    winsP2: 0,
    p1CouldNotOpen: 0,
    bids: 0,
    minBids: Number.POSITIVE_INFINITY,
    maxBids: 0,
    histogram: Array.from({ length: 26 }, () => 0),
    exchanges: 0,
    firstBidTableAction: 0,
    actionPlays: 0,
    bidsWithoutTake: 0,
    moves: 0,
    violation: null,
  };
}

function runRange(firstSeed: number, count: number, check: boolean): Stats {
  const stats = emptyStats();
  for (let seed = firstSeed; seed < firstSeed + count; seed++) {
    let violation: string[] | null = null;
    const final = playRandomGame(seededRng(seed), (before, move, after) => {
      stats.moves += 1;
      if (move.type === 'exchange') stats.exchanges += 1;
      if (move.type === 'bid') {
        if (move.action) stats.actionPlays += 1;
        if (move.take === undefined) stats.bidsWithoutTake += 1;
        if (before.phase === 'firstBid' && move.action && before.table.includes(move.action.card)) {
          stats.firstBidTableAction += 1;
        }
      }
      if (check && violation === null) {
        const problems = findViolations(after);
        if (problems.length > 0) violation = problems;
      }
    });
    if (violation !== null && stats.violation === null)
      stats.violation = { seed, problems: violation };
    const bids = final.bidCount[0] + final.bidCount[1];
    stats.games += 1;
    stats.bids += bids;
    stats.minBids = Math.min(stats.minBids, bids);
    stats.maxBids = Math.max(stats.maxBids, bids);
    stats.histogram[bids] = (stats.histogram[bids] ?? 0) + 1;
    if (final.result?.winner === 0) stats.winsP1 += 1;
    if (final.result?.winner === 1) stats.winsP2 += 1;
    if (bids === 0) stats.p1CouldNotOpen += 1;
  }
  return stats;
}

function merge(parts: Stats[]): Stats {
  const total = emptyStats();
  for (const part of parts) {
    total.games += part.games;
    total.winsP1 += part.winsP1;
    total.winsP2 += part.winsP2;
    total.p1CouldNotOpen += part.p1CouldNotOpen;
    total.bids += part.bids;
    total.minBids = Math.min(total.minBids, part.minBids);
    total.maxBids = Math.max(total.maxBids, part.maxBids);
    part.histogram.forEach((n, i) => (total.histogram[i] = (total.histogram[i] ?? 0) + n));
    total.exchanges += part.exchanges;
    total.firstBidTableAction += part.firstBidTableAction;
    total.actionPlays += part.actionPlays;
    total.bidsWithoutTake += part.bidsWithoutTake;
    total.moves += part.moves;
    if (!total.violation && part.violation) total.violation = part.violation;
  }
  return total;
}

const pct = (n: number, d: number): string => `${((100 * n) / Math.max(d, 1)).toFixed(2)}%`;
const int = (n: number): string => n.toLocaleString('en-US');

function report(
  stats: Stats,
  seconds: number,
  firstSeed: number,
  workers: number,
  check: boolean,
): void {
  const lines = [
    'CardAuction random-play simulation',
    `  games                ${int(stats.games)} (seeds ${int(firstSeed)}–${int(firstSeed + stats.games - 1)}), ${workers} worker(s)`,
    `  invariants           ${check ? 'checked after every move' : 'not checked'}`,
    `  violations           ${stats.violation ? 'FOUND' : '0'}`,
    `  time                 ${seconds.toFixed(1)} s (${int(Math.round(stats.games / seconds))} games/s)`,
    `  P1 wins              ${pct(stats.winsP1, stats.games)}`,
    `  P2 wins              ${pct(stats.winsP2, stats.games)}`,
    `  P1 could not open    ${int(stats.p1CouldNotOpen)} games`,
    `  bids per game        mean ${(stats.bids / stats.games).toFixed(2)} · min ${stats.minBids} · max ${stats.maxBids}`,
    `  P2 exchanged         ${pct(stats.exchanges, stats.games)} of games`,
    `  first bid with the table's action card  ${pct(stats.firstBidTableAction, stats.games)} of games`,
    `  action cards played  ${pct(stats.actionPlays, stats.bids)} of bids`,
    `  bids with an empty table (no take)      ${int(stats.bidsWithoutTake)}`,
    '  bids per game (histogram)',
    ...stats.histogram
      .map((n, bids) => ({ n, bids }))
      .filter(({ n }) => n > 0)
      .map(
        ({ n, bids }) =>
          `    ${bids.toString().padStart(2)}  ${pct(n, stats.games).padStart(7)}  ${int(n)}`,
      ),
  ];
  console.log(lines.join('\n'));
  if (stats.violation) {
    console.error(`\nFirst violation, seed ${stats.violation.seed}:`);
    for (const problem of stats.violation.problems) console.error(`  - ${problem}`);
    console.error(`Replay with: pnpm sim --games 1 --seed ${stats.violation.seed}`);
  }
}

interface Job {
  firstSeed: number;
  count: number;
  check: boolean;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: '1000000' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(availableParallelism()) },
      'no-check': { type: 'boolean', default: false },
    },
  });
  const games = Number(values.games);
  const firstSeed = Number(values.seed);
  const check = !values['no-check'];
  if (!Number.isInteger(games) || games < 1 || !Number.isInteger(firstSeed)) {
    throw new Error('--games and --seed must be integers');
  }
  const workers = Math.max(1, Math.min(Number(values.workers) || 1, games));
  const started = performance.now();
  let stats: Stats;
  if (workers === 1) {
    stats = runRange(firstSeed, games, check);
  } else {
    const share = Math.ceil(games / workers);
    const jobs: Job[] = [];
    for (let i = 0; i < workers; i++) {
      const count = Math.min(share, games - i * share);
      if (count > 0) jobs.push({ firstSeed: firstSeed + i * share, count, check });
    }
    // Child processes rather than worker threads: they inherit the TypeScript loader reliably.
    const parts = await Promise.all(
      jobs.map(
        (job) =>
          new Promise<Stats>((resolve, reject) => {
            const child = fork(fileURLToPath(import.meta.url), [], {
              env: { ...process.env, [JOB_ENV]: JSON.stringify(job) },
              execArgv: process.execArgv,
            });
            child.once('message', (result) => resolve(result as Stats));
            child.once('error', reject);
            child.once('exit', (code) => {
              if (code !== 0) reject(new Error(`simulation worker exited with code ${code}`));
            });
          }),
      ),
    );
    stats = merge(parts);
  }
  report(stats, (performance.now() - started) / 1000, firstSeed, workers, check);
  if (stats.violation) process.exitCode = 1;
}

const jobText = process.env[JOB_ENV];
if (jobText) {
  const job = JSON.parse(jobText) as Job;
  const stats = runRange(job.firstSeed, job.count, job.check);
  process.send?.(stats, () => process.exit(0));
} else {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
