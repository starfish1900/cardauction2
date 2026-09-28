import { randomBytes } from 'node:crypto';
import type { GameState, Seat } from '@cardauction/engine';
import type { AiLevel, GameEvent, GameStatus, Reply } from '@cardauction/protocol';
import type { TimerHandle } from '../clock.js';

export type GameOrigin = 'quick' | 'private' | 'ai' | 'rematch';

export interface SeatSpec {
  readonly kind: 'human' | 'ai';
  /** null for the AI. */
  readonly playerId: string | null;
  readonly nickname: string;
  readonly level: AiLevel | null;
}

export interface SeatState extends SeatSpec {
  readonly index: Seat;
  /** The player has a live socket (the AI always counts as connected). */
  connected: boolean;
  /** When the player's connection dropped (null while connected). */
  disconnectedAt: number | null;
  /** While disconnected during play: when the seat forfeits. */
  graceDeadline: number | null;
  /** Start handshake done (the AI is always ready). */
  ready: boolean;
  /** Left the finished game for the lobby or another game. */
  left: boolean;
  /** Was away when the game ended, so never saw the result: gets a tombstone if it is deleted. */
  awayAtEnd: boolean;
  rematch: boolean;
  /** Recent command ids and their replies: a resent command is answered, not applied twice. */
  readonly commands: Map<string, Reply<{ readonly version: number }>>;
  /** How many of the game's events this seat has already been sent. */
  sentEvents: number;
  /** The seat has received a full (sync) update of this game. */
  synced: boolean;
}

/**
 * One live game: the engine state plus everything the server adds around it (seats, clock,
 * version, events). Only the Games manager changes it, one command or timer at a time on the
 * main thread, so it needs no locks.
 */
export class Game {
  readonly id = `g${randomBytes(12).toString('base64url')}`;
  readonly seats: [SeatState, SeatState];
  status: GameStatus = 'starting';
  /** Rises with every change of the game (moves, start, end), not with presence changes. */
  version = 1;
  readonly events: GameEvent[] = [];
  startDeadline: number | null = null;
  turnDeadline: number | null = null;
  rematchDeadline: number | null = null;
  lingerDeadline: number | null = null;
  /** When the AI should start thinking about its move. */
  aiDueAt: number | null = null;
  aiJob: AbortController | null = null;
  timer: TimerHandle | null = null;
  timerAt: number | null = null;
  disposed = false;

  constructor(
    readonly origin: GameOrigin,
    public state: GameState,
    seats: readonly [SeatSpec, SeatSpec],
    readonly createdAt: number,
  ) {
    this.seats = [makeSeat(seats[0], 0), makeSeat(seats[1], 1)];
  }

  seatOf(playerId: string): SeatState | null {
    return this.seats.find((seat) => seat.playerId === playerId) ?? null;
  }

  humans(): SeatState[] {
    return this.seats.filter((seat) => seat.kind === 'human');
  }

  get vsAI(): boolean {
    return this.seats.some((seat) => seat.kind === 'ai');
  }

  /** Humans still attached to the game: connected and not gone to something else. */
  presentHumans(): SeatState[] {
    return this.humans().filter((seat) => seat.connected && !seat.left);
  }

  /** The zombie rule applies when no seat is present: the AI always is. */
  everyoneAway(): boolean {
    return this.seats.every((seat) => seat.kind === 'human' && !seat.connected);
  }

  get live(): boolean {
    return this.status !== 'over';
  }
}

const COMMAND_CACHE = 16;

export function rememberCommand(
  seat: SeatState,
  cmdId: string,
  reply: Reply<{ readonly version: number }>,
): void {
  seat.commands.set(cmdId, reply);
  if (seat.commands.size > COMMAND_CACHE) {
    const oldest = seat.commands.keys().next().value;
    if (oldest !== undefined) seat.commands.delete(oldest);
  }
}

function makeSeat(spec: SeatSpec, index: Seat): SeatState {
  const ai = spec.kind === 'ai';
  return {
    ...spec,
    index,
    connected: ai,
    disconnectedAt: null,
    graceDeadline: null,
    ready: ai,
    left: false,
    awayAtEnd: false,
    rematch: false,
    commands: new Map(),
    sentEvents: 0,
    synced: false,
  };
}
