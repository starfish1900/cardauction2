import {
  applyMove,
  endGame,
  otherSeat,
  validateMove,
  type GameResult,
  type GameState,
  type Move,
  type Seat,
} from '@cardauction/engine';
import {
  TIMING,
  toWireSeat,
  type EndedGame,
  type ErrorCode,
  type ExchangePayload,
  type Failure,
  type GameEventBody,
  type GameUpdate,
  type Reply,
  type ResignPayload,
  type TurnPayload,
} from '@cardauction/protocol';
import type { AiPlayer } from '../ai.js';
import type { Clock } from '../clock.js';
import type { Logger } from '../logger.js';
import type { Metrics } from '../metrics.js';
import type { Players } from '../players.js';
import type { StateStore } from '../store.js';
import { Game, rememberCommand, type GameOrigin, type SeatSpec, type SeatState } from './game.js';
import { buildView, moveEvent } from './views.js';

export interface GamesDeps {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly players: Players;
  readonly metrics: Metrics;
  readonly store: StateStore;
  readonly ai: AiPlayer;
  /** Deals a fresh game. Production: newGame(cryptoRng()). */
  readonly deal: () => GameState;
  readonly maxGames: number;
  readonly maxAiGames: number;
}

interface Tombstone extends EndedGame {
  readonly expiresAt: number;
}

type Found = { readonly game: Game; readonly seat: SeatState };
type VersionReply = Reply<{ readonly version: number }>;

const fail = (code: ErrorCode): Failure => ({ ok: false, code });

/**
 * Owns every game in memory. Each command and each timer runs to completion on the main thread,
 * one at a time, so a game never sees two changes at once. Every entry point is guarded: an
 * unexpected exception ends that one game (aborted) and leaves the others untouched.
 */
export class Games {
  private readonly byId = new Map<string, Game>();
  /** Each player's current game: in progress, or on its result screen. */
  private readonly byPlayer = new Map<string, Game>();
  private readonly tombstones = new Map<string, Tombstone>();
  /** Set by the lobby: puts a player back at the front of the quick-match queue. */
  requeue: (playerId: string) => void = () => {};
  /** No new games (lobby, rematch) while set: the server is restarting or an admin drains it. */
  draining = false;

  constructor(private readonly deps: GamesDeps) {}

  // Queries ---------------------------------------------------------------------------------

  get(gameId: string): Game | null {
    return this.byId.get(gameId) ?? null;
  }

  all(): IterableIterator<Game> {
    return this.byId.values();
  }

  get size(): number {
    return this.byId.size;
  }

  /** The player's game in progress (starting or playing), if any. */
  activeOf(playerId: string): Game | null {
    const game = this.byPlayer.get(playerId);
    return game?.live ? game : null;
  }

  currentOf(playerId: string): Game | null {
    return this.byPlayer.get(playerId) ?? null;
  }

  liveCount(): number {
    let count = 0;
    for (const game of this.byId.values()) if (game.live) count += 1;
    return count;
  }

  liveAiCount(): number {
    let count = 0;
    for (const game of this.byId.values()) if (game.live && game.vsAI) count += 1;
    return count;
  }

  /** Whether a new game may start: DRAINING, SERVER_BUSY beyond the caps, or null. */
  admit(vsAI: boolean): ErrorCode | null {
    if (this.draining) return 'DRAINING';
    if (this.liveCount() >= this.deps.maxGames) return 'SERVER_BUSY';
    if (vsAI && this.liveAiCount() >= this.deps.maxAiGames) return 'SERVER_BUSY';
    return null;
  }

  countsByStatus(): Record<string, number> {
    const counts: Record<string, number> = { starting: 0, playing: 0, over: 0, vsAI: 0 };
    for (const game of this.byId.values()) {
      counts[game.status] = (counts[game.status] ?? 0) + 1;
      if (game.live && game.vsAI) counts.vsAI = (counts.vsAI ?? 0) + 1;
    }
    return counts;
  }

  get armedTimers(): number {
    let count = 0;
    for (const game of this.byId.values()) if (game.timer) count += 1;
    return count;
  }

  // Creation --------------------------------------------------------------------------------

  /** Deals a game for two seats. Games against the AI start at once; others wait for game.ready. */
  create(origin: GameOrigin, specs: readonly [SeatSpec, SeatSpec]): Game {
    const { clock, players, metrics, logger } = this.deps;
    const now = clock.now();
    const game = new Game(origin, this.deps.deal(), specs, now);
    for (const seat of game.humans()) {
      const playerId = seat.playerId as string;
      const previous = this.byPlayer.get(playerId);
      if (previous) {
        // The lobby only creates games for players without one in progress.
        if (previous.live)
          logger.error({ playerId, gameId: previous.id }, 'player already in a live game');
        this.leaveSeat(previous, previous.seatOf(playerId) as SeatState);
      }
      seat.connected = players.isConnected(playerId);
      seat.disconnectedAt = seat.connected ? null : now;
      this.byPlayer.set(playerId, game);
    }
    this.byId.set(game.id, game);
    metrics.gamesCreated += 1;
    if (game.vsAI) metrics.aiGamesCreated += 1;
    logger.info(
      { gameId: game.id, origin, seats: game.seats.map((s) => s.playerId ?? `ai:${s.level}`) },
      'game created',
    );

    // A game against the AI starts at once: its only human just asked for it.
    if (game.vsAI) for (const seat of game.humans()) seat.ready = true;
    const startsNow = game.seats.every((seat) => seat.ready);
    for (const seat of game.humans()) {
      const opponent = game.seats[otherSeat(seat.index)];
      players.emit(seat.playerId as string, 'lobby.matched', {
        gameId: game.id,
        seat: toWireSeat(seat.index),
        opponent: opponent.nickname,
        vsAI: opponent.kind === 'ai',
      });
    }
    if (startsNow) {
      this.guard(game, 'start', () => this.start(game));
    } else {
      game.startDeadline = now + TIMING.startHandshakeMs;
      for (const seat of game.humans()) this.sendUpdate(game, seat, true);
      this.arm(game);
    }
    return game;
  }

  // Player presence -------------------------------------------------------------------------

  /** The player has a live socket again: reattach the seat and resend the whole game. */
  connected(playerId: string): Game | null {
    const game = this.byPlayer.get(playerId);
    if (!game) return null;
    const seat = game.seatOf(playerId);
    if (!seat || seat.left) return null;
    this.guard(game, 'reconnect', () => {
      const wasAway = !seat.connected;
      seat.connected = true;
      seat.disconnectedAt = null;
      seat.graceDeadline = null;
      this.sendUpdate(game, seat, true);
      // A second tab of a connected player changes nothing for the opponent.
      if (wasAway) this.presence(game, seat);
      this.arm(game);
    });
    return game.disposed ? null : game;
  }

  /** The player's socket closed. During play the 25 s window starts now. */
  disconnected(playerId: string): void {
    const game = this.byPlayer.get(playerId);
    if (!game) return;
    const seat = game.seatOf(playerId);
    if (!seat || seat.left) return;
    this.guard(game, 'disconnect', () => {
      const now = this.deps.clock.now();
      seat.connected = false;
      seat.disconnectedAt = now;
      if (game.status === 'playing') seat.graceDeadline = now + TIMING.graceMs;
      if (!game.live && game.presentHumans().length === 0) {
        this.dispose(game, 'everyone left the result screen');
        return;
      }
      this.presence(game, seat);
      this.arm(game);
    });
  }

  /** The player is starting something new: leave any finished game they were looking at. */
  moveOn(playerId: string): void {
    const game = this.byPlayer.get(playerId);
    if (!game || game.live) return;
    const seat = game.seatOf(playerId);
    if (seat) this.guard(game, 'leave', () => this.leaveSeat(game, seat));
  }

  /** The result of a game that was deleted while the player was away, reported once. */
  takeTombstone(playerId: string): EndedGame | null {
    const tombstone = this.tombstones.get(playerId);
    if (!tombstone) return null;
    this.tombstones.delete(playerId);
    if (tombstone.expiresAt <= this.deps.clock.now()) return null;
    return {
      gameId: tombstone.gameId,
      seat: tombstone.seat,
      winner: tombstone.winner,
      reason: tombstone.reason,
    };
  }

  // Commands --------------------------------------------------------------------------------

  ready(playerId: string, gameId: string): Reply {
    const found = this.find(playerId, gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, 'ready', (): Reply => {
      if (game.status !== 'starting') return { ok: true };
      seat.ready = true;
      if (game.seats.every((s) => s.ready)) this.start(game);
      return { ok: true };
    });
  }

  exchange(playerId: string, payload: ExchangePayload): VersionReply {
    const move: Move =
      payload.give === undefined || payload.take === undefined
        ? { type: 'pass' }
        : { type: 'exchange', give: payload.give, take: payload.take };
    return this.command(playerId, payload.gameId, payload.cmdId, payload.expectedVersion, move);
  }

  turn(playerId: string, payload: TurnPayload): VersionReply {
    const move: Move = {
      type: 'bid',
      tens: payload.tens,
      units: payload.units,
      ...(payload.action ? { action: payload.action } : {}),
      ...(payload.take !== undefined ? { take: payload.take } : {}),
    };
    return this.command(playerId, payload.gameId, payload.cmdId, payload.expectedVersion, move);
  }

  resign(playerId: string, payload: ResignPayload): VersionReply {
    const found = this.find(playerId, payload.gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, 'resign', (): VersionReply => {
      const cached = seat.commands.get(payload.cmdId);
      if (cached) return cached;
      if (game.status === 'starting') return fail('NOT_STARTED');
      if (!game.live) return fail('GAME_OVER');
      this.finish(game, { winner: otherSeat(seat.index), reason: 'resign' });
      const reply: VersionReply = { ok: true, version: game.version };
      rememberCommand(seat, payload.cmdId, reply);
      return reply;
    });
  }

  rematch(playerId: string, gameId: string, accept: boolean): Reply {
    const found = this.find(playerId, gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, 'rematch', (): Reply => {
      if (game.live) return fail('GAME_IN_PROGRESS');
      const now = this.deps.clock.now();
      if (game.rematchDeadline === null || now >= game.rematchDeadline)
        return fail('REMATCH_CLOSED');
      const other = game.seats[otherSeat(seat.index)];
      if (other.kind === 'human' && (other.left || !other.connected)) return fail('REMATCH_CLOSED');
      // Refuse before recording anything, so a busy server never leaves both flags set.
      if (accept && other.rematch) {
        const busy = this.admit(game.vsAI);
        if (busy) return fail(busy);
      }
      seat.rematch = accept;
      if (other.kind === 'human') {
        this.deps.players.emit(other.playerId as string, 'game.rematch', {
          gameId: game.id,
          seat: toWireSeat(seat.index),
          accept,
        });
      }
      if (!accept || !other.rematch) return { ok: true };
      // Seats swap for the rematch. Both players move straight to the new game.
      const specs: [SeatSpec, SeatSpec] = [specOf(game.seats[1]), specOf(game.seats[0])];
      for (const s of game.humans()) this.detach(game, s);
      this.dispose(game, 'rematch');
      this.deps.metrics.rematches += 1;
      this.create('rematch', specs);
      return { ok: true };
    });
  }

  leave(playerId: string, gameId: string): Reply {
    const found = this.find(playerId, gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, 'leave', (): Reply => {
      if (game.live) return fail('GAME_IN_PROGRESS');
      this.leaveSeat(game, seat);
      return { ok: true };
    });
  }

  sync(playerId: string, gameId: string): Reply<{ readonly update: GameUpdate }> {
    const found = this.find(playerId, gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, 'sync', () => ({ ok: true, update: this.update(game, seat, true) }));
  }

  // Shutdown and admin ----------------------------------------------------------------------

  /** Ends a game without a winner (admin, or the server stopping) and deletes it. */
  abort(game: Game, why: string): void {
    this.guard(game, 'abort', () => {
      if (game.live) this.finish(game, { winner: null, reason: 'aborted' });
      this.dispose(game, why);
    });
  }

  abortAll(why: string): void {
    for (const game of [...this.byId.values()]) this.abort(game, why);
  }

  /**
   * Safety net, run by the reaper: every inconsistency it repairs is a bug, logged and counted.
   * Returns the number of repairs.
   */
  sweep(): number {
    const { clock, logger, players } = this.deps;
    const now = clock.now();
    let fixes = 0;
    const bug = (message: string, details: object): void => {
      fixes += 1;
      logger.error(details, `reaper: ${message}`);
    };
    for (const game of [...this.byId.values()]) {
      if (game.disposed) {
        this.byId.delete(game.id);
        bug('disposed game still registered', { gameId: game.id });
        continue;
      }
      for (const seat of game.humans()) {
        const online = players.isConnected(seat.playerId as string);
        if (
          !seat.left &&
          online !== seat.connected &&
          this.byPlayer.get(seat.playerId as string) === game
        ) {
          bug('seat presence out of date', { gameId: game.id, seat: seat.index, online });
          if (online) this.connected(seat.playerId as string);
          else this.disconnected(seat.playerId as string);
        }
      }
      if (game.disposed) continue;
      if (!game.live && game.presentHumans().length === 0) {
        bug('finished game with nobody left', { gameId: game.id });
        this.dispose(game, 'reaper');
        continue;
      }
      const due = this.nextDeadline(game);
      if (due !== null && due < now - 5_000) {
        bug('deadline overdue', { gameId: game.id, overdueMs: now - due });
        clock.clearTimeout(game.timer);
        this.fire(game);
      } else if (due !== null && (game.timer === null || game.timerAt !== due)) {
        bug('timer not armed for the next deadline', { gameId: game.id });
        this.arm(game);
      }
    }
    for (const [playerId, game] of [...this.byPlayer]) {
      if (game.disposed || this.byId.get(game.id) !== game) {
        this.byPlayer.delete(playerId);
        bug('player index points to a deleted game', { playerId, gameId: game.id });
      }
    }
    for (const [playerId, tombstone] of [...this.tombstones]) {
      if (tombstone.expiresAt <= now) this.tombstones.delete(playerId);
    }
    return fixes;
  }

  // Internals -------------------------------------------------------------------------------

  private find(playerId: string, gameId: string): Found | Failure {
    const game = this.byId.get(gameId);
    const seat = game?.seatOf(playerId);
    if (!game || !seat || seat.left) return fail('GAME_NOT_FOUND');
    return { game, seat };
  }

  /** The command pipeline shared by exchanges and turns (see the plan's Game server section). */
  private command(
    playerId: string,
    gameId: string,
    cmdId: string,
    expectedVersion: number,
    move: Move,
  ): VersionReply {
    const found = this.find(playerId, gameId);
    if (!('game' in found)) return found;
    const { game, seat } = found;
    return this.guard(game, move.type, (): VersionReply => {
      const cached = seat.commands.get(cmdId);
      if (cached) return cached;
      if (game.status === 'starting') return fail('NOT_STARTED');
      if (!game.live) return fail('GAME_OVER');
      if (expectedVersion !== game.version) {
        return {
          ok: false,
          code: 'STALE',
          view: buildView(game, seat.index, this.deps.clock.now()),
        };
      }
      const check = validateMove(game.state, seat.index, move);
      if (!check.ok) return fail(check.error);
      this.play(game, seat.index, move);
      const reply: VersionReply = { ok: true, version: game.version };
      rememberCommand(seat, cmdId, reply);
      return reply;
    });
  }

  /** Applies a validated move, then does everything that follows from it. */
  private play(game: Game, seat: Seat, move: Move, timeout = false): void {
    const before = game.state;
    const after = applyMove(before, seat, move);
    game.state = after;
    game.version += 1;
    this.record(game, moveEvent(before, seat, move, after, timeout));
    if (after.result) {
      // The engine found that the next player has no legal bid.
      this.finish(game, after.result, false);
      return;
    }
    game.turnDeadline = this.deps.clock.now() + TIMING.turnMs;
    this.scheduleAi(game);
    this.broadcast(game);
    this.arm(game);
    this.deps.store.saved(game);
  }

  private start(game: Game): void {
    const now = this.deps.clock.now();
    game.status = 'playing';
    game.startDeadline = null;
    game.version += 1;
    game.turnDeadline = now + TIMING.turnMs;
    for (const seat of game.humans()) {
      // A player who dropped during the start handshake keeps the rest of their 25 s.
      if (!seat.connected) seat.graceDeadline = (seat.disconnectedAt ?? now) + TIMING.graceMs;
    }
    this.record(game, { type: 'start' });
    this.scheduleAi(game);
    this.broadcast(game);
    this.arm(game);
    this.deps.store.saved(game);
  }

  /** Ends the game. `bump` is false when the move that ended it already raised the version. */
  private finish(game: Game, result: GameResult, bump = true): void {
    if (!game.live) return;
    const { clock, metrics, logger } = this.deps;
    const now = clock.now();
    if (!game.state.result) game.state = endGame(game.state, result);
    if (bump) game.version += 1;
    game.status = 'over';
    game.turnDeadline = null;
    game.startDeadline = null;
    game.aiDueAt = null;
    this.cancelAi(game);
    for (const seat of game.seats) seat.graceDeadline = null;
    this.record(game, {
      type: 'end',
      winner: result.winner === null ? null : toWireSeat(result.winner),
      reason: result.reason,
    });
    metrics.ended[result.reason] += 1;
    const rematchable = result.reason !== 'abandoned' && result.reason !== 'aborted';
    game.rematchDeadline = rematchable ? now + TIMING.rematchMs : null;
    game.lingerDeadline = now + TIMING.lingerMs;
    for (const seat of game.seats) seat.rematch = rematchable && seat.kind === 'ai';
    logger.info(
      { gameId: game.id, winner: result.winner, reason: result.reason, version: game.version },
      'game over',
    );
    this.broadcast(game);
    this.deps.store.saved(game);
    if (game.presentHumans().length === 0)
      this.dispose(game, `ended (${result.reason}) with nobody present`);
    else this.arm(game);
  }

  private cancelStart(game: Game): void {
    const ready = game.humans().filter((seat) => seat.ready && seat.connected);
    this.deps.metrics.startsCancelled += 1;
    for (const seat of game.humans()) {
      this.deps.players.emit(seat.playerId as string, 'game.cancelled', {
        gameId: game.id,
        reason: 'start-timeout',
      });
    }
    this.dispose(game, 'start handshake timed out');
    if (game.origin === 'quick') for (const seat of ready) this.requeue(seat.playerId as string);
  }

  /** Every deadline that has passed, in the order the plan defines. */
  private onDeadlines(game: Game): void {
    const now = this.deps.clock.now();
    if (game.status === 'starting') {
      if (game.startDeadline !== null && now >= game.startDeadline) this.cancelStart(game);
      return;
    }
    if (game.status === 'playing') {
      const turnAt =
        game.turnDeadline === null ? null : game.turnDeadline + TIMING.lateMoveToleranceMs;
      const turnDue = turnAt !== null && now >= turnAt;
      const graceDue = game
        .humans()
        .filter((s) => !s.connected && s.graceDeadline !== null && now >= s.graceDeadline)
        .sort((a, b) => (a.graceDeadline as number) - (b.graceDeadline as number));
      const firstGrace = graceDue[0];
      if (turnDue || firstGrace) {
        // The zombie rule: nobody is there when a deadline passes, so nobody wins.
        if (game.everyoneAway()) {
          this.finish(game, { winner: null, reason: 'abandoned' });
          return;
        }
        if (turnDue && (!firstGrace || turnAt <= (firstGrace.graceDeadline as number))) {
          const mover = game.state.toMove;
          // P2's exchange timing out counts as a pass; any other turn timing out loses.
          if (game.state.phase === 'exchange') this.play(game, mover, { type: 'pass' }, true);
          else this.finish(game, { winner: otherSeat(mover), reason: 'timeout' });
          return;
        }
        if (firstGrace) {
          this.finish(game, { winner: otherSeat(firstGrace.index), reason: 'forfeit' });
          return;
        }
      }
      if (game.aiDueAt !== null && now >= game.aiDueAt) this.runAi(game);
      return;
    }
    if (game.rematchDeadline !== null && now >= game.rematchDeadline) {
      game.rematchDeadline = null;
      for (const seat of game.seats) seat.rematch = false;
      this.broadcast(game);
    }
    if (game.lingerDeadline !== null && now >= game.lingerDeadline) {
      this.dispose(game, 'result screen timed out');
    }
  }

  private nextDeadline(game: Game): number | null {
    const times: number[] = [];
    if (game.status === 'starting' && game.startDeadline !== null) times.push(game.startDeadline);
    if (game.status === 'playing') {
      if (game.turnDeadline !== null) times.push(game.turnDeadline + TIMING.lateMoveToleranceMs);
      for (const seat of game.seats)
        if (seat.graceDeadline !== null) times.push(seat.graceDeadline);
      if (game.aiDueAt !== null) times.push(game.aiDueAt);
    }
    if (game.status === 'over') {
      if (game.rematchDeadline !== null) times.push(game.rematchDeadline);
      if (game.lingerDeadline !== null) times.push(game.lingerDeadline);
    }
    return times.length > 0 ? Math.min(...times) : null;
  }

  /** Keeps exactly one timer armed per game, for its earliest deadline. */
  private arm(game: Game): void {
    if (game.disposed) return;
    const { clock } = this.deps;
    const at = this.nextDeadline(game);
    if (game.timer && game.timerAt === at) return;
    clock.clearTimeout(game.timer);
    game.timer = null;
    game.timerAt = null;
    if (at === null) return;
    game.timerAt = at;
    const handle = clock.setTimeout(() => {
      // A timer the game no longer owns (replaced, or taken over by the reaper) does nothing.
      if (game.timer === handle) this.fire(game);
    }, at - clock.now());
    game.timer = handle;
  }

  private fire(game: Game): void {
    game.timer = null;
    game.timerAt = null;
    if (game.disposed) return;
    this.guard(game, 'timer', () => this.onDeadlines(game));
    this.arm(game);
  }

  private scheduleAi(game: Game): void {
    const mover = game.seats[game.state.toMove];
    game.aiDueAt =
      game.status === 'playing' && mover.kind === 'ai'
        ? this.deps.clock.now() + this.deps.ai.thinkDelayMs(mover.level ?? 'easy')
        : null;
  }

  private runAi(game: Game): void {
    game.aiDueAt = null;
    const seat = game.state.toMove;
    const mover = game.seats[seat];
    if (mover.kind !== 'ai') return;
    this.cancelAi(game);
    const job = new AbortController();
    game.aiJob = job;
    const version = game.version;
    const view = buildView(game, seat, this.deps.clock.now());
    const stillWanted = (): boolean =>
      !job.signal.aborted && !game.disposed && game.aiJob === job && game.version === version;
    this.deps.ai.chooseMove(view, mover.level ?? 'easy', job.signal).then(
      (move) => {
        if (!stillWanted()) return;
        game.aiJob = null;
        this.guard(game, 'ai move', () => {
          const check = validateMove(game.state, seat, move);
          if (!check.ok) throw new Error(`the AI chose an illegal move (${check.error})`);
          this.play(game, seat, move);
        });
      },
      (error: unknown) => {
        if (!stillWanted()) return;
        game.aiJob = null;
        this.guard(game, 'ai move', () => {
          throw error;
        });
      },
    );
  }

  private cancelAi(game: Game): void {
    game.aiJob?.abort();
    game.aiJob = null;
  }

  private record(game: Game, body: GameEventBody): void {
    game.events.push({
      ...body,
      seq: game.events.length + 1,
      at: this.deps.clock.now(),
      version: game.version,
    });
  }

  private update(game: Game, seat: SeatState, wanted: boolean): GameUpdate {
    const now = this.deps.clock.now();
    // A seat's first update is always a full one.
    const sync = wanted || !seat.synced;
    const events = sync ? game.events : game.events.slice(seat.sentEvents);
    seat.sentEvents = game.events.length;
    seat.synced = true;
    return {
      gameId: game.id,
      version: game.version,
      serverNow: now,
      view: buildView(game, seat.index, now),
      events,
      sync,
    };
  }

  private sendUpdate(game: Game, seat: SeatState, sync: boolean): void {
    if (seat.kind !== 'human' || seat.left) return;
    const playerId = seat.playerId as string;
    if (!this.deps.players.isConnected(playerId)) return;
    this.deps.players.emit(playerId, 'game.update', this.update(game, seat, sync));
  }

  private broadcast(game: Game): void {
    for (const seat of game.humans()) this.sendUpdate(game, seat, false);
  }

  /** Tells the other player that `seat` came or went. */
  private presence(game: Game, seat: SeatState): void {
    const other = game.seats[otherSeat(seat.index)];
    if (other.kind !== 'human' || other.left) return;
    this.deps.players.emit(other.playerId as string, 'game.presence', {
      gameId: game.id,
      seat: toWireSeat(seat.index),
      connected: seat.connected && !seat.left,
      graceDeadline: game.status === 'playing' ? seat.graceDeadline : null,
      serverNow: this.deps.clock.now(),
    });
  }

  /** The player leaves a finished game; the game goes once nobody is left on its result screen. */
  private leaveSeat(game: Game, seat: SeatState): void {
    if (seat.left) return;
    this.detach(game, seat);
    this.presence(game, seat);
    if (!game.live && game.presentHumans().length === 0) this.dispose(game, 'everyone left');
  }

  private detach(game: Game, seat: SeatState): void {
    seat.left = true;
    seat.rematch = false;
    const playerId = seat.playerId as string;
    if (this.byPlayer.get(playerId) === game) this.byPlayer.delete(playerId);
  }

  /**
   * Deletes a game, idempotently: its timer, AI job, registry and player-index entries and its
   * snapshot. Players who were away when it ended get a tombstone with the result for 10 minutes.
   */
  private dispose(game: Game, why: string): void {
    if (game.disposed) return;
    const { clock, metrics, logger, store } = this.deps;
    game.disposed = true;
    clock.clearTimeout(game.timer);
    game.timer = null;
    game.timerAt = null;
    this.cancelAi(game);
    this.byId.delete(game.id);
    const result = game.state.result;
    for (const seat of game.humans()) {
      const playerId = seat.playerId as string;
      if (this.byPlayer.get(playerId) === game) this.byPlayer.delete(playerId);
      if (result && !seat.connected && !seat.left) {
        this.tombstones.set(playerId, {
          gameId: game.id,
          seat: toWireSeat(seat.index),
          winner: result.winner === null ? null : toWireSeat(result.winner),
          reason: result.reason,
          expiresAt: clock.now() + TIMING.tombstoneMs,
        });
      }
    }
    store.deleted(game.id);
    metrics.gamesDisposed += 1;
    logger.info({ gameId: game.id, why }, 'game deleted');
  }

  /**
   * Fault isolation: an exception inside one game's handler ends that game as aborted, logs its
   * full state and answers INTERNAL. It never escapes to the other games.
   */
  private guard<T>(game: Game, action: string, run: () => T): T | Failure {
    try {
      return run();
    } catch (error) {
      const { metrics, logger } = this.deps;
      metrics.internalErrors += 1;
      logger.error(
        {
          err: error,
          gameId: game.id,
          action,
          status: game.status,
          version: game.version,
          state: game.state,
        },
        'game handler failed: the game is aborted',
      );
      let told = false;
      try {
        if (game.live) {
          this.finish(game, { winner: null, reason: 'aborted' });
          told = true;
        }
      } catch (second) {
        logger.error({ err: second, gameId: game.id }, 'could not end the failed game cleanly');
      }
      if (!told) {
        // Its state may be too broken to build a view: just tell the players it is gone.
        for (const seat of game.humans()) {
          this.deps.players.emit(seat.playerId as string, 'game.cancelled', {
            gameId: game.id,
            reason: 'server-error',
          });
        }
      }
      try {
        this.dispose(game, `internal error during ${action}`);
      } catch (third) {
        logger.error({ err: third, gameId: game.id }, 'could not dispose the failed game cleanly');
        game.disposed = true;
        this.deps.clock.clearTimeout(game.timer);
        this.byId.delete(game.id);
        for (const seat of game.humans()) {
          if (this.byPlayer.get(seat.playerId as string) === game)
            this.byPlayer.delete(seat.playerId as string);
        }
      }
      return fail('INTERNAL');
    }
  }
}

function specOf(seat: SeatState): SeatSpec {
  return { kind: seat.kind, playerId: seat.playerId, nickname: seat.nickname, level: seat.level };
}
