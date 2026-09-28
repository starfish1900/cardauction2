/**
 * Soak test for a running server: bots play it for a long time. They play quick matches, private
 * games and games against the AI at every level, and now and then one loses its connection and
 * comes back, sometimes too late (a forfeit). With the metrics token it reads /metrics every
 * 30 s. At the end it checks that games, players, sockets and timers are back to zero and
 * compares the heap at the start and at the end: a server that runs for weeks must not grow.
 *
 *   pnpm soak --minutes 60 --metrics-token <token>        local server on port 3000
 *   pnpm soak --server <url> --quick 10 --ai 2 --minutes 20
 *
 * Every bot comes from this machine, so the server needs MAX_CONNECTIONS_PER_IP above the number
 * of bots. Exits with 1 when something did not settle or a bot met an unexpected error.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cryptoRng, randomMove } from '@cardauction/engine';
import { AI_LEVELS, stateFromView, type GameUpdate, type WireView } from '@cardauction/protocol';
import { openSession, request, sendMove, type Session } from './connection.js';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:3000' },
    minutes: { type: 'string', default: '60' },
    quick: { type: 'string', default: '20' },
    private: { type: 'string', default: '2' },
    ai: { type: 'string', default: '4' },
    drop: { type: 'string', default: '0.02' },
    'metrics-token': { type: 'string' },
    csv: { type: 'string' },
  },
});
const url = values.server.replace(/\/$/u, '');
const until = Date.now() + Number(values.minutes) * 60_000;
const dropRate = Number(values.drop);
const moves = cryptoRng();
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const between = (low: number, high: number): number =>
  low + Math.floor(Math.random() * (high - low));

const tally = {
  games: 0,
  drops: 0,
  errors: 0,
  /** Requests the server refused under its per-address limits: every bot shares one address. */
  limited: 0,
  ends: {} as Record<string, number>,
  /** Errors by kind (ids and numbers blanked), so no kind hides behind another. */
  kinds: {} as Record<string, number>,
};

function failed(who: string, error: unknown): void {
  tally.errors++;
  const message = error instanceof Error ? error.message : String(error);
  const kind = `${who.replace(/ \d+$/u, '')}: ${message.replace(/\b[\w-]{17}\b|\d+/gu, '#')}`;
  tally.kinds[kind] = (tally.kinds[kind] ?? 0) + 1;
}

/** A refusal the soak expects: the bot waits and tries again, without counting an error. */
class Refused extends Error {}

class Player {
  private session: Session | null = null;
  constructor(readonly name: string) {}

  get socket(): Session['socket'] {
    if (!this.session) throw new Error(`${this.name} is not connected`);
    return this.session.socket;
  }

  get welcome(): Session['welcome'] | undefined {
    return this.session?.welcome;
  }

  /** Connects, or comes back with the same guest token after a drop. */
  async connect(): Promise<void> {
    this.session = await openSession(url, {
      nickname: this.name,
      build: 'soak',
      token: this.session?.token ?? null,
    });
  }

  disconnect(): void {
    this.session?.socket.disconnect();
  }

  /** The next game created for this player, or null after `timeoutMs`. */
  nextMatch(timeoutMs: number): Promise<{ gameId: string } | null> {
    const socket = this.socket;
    return new Promise((resolve) => {
      const onMatched = (payload: { gameId: string }): void => {
        clearTimeout(timer);
        resolve(payload);
      };
      const timer = setTimeout(() => {
        socket.off('lobby.matched', onMatched);
        resolve(null);
      }, timeoutMs);
      socket.once('lobby.matched', onMatched);
    });
  }
}

/** Plays until the game ends or this player decides to drop; returns how it ended, or 'drop'. */
function playConnected(player: Player, gameId: string): Promise<string> {
  const socket = player.socket;
  return new Promise((resolve, reject) => {
    let latest: WireView | null = null;
    let busy = false;
    let readySent = false;
    const timer = setTimeout(() => done(new Error(`game ${gameId} took too long`)), 10 * 60_000);
    const done = (outcome: string | Error): void => {
      clearTimeout(timer);
      socket.off('game.update', onUpdate);
      socket.off('game.cancelled', onCancelled);
      socket.off('disconnect', onDisconnect);
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const act = async (): Promise<void> => {
      const view = latest;
      if (busy || !view) return;
      if (view.status === 'over') {
        done(view.result?.reason ?? 'over');
        return;
      }
      if (view.status === 'starting') {
        if (!readySent) {
          readySent = true;
          await request(socket, 'game.ready', { gameId, version: view.version });
        }
        return;
      }
      if (view.toMove !== view.you.seat) return;
      busy = true;
      try {
        await sleep(between(100, 800));
        if (Math.random() < dropRate) {
          done('drop');
          return;
        }
        const current = latest ?? view;
        const reply = await sendMove(socket, current, randomMove(stateFromView(current), moves));
        if (!reply.ok) {
          if (reply.code === 'STALE' && reply.view) latest = reply.view;
          else if (reply.code !== 'GAME_OVER' && reply.code !== 'RATE_LIMITED') {
            throw new Error(`move refused: ${reply.code}`);
          }
        }
      } finally {
        busy = false;
      }
      await act();
    };
    const onUpdate = (update: GameUpdate): void => {
      if (update.gameId !== gameId) return;
      if (!latest || update.view.version >= latest.version) latest = update.view;
      act().catch((error: unknown) =>
        done(error instanceof Error ? error : new Error(String(error))),
      );
    };
    const onCancelled = (payload: { gameId: string; reason: string }): void => {
      if (payload.gameId === gameId) done(`cancelled (${payload.reason})`);
    };
    const onDisconnect = (reason: string): void => done(new Error(`connection lost (${reason})`));
    socket.on('game.update', onUpdate);
    socket.on('game.cancelled', onCancelled);
    socket.on('disconnect', onDisconnect);
    request(socket, 'game.sync', { gameId })
      .then((reply) => {
        if (reply.ok) onUpdate(reply.update);
        else done(`gone (${reply.code})`);
      })
      .catch((error: unknown) => done(error instanceof Error ? error : new Error(String(error))));
  });
}

/** Plays one game to its end, dropping and coming back as chance decides, then leaves it. */
async function finish(player: Player, gameId: string): Promise<void> {
  let end = 'drop';
  while (end === 'drop') {
    end = await playConnected(player, gameId);
    if (end !== 'drop') break;
    tally.drops++;
    player.disconnect();
    // Back within the 25 s grace most of the time; otherwise the game is forfeited meanwhile.
    await sleep(between(2_000, 40_000));
    await player.connect();
    const welcome = player.welcome;
    if (welcome?.activeGameId !== gameId) end = welcome?.endedGame ? 'ended while away' : 'gone';
  }
  tally.games++;
  tally.ends[end] = (tally.ends[end] ?? 0) + 1;
  await request(player.socket, 'game.leave', { gameId }).catch(() => undefined);
}

async function quickLane(n: number): Promise<void> {
  const player = new Player(`Quick ${n}`);
  await player.connect();
  while (Date.now() < until) {
    try {
      const matched = player.nextMatch(60_000);
      const joined = await request(player.socket, 'lobby.quick.join', {});
      if (!joined.ok) throw new Error(`quick join refused: ${joined.code}`);
      const match = await matched;
      if (!match) {
        await request(player.socket, 'lobby.quick.leave', {});
        continue;
      }
      await finish(player, match.gameId);
    } catch (error) {
      failed(player.name, error);
      await sleep(2_000);
    }
  }
  player.disconnect();
}

async function aiLane(n: number): Promise<void> {
  const player = new Player(`Versus AI ${n}`);
  const level = AI_LEVELS[n % AI_LEVELS.length] ?? 'easy';
  await player.connect();
  while (Date.now() < until) {
    try {
      const matched = player.nextMatch(30_000);
      const started = await request(player.socket, 'lobby.ai.start', { level, seat: 'random' });
      if (!started.ok) {
        // The AI's cap is shared with the other lanes: wait for a slot.
        if (started.code === 'SERVER_BUSY') {
          await sleep(2_000);
          continue;
        }
        throw new Error(`AI start refused: ${started.code}`);
      }
      await matched;
      await finish(player, started.gameId);
    } catch (error) {
      failed(player.name, error);
      await sleep(2_000);
    }
  }
  player.disconnect();
}

async function privatePair(n: number): Promise<void> {
  const host = new Player(`Host ${n}`);
  const guest = new Player(`Guest ${n}`);
  await Promise.all([host.connect(), guest.connect()]);
  while (Date.now() < until) {
    try {
      const hostMatched = host.nextMatch(30_000);
      const guestMatched = guest.nextMatch(30_000);
      const created = await request(host.socket, 'lobby.private.create', {});
      if (!created.ok && created.code === 'RATE_LIMITED') throw new Refused();
      if (!created.ok) throw new Error(`private create refused: ${created.code}`);
      const joined = await request(guest.socket, 'lobby.private.join', { code: created.code });
      if (!joined.ok && joined.code === 'RATE_LIMITED') throw new Refused();
      if (!joined.ok) throw new Error(`private join refused: ${joined.code}`);
      const [a, b] = await Promise.all([hostMatched, guestMatched]);
      if (!a || !b) throw new Error('the private game did not start');
      await Promise.all([finish(host, a.gameId), finish(guest, b.gameId)]);
    } catch (error) {
      if (error instanceof Refused) tally.limited++;
      else failed(host.name, error);
      await request(host.socket, 'lobby.private.cancel', {}).catch(() => undefined);
      await sleep(error instanceof Refused ? 6_000 : 2_000);
    }
  }
  host.disconnect();
  guest.disconnect();
}

interface Sample {
  readonly minute: number;
  readonly heapMB: number;
  readonly rssMB: number;
  readonly games: number;
  readonly players: number;
  readonly sockets: number;
  readonly timers: number;
  readonly queue: number;
  readonly privateCodes: number;
  readonly loopP99: number;
  readonly aiSearches: number;
  readonly aiFailed: number;
}

const started = Date.now();
const samples: Sample[] = [];

async function sample(): Promise<Sample | null> {
  const token = values['metrics-token'];
  if (!token) return null;
  const response = await fetch(`${url}/metrics`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`/metrics answered HTTP ${response.status}`);
  const m = (await response.json()) as {
    games: Record<string, number>;
    players: number;
    sockets: number;
    timers: number;
    queue: number;
    privateCodes: number;
    heapMB: number;
    rssMB: number;
    eventLoopMs: { p99: number };
    ai?: { searches: number; failed: number };
  };
  const games = (m.games.starting ?? 0) + (m.games.playing ?? 0) + (m.games.over ?? 0);
  const s: Sample = {
    minute: Math.round((Date.now() - started) / 600) / 100,
    heapMB: m.heapMB,
    rssMB: m.rssMB,
    games,
    players: m.players,
    sockets: m.sockets,
    timers: m.timers,
    queue: m.queue,
    privateCodes: m.privateCodes,
    loopP99: m.eventLoopMs.p99,
    aiSearches: m.ai?.searches ?? 0,
    aiFailed: m.ai?.failed ?? 0,
  };
  samples.push(s);
  return s;
}

function progress(s: Sample | null): void {
  const minutes = ((Date.now() - started) / 60_000).toFixed(0);
  const server = s
    ? `, server: ${s.games} games, ${s.players} players, heap ${s.heapMB} MB, rss ${s.rssMB} MB, loop p99 ${s.loopP99} ms, ${s.aiSearches} AI searches`
    : '';
  console.log(
    `  ${minutes.padStart(3)} min: ${tally.games} games played, ${tally.drops} drops, ${tally.limited} rate-limited, ${tally.errors} errors${server}`,
  );
  for (const [kind, count] of Object.entries(tally.kinds))
    console.log(`         ×${count}: ${kind}`);
}

console.log(`Soak test against ${url} for ${values.minutes} min`);
const sampler = setInterval(() => {
  sample()
    .then((s) => {
      if (samples.length % 10 === 1 || !s) progress(s);
    })
    .catch((error: unknown) => failed('metrics', error));
}, 30_000);
const lanes = [
  ...Array.from({ length: Number(values.quick) }, (_, i) => quickLane(i + 1)),
  ...Array.from({ length: Number(values.private) }, (_, i) => privatePair(i + 1)),
  ...Array.from({ length: Number(values.ai) }, (_, i) => aiLane(i)),
];
await Promise.all(lanes.map((lane) => lane.catch((error: unknown) => failed('lane', error))));
clearInterval(sampler);
console.log(
  `Bots done: ${tally.games} games, ${tally.drops} drops, ${tally.limited} rate-limited, ${tally.errors} errors`,
);
console.log(`  how games ended: ${JSON.stringify(tally.ends)}`);
for (const [kind, count] of Object.entries(tally.kinds)) console.log(`  error ×${count}: ${kind}`);

let ok = tally.errors === 0;
if (values['metrics-token']) {
  // Everyone left: within the reconnection grace and the result screen's linger, nothing remains.
  let last: Sample | null = null;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    last = await sample();
    if (last && last.games + last.players + last.sockets + last.timers + last.queue === 0) break;
    await sleep(5_000);
  }
  const settled =
    last !== null && last.games + last.players + last.sockets + last.timers + last.queue === 0;
  console.log(`  after the bots left: ${JSON.stringify(last)}`);
  ok &&= settled && (last?.aiFailed ?? 0) === 0;
  // The heap's low points (after collections) early and late in the run.
  const low = (from: number, to: number): number =>
    Math.min(...samples.filter((s) => s.minute >= from && s.minute < to).map((s) => s.heapMB));
  const total = Number(values.minutes);
  const early = low(total * 0.1, total * 0.3);
  const late = low(total * 0.7, total * 0.9);
  console.log(`  heap low point: ${early} MB early in the run, ${late} MB late in the run`);
  console.log(
    settled ? '  settled: nothing left behind' : '  NOT settled: something was left behind',
  );
  if (values.csv) {
    const header = Object.keys(samples[0] ?? {}).join(',');
    const rows = samples.map((s) => Object.values(s).join(','));
    writeFileSync(values.csv, [header, ...rows].join('\n') + '\n');
    console.log(`  samples written to ${values.csv}`);
  }
}
console.log(ok ? 'Soak test passed' : 'Soak test FAILED');
process.exit(ok ? 0 : 1);
