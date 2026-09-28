import type { Game } from './games/game.js';

/**
 * Where game snapshots go. Milestone M4 adds a Key Value implementation (snapshots batched every
 * 100 ms, leases, deploy handoff); until then games live only in this process, so a restart or
 * deploy ends them (they end as "aborted", and players are told).
 */
export interface StateStore {
  readonly kind: 'memory' | 'keyvalue';
  /** The game changed: queue a snapshot write. */
  saved(game: Game): void;
  deleted(gameId: string): void;
  close(): Promise<void>;
}

export class MemoryStore implements StateStore {
  readonly kind = 'memory' as const;
  saved(): void {}
  deleted(): void {}
  close(): Promise<void> {
    return Promise.resolve();
  }
}
