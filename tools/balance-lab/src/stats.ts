import type { GameRecord } from './play.js';

/** Wilson score interval for a proportion, 95% by default. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
function phi(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Two-sided p-value that a win rate differs from one half (normal approximation, continuity corrected). */
export function pValue(successes: number, n: number): number {
  if (n === 0) return 1;
  const deviation = Math.max(0, Math.abs(successes - n / 2) - 0.5);
  const z = deviation / Math.sqrt(n / 4);
  return Math.min(1, 2 * (1 - phi(z)));
}

export interface Summary {
  readonly games: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  readonly interval: [number, number];
  readonly p: number;
  /** Deals where the same player won with both seats. */
  readonly sweepsA: number;
  readonly sweepsB: number;
  readonly winsP1: number;
  readonly bidsMean: number;
  readonly bidsMin: number;
  readonly bidsMax: number;
  readonly reasons: Readonly<Record<string, number>>;
  readonly exchanges: number;
  readonly openings: number;
  readonly firstBidTableAction: number;
  readonly actionBids: number;
  readonly totalBids: number;
  readonly dryBids: number;
  readonly tableEmptyAtEnd: number;
  readonly msPerMoveA: number;
  readonly msPerMoveB: number;
  readonly maxThinkMs: number;
}

export function summarize(records: readonly GameRecord[]): Summary {
  const games = records.length;
  const winsA = records.filter((r) => r.winner === 'A').length;
  const winsB = records.filter((r) => r.winner === 'B').length;
  const byDeal = new Map<number, string[]>();
  for (const r of records) byDeal.set(r.deal, [...(byDeal.get(r.deal) ?? []), r.winner]);
  let sweepsA = 0;
  let sweepsB = 0;
  for (const winners of byDeal.values()) {
    if (winners.length === 2 && winners.every((w) => w === 'A')) sweepsA++;
    if (winners.length === 2 && winners.every((w) => w === 'B')) sweepsB++;
  }
  const reasons: Record<string, number> = {};
  for (const r of records) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const sum = (f: (r: GameRecord) => number): number => records.reduce((s, r) => s + f(r), 0);
  // Folds rather than Math.min(...list), which fails past about 100,000 arguments.
  const least = (f: (r: GameRecord) => number): number =>
    records.reduce((m, r) => Math.min(m, f(r)), Infinity);
  const most = (f: (r: GameRecord) => number): number =>
    records.reduce((m, r) => Math.max(m, f(r)), -Infinity);
  const decided = winsA + winsB;
  return {
    games,
    winsA,
    winsB,
    draws: games - decided,
    interval: wilson(winsA, decided),
    p: pValue(winsA, decided),
    sweepsA,
    sweepsB,
    winsP1: records.filter((r) => r.winnerSeat === 0).length,
    bidsMean: games ? sum((r) => r.bids) / games : 0,
    bidsMin: games ? least((r) => r.bids) : 0,
    bidsMax: games ? most((r) => r.bids) : 0,
    reasons,
    exchanges: records.filter((r) => r.opening === 'exchange').length,
    openings: records.filter((r) => r.opening !== '').length,
    firstBidTableAction: records.filter((r) => r.firstBidTableAction).length,
    actionBids: sum((r) => r.actionBids),
    totalBids: sum((r) => r.bids),
    dryBids: sum((r) => r.dryBids),
    tableEmptyAtEnd: records.filter((r) => r.tableEmptyAtEnd).length,
    msPerMoveA:
      sum((r) => r.thinkMsA) /
      Math.max(
        1,
        sum((r) => r.movesA),
      ),
    msPerMoveB:
      sum((r) => r.thinkMsB) /
      Math.max(
        1,
        sum((r) => r.movesB),
      ),
    maxThinkMs: Math.max(
      0,
      most((r) => r.maxThinkMs),
    ),
  };
}

const percent = (x: number, n: number): string => (n ? `${((100 * x) / n).toFixed(1)}%` : '—');

export function report(summary: Summary, a: string, b: string, rulesLabel: string): string {
  const s = summary;
  const decided = s.winsA + s.winsB;
  const [low, high] = s.interval;
  const verdict =
    s.p < 0.05
      ? `${s.winsA > s.winsB ? a : b} is stronger (p = ${s.p < 0.001 ? '< 0.001' : s.p.toFixed(3)})`
      : `no clear difference (p = ${s.p.toFixed(2)})`;
  const reasons = Object.entries(s.reasons)
    .sort((x, y) => y[1] - x[1])
    .map(([reason, n]) => `${reason} ${percent(n, s.games)}`)
    .join(', ');
  return [
    `${a} vs ${b}: ${s.games} games (${s.games / 2} deals, both seats), ${rulesLabel}`,
    `  ${a} wins ${percent(s.winsA, decided)} (${s.winsA} of ${decided}), 95% CI ${(100 * low).toFixed(1)}–${(100 * high).toFixed(1)}%: ${verdict}`,
    `  deals won with both seats: ${a} ${s.sweepsA}, ${b} ${s.sweepsB}`,
    `  P1 wins ${percent(s.winsP1, decided)}; bids per game ${s.bidsMean.toFixed(1)} (${s.bidsMin}–${s.bidsMax})`,
    `  end: ${reasons}`,
    s.openings > 0
      ? `  P2 exchanged in ${percent(s.exchanges, s.openings)} of games; first bid with the table's action card in ${percent(s.firstBidTableAction, s.games)}`
      : `  no exchange (rule variant); first bid with the table's action card in ${percent(s.firstBidTableAction, s.games)}`,
    `  action cards in ${percent(s.actionBids, s.totalBids)} of bids; ${percent(s.dryBids, s.totalBids)} of bids after the table ran dry; table empty at the end of ${percent(s.tableEmptyAtEnd, s.games)} of games`,
    `  think time per move: ${a} ${s.msPerMoveA.toFixed(0)} ms, ${b} ${s.msPerMoveB.toFixed(0)} ms (longest ${s.maxThinkMs.toFixed(0)} ms)`,
  ].join('\n');
}

const CSV_COLUMNS = [
  'deal',
  'aSeat',
  'winner',
  'winnerSeat',
  'reason',
  'bids',
  'opening',
  'firstBidTableAction',
  'actionBids',
  'dryBids',
  'tableEmptyAtEnd',
  'thinkMsA',
  'movesA',
  'thinkMsB',
  'movesB',
] as const;

export function toCsv(records: readonly GameRecord[], a: string, b: string, rules: string): string {
  const header = ['a', 'b', 'rules', ...CSV_COLUMNS].join(',');
  const rows = records.map((r) =>
    [
      a,
      b,
      `"${rules}"`,
      ...CSV_COLUMNS.map((c) => {
        const value = r[c];
        return typeof value === 'number' && !Number.isInteger(value)
          ? value.toFixed(1)
          : String(value ?? '');
      }),
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}
