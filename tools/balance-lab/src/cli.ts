/**
 * The balance lab: tournaments between two players on the same deals, each deal played twice
 * with the seats swapped, on every core. It reports who is stronger (with a confidence interval),
 * P1's win rate, game length, how games end, how often P2 exchanges, action cards, and the table
 * running dry: data for tuning the AI and the rules themselves. It runs on your own machine.
 *
 *   pnpm lab --a hard --b medium --deals 200
 *   pnpm lab --a medium --b medium --deals 500 --rules exchange=false
 *   pnpm lab --a random --b random --deals 20000 --rules distinctSuits=true --csv games.csv
 *
 * Players: random, easy, medium, hard, or search:<iterations>[:c=<exploration>][:eps=<playout
 * randomness>][:random=<share of random moves>][:tw=<takes per bid in the tree, 0 for all>].
 * Rules: comma-separated changes to the standard rules (exchange, firstBidTableCard,
 * distinctSuits, handSize, tableSize).
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { RuleSet, Seat } from '@cardauction/engine';
import { parsePlayer, parseRules, playGame, type GameRecord, type PlayerSpec } from './play.js';
import { report, summarize, toCsv } from './stats.js';

interface Job {
  readonly games: readonly { readonly deal: number; readonly aSeat: Seat }[];
  readonly a: PlayerSpec;
  readonly b: PlayerSpec;
  readonly rules: RuleSet | undefined;
}

// A child process of the lab: play the games it is sent, report each one as soon as it ends.
if (process.env.CARDAUCTION_LAB_CHILD === '1') {
  process.once('message', (job: Job) => {
    void (async () => {
      for (const game of job.games) {
        const record = playGame(game.deal, game.aSeat, job.a, job.b, job.rules);
        await new Promise<void>((resolve) =>
          process.send?.(record, undefined, {}, () => resolve()),
        );
      }
      process.exit(0);
    })();
  });
} else {
  await main();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      a: { type: 'string', default: 'medium' },
      b: { type: 'string', default: 'easy' },
      deals: { type: 'string', default: '100' },
      seed: { type: 'string', default: '1' },
      rules: { type: 'string' },
      threads: { type: 'string' },
      csv: { type: 'string' },
      quiet: { type: 'boolean', default: false },
    },
  });

  const a = parsePlayer(values.a);
  const b = parsePlayer(values.b);
  const rules = parseRules(values.rules);
  const deals = Number(values.deals);
  const seed = Number(values.seed);
  const threads = Math.max(
    1,
    Math.min(Number(values.threads ?? availableParallelism()), deals * 2),
  );
  if (!Number.isInteger(deals) || deals < 1) throw new Error('--deals is a positive whole number');

  const games: { deal: number; aSeat: Seat }[] = [];
  for (let d = 0; d < deals; d++) {
    games.push({ deal: seed + d, aSeat: 0 }, { deal: seed + d, aSeat: 1 });
  }

  const started = performance.now();
  const records: GameRecord[] = [];
  let lastShown = 0;
  await Promise.all(
    Array.from({ length: threads }, (_, t) => {
      const share = games.filter((_, i) => i % threads === t);
      return new Promise<void>((resolve, reject) => {
        // One process per core, each running this same script (and so the same tsx loader).
        const child = fork(fileURLToPath(import.meta.url), [], {
          env: { ...process.env, CARDAUCTION_LAB_CHILD: '1' },
        });
        child.send({ games: share, a, b, rules } satisfies Job);
        child.on('message', (message) => {
          const record = message as GameRecord;
          records.push(record);
          const done = Math.floor((20 * records.length) / games.length);
          if (!values.quiet && done > lastShown) {
            lastShown = done;
            process.stderr.write(`\r  ${records.length}/${games.length} games`);
          }
        });
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(`a lab process stopped with code ${code}`)),
        );
      });
    }),
  );
  if (!values.quiet) process.stderr.write('\n');

  records.sort((x, y) => x.deal - y.deal || x.aSeat - y.aSeat);
  const rulesLabel = values.rules ? `rules ${values.rules}` : 'standard rules';
  console.log(report(summarize(records), a.name, b.name, rulesLabel));
  console.log(`  ${((performance.now() - started) / 1000).toFixed(1)} s on ${threads} thread(s)`);
  if (values.csv) {
    writeFileSync(values.csv, toCsv(records, a.name, b.name, values.rules ?? 'standard'));
    console.log(`  games written to ${values.csv}`);
  }
}
