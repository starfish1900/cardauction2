import { randomInt } from 'node:crypto';
import type { Rng, Seat } from '@cardauction/engine';
import {
  PRIVATE_CODE_ALPHABET,
  PRIVATE_CODE_LENGTH,
  TIMING,
  type AiLevel,
  type ErrorCode,
  type Failure,
  type Reply,
} from '@cardauction/protocol';
import type { Clock, TimerHandle } from './clock.js';
import type { SeatSpec } from './games/game.js';
import type { Games } from './games/manager.js';
import { CODE_GUESS_RATE, KeyedBuckets } from './limits.js';
import type { Logger } from './logger.js';
import type { Players } from './players.js';

export interface LobbyDeps {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly players: Players;
  readonly games: Games;
  /** Seat draws. Production: cryptoRng(). */
  readonly random: Rng;
  /** Open private codes allowed in all (each holds a timer and a little memory). */
  readonly maxOpenCodes: number;
}

interface Waiting {
  readonly since: number;
  offer: TimerHandle | null;
}

interface PrivateCode {
  readonly code: string;
  readonly playerId: string;
  /** The creator's address, for the per-address cap. */
  readonly address: string;
  readonly expiresAt: number;
  readonly timer: TimerHandle;
  /** While the host is away: when the code is dropped. */
  hostAway: TimerHandle | null;
}

/** Open codes per address; creating codes is also limited to 10 a minute per address. */
const MAX_CODES_PER_ADDRESS = 3;

const fail = (code: ErrorCode): Failure => ({ ok: false, code });

const AI_NAMES: Record<AiLevel, string> = {
  easy: 'AI · Easy',
  medium: 'AI · Medium',
  hard: 'AI · Hard',
};

/**
 * Matchmaking: a first-in, first-out quick-match queue (the AI is offered after 30 s, never
 * swapped in silently), private games by code, and games against the AI.
 */
export class Lobby {
  private readonly queue: string[] = [];
  private readonly waiting = new Map<string, Waiting>();
  private readonly codes = new Map<string, PrivateCode>();
  private readonly codeOf = new Map<string, string>();
  private readonly codesPerAddress = new Map<string, number>();
  private readonly guesses: KeyedBuckets;
  private readonly creations: KeyedBuckets;

  constructor(private readonly deps: LobbyDeps) {
    const { capacity, perSecond } = CODE_GUESS_RATE;
    this.guesses = new KeyedBuckets(deps.clock, capacity, perSecond);
    this.creations = new KeyedBuckets(deps.clock, capacity, perSecond);
    deps.games.requeue = (playerId) => this.requeueFront(playerId);
  }

  /** No new games while set (shutdown, or an administrator draining the server). */
  get draining(): boolean {
    return this.deps.games.draining;
  }

  set draining(on: boolean) {
    this.deps.games.draining = on;
  }

  /** What the player is waiting for, so a new tab can show it. */
  status(playerId: string): {
    readonly queuedSince?: number;
    readonly privateCode?: { readonly code: string; readonly expiresAt: number };
  } {
    const waiting = this.waiting.get(playerId);
    const code = this.codeOf.get(playerId);
    const entry = code === undefined ? undefined : this.codes.get(code);
    return {
      ...(waiting ? { queuedSince: waiting.since } : {}),
      ...(entry ? { privateCode: { code: entry.code, expiresAt: entry.expiresAt } } : {}),
    };
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get openCodes(): number {
    return this.codes.size;
  }

  quickJoin(playerId: string): Reply<{ readonly since: number }> {
    const waiting = this.waiting.get(playerId);
    if (waiting) return { ok: true, since: waiting.since };
    const refused = this.canStart(playerId, false);
    if (refused) return fail(refused);
    this.deps.games.moveOn(playerId);
    this.cancelCode(playerId);
    const since = this.enqueue(playerId, false);
    this.match();
    return { ok: true, since };
  }

  quickLeave(playerId: string): Reply {
    this.dequeue(playerId);
    return { ok: true };
  }

  privateCreate(
    playerId: string,
    address: string,
  ): Reply<{ readonly code: string; readonly expiresAt: number }> {
    const refused = this.canStart(playerId, false);
    if (refused) return fail(refused);
    const { clock, games, players } = this.deps;
    this.cancelCode(playerId);
    if (this.codes.size >= this.deps.maxOpenCodes) return fail('SERVER_BUSY');
    if ((this.codesPerAddress.get(address) ?? 0) >= MAX_CODES_PER_ADDRESS)
      return fail('RATE_LIMITED');
    if (!this.creations.take(address)) return fail('RATE_LIMITED');
    games.moveOn(playerId);
    this.dequeue(playerId);
    let code = newCode();
    while (this.codes.has(code)) code = newCode();
    const expiresAt = clock.now() + TIMING.privateCodeMs;
    const timer = clock.setTimeout(() => {
      if (this.codes.get(code)?.playerId !== playerId) return;
      this.cancelCode(playerId);
      players.emit(playerId, 'lobby.private.expired', { code });
    }, TIMING.privateCodeMs);
    this.codes.set(code, { code, playerId, address, expiresAt, timer, hostAway: null });
    this.codeOf.set(playerId, code);
    this.codesPerAddress.set(address, (this.codesPerAddress.get(address) ?? 0) + 1);
    return { ok: true, code, expiresAt };
  }

  privateCancel(playerId: string): Reply {
    this.cancelCode(playerId);
    return { ok: true };
  }

  privateJoin(playerId: string, rawCode: string, ip: string): Reply<{ readonly gameId: string }> {
    if (!this.guesses.take(ip)) return fail('RATE_LIMITED');
    if (this.draining) return fail('DRAINING');
    const { games, players } = this.deps;
    const entry = this.codes.get(normalizeCode(rawCode));
    if (!entry) return fail('CODE_NOT_FOUND');
    if (entry.playerId === playerId) return fail('OWN_CODE');
    if (games.activeOf(playerId)) return fail('ALREADY_IN_GAME');
    const host = entry.playerId;
    if (!players.isConnected(host)) return fail('CODE_HOST_AWAY');
    if (games.activeOf(host)) {
      this.cancelCode(host);
      return fail('CODE_NOT_FOUND');
    }
    const busy = games.admit(false);
    if (busy) return fail(busy);
    this.cancelCode(host);
    this.cancelCode(playerId);
    this.dequeue(playerId);
    this.dequeue(host);
    games.moveOn(playerId);
    games.moveOn(host);
    const game = games.create('private', this.drawSeats(this.human(host), this.human(playerId)));
    return { ok: true, gameId: game.id };
  }

  aiStart(
    playerId: string,
    level: AiLevel,
    seat: 'P1' | 'P2' | 'random',
  ): Reply<{ readonly gameId: string }> {
    const refused = this.canStart(playerId, true);
    if (refused) return fail(refused);
    const { games } = this.deps;
    games.moveOn(playerId);
    this.dequeue(playerId);
    this.cancelCode(playerId);
    const humanSeat: Seat =
      seat === 'random' ? (this.deps.random.int(2) as Seat) : seat === 'P1' ? 0 : 1;
    const human = this.human(playerId);
    const ai: SeatSpec = { kind: 'ai', playerId: null, nickname: AI_NAMES[level], level };
    const game = games.create('ai', humanSeat === 0 ? [human, ai] : [ai, human]);
    return { ok: true, gameId: game.id };
  }

  /**
   * The player's socket closed: they leave the queue. Their private code survives a short absence
   * (sharing a link can background the page) but is dropped if they are not back within 25 s.
   */
  playerGone(playerId: string): void {
    this.dequeue(playerId);
    const entry = this.codeEntry(playerId);
    if (!entry || entry.hostAway) return;
    entry.hostAway = this.deps.clock.setTimeout(() => {
      entry.hostAway = null;
      if (this.codeEntry(playerId) === entry) this.cancelCode(playerId);
    }, TIMING.graceMs);
  }

  /** The player is connected again: their private code stays. */
  playerBack(playerId: string): void {
    const entry = this.codeEntry(playerId);
    if (!entry?.hostAway) return;
    this.deps.clock.clearTimeout(entry.hostAway);
    entry.hostAway = null;
  }

  /** After a cancelled start, the player who was ready goes back to the front of the queue. */
  requeueFront(playerId: string): void {
    const { games, players } = this.deps;
    if (this.draining || !players.isConnected(playerId) || games.activeOf(playerId)) return;
    if (this.waiting.has(playerId)) return;
    const since = this.enqueue(playerId, true);
    players.emit(playerId, 'lobby.requeued', { since });
    this.match();
  }

  /** Shutdown: forget everything and cancel the timers. */
  clear(): void {
    for (const playerId of [...this.queue]) this.dequeue(playerId);
    for (const playerId of [...this.codeOf.keys()]) this.cancelCode(playerId);
  }

  /** Reaper pass: drops queue entries that cannot be matched. Returns the number of repairs. */
  sweep(): number {
    const { games, players, logger, clock } = this.deps;
    let fixes = 0;
    for (const playerId of [...this.queue]) {
      if (!players.isConnected(playerId) || games.activeOf(playerId)) {
        this.dequeue(playerId);
        fixes += 1;
        logger.error({ playerId }, 'reaper: queue entry for a player who cannot be matched');
      }
    }
    for (const [code, entry] of [...this.codes]) {
      const lingering = !players.isConnected(entry.playerId) && !entry.hostAway;
      if (entry.expiresAt <= clock.now() - 5_000 || lingering) {
        this.cancelCode(entry.playerId);
        fixes += 1;
        logger.error({ code, lingering }, 'reaper: private code that should be gone');
      }
    }
    this.guesses.prune();
    this.creations.prune();
    this.match();
    return fixes;
  }

  // Internals -------------------------------------------------------------------------------

  private canStart(playerId: string, vsAI: boolean): ErrorCode | null {
    const { games } = this.deps;
    if (games.draining) return 'DRAINING';
    if (games.activeOf(playerId)) return 'ALREADY_IN_GAME';
    return games.admit(vsAI);
  }

  private enqueue(playerId: string, front: boolean): number {
    const { clock, players } = this.deps;
    const since = clock.now();
    if (front) this.queue.unshift(playerId);
    else this.queue.push(playerId);
    const entry: Waiting = { since, offer: null };
    entry.offer = clock.setTimeout(() => {
      entry.offer = null;
      if (this.waiting.get(playerId) === entry) {
        players.emit(playerId, 'lobby.aiOffer', { waitedMs: clock.now() - since });
      }
    }, TIMING.aiOfferMs);
    this.waiting.set(playerId, entry);
    return since;
  }

  private dequeue(playerId: string): void {
    const entry = this.waiting.get(playerId);
    if (!entry) return;
    this.deps.clock.clearTimeout(entry.offer);
    this.waiting.delete(playerId);
    const index = this.queue.indexOf(playerId);
    if (index >= 0) this.queue.splice(index, 1);
  }

  /** Pairs the two longest-waiting players while there is room for another game. */
  private match(): void {
    const { games } = this.deps;
    while (this.queue.length >= 2 && games.admit(false) === null) {
      const a = this.queue[0] as string;
      const b = this.queue[1] as string;
      this.dequeue(a);
      this.dequeue(b);
      games.create('quick', this.drawSeats(this.human(a), this.human(b)));
    }
  }

  private drawSeats(a: SeatSpec, b: SeatSpec): [SeatSpec, SeatSpec] {
    return this.deps.random.int(2) === 0 ? [a, b] : [b, a];
  }

  private human(playerId: string): SeatSpec {
    return {
      kind: 'human',
      playerId,
      nickname: this.deps.players.nickname(playerId) ?? 'Player',
      level: null,
    };
  }

  private codeEntry(playerId: string): PrivateCode | undefined {
    const code = this.codeOf.get(playerId);
    return code === undefined ? undefined : this.codes.get(code);
  }

  private cancelCode(playerId: string): void {
    const code = this.codeOf.get(playerId);
    if (code === undefined) return;
    const entry = this.codes.get(code);
    if (entry) {
      this.deps.clock.clearTimeout(entry.timer);
      this.deps.clock.clearTimeout(entry.hostAway);
      const left = (this.codesPerAddress.get(entry.address) ?? 1) - 1;
      if (left > 0) this.codesPerAddress.set(entry.address, left);
      else this.codesPerAddress.delete(entry.address);
    }
    this.codes.delete(code);
    this.codeOf.delete(playerId);
  }
}

function newCode(): string {
  let code = '';
  for (let i = 0; i < PRIVATE_CODE_LENGTH; i++) {
    code += PRIVATE_CODE_ALPHABET[randomInt(PRIVATE_CODE_ALPHABET.length)];
  }
  return code;
}

/** Codes are typed by people: ignore case, spaces and dashes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/gu, '');
}
