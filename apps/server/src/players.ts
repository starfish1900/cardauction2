import type { ClientToServerEvents, ServerToClientEvents } from '@cardauction/protocol';
import type { Socket } from 'socket.io';
import type { TokenBucket } from './limits.js';
import type { Identity } from './session.js';

export interface SocketData {
  /** From a valid handshake token; null for a first visit or an invalid token. */
  tokenIdentity: Identity | null;
  /** Set by session.hello: from then on this socket acts for this player. */
  identity: Identity | null;
  ip: string;
  bucket: TokenBucket;
  refusalsInARow: number;
}

export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface PlayerEntry {
  readonly playerId: string;
  nickname: string;
  socket: GameSocket;
}

/**
 * Who is connected right now. A player has at most one live socket: a new tab takes over and
 * the older socket is handed back so the caller can tell it why and close it.
 */
export class Players {
  private readonly entries = new Map<string, PlayerEntry>();

  /** Makes `socket` the player's connection; returns the socket it replaces, if any. */
  attach(identity: Identity, socket: GameSocket): GameSocket | null {
    const entry = this.entries.get(identity.playerId);
    if (!entry) {
      this.entries.set(identity.playerId, {
        playerId: identity.playerId,
        nickname: identity.nickname,
        socket,
      });
      return null;
    }
    entry.nickname = identity.nickname;
    if (entry.socket === socket) return null;
    const previous = entry.socket;
    entry.socket = socket;
    return previous;
  }

  /** Forgets the player if `socket` is still their connection. Returns true in that case. */
  detach(playerId: string, socket: GameSocket): boolean {
    const entry = this.entries.get(playerId);
    if (!entry || entry.socket !== socket) return false;
    this.entries.delete(playerId);
    return true;
  }

  isConnected(playerId: string): boolean {
    return this.entries.has(playerId);
  }

  nickname(playerId: string): string | null {
    return this.entries.get(playerId)?.nickname ?? null;
  }

  socketOf(playerId: string): GameSocket | null {
    return this.entries.get(playerId)?.socket ?? null;
  }

  emit<E extends keyof ServerToClientEvents>(
    playerId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): boolean {
    const socket = this.entries.get(playerId)?.socket;
    if (!socket) return false;
    (socket.emit as (name: string, data: unknown) => boolean)(event, payload);
    return true;
  }

  get count(): number {
    return this.entries.size;
  }

  ids(): IterableIterator<string> {
    return this.entries.keys();
  }
}
