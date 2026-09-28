import { cryptoRng, randomMove, type Rng } from '@cardauction/engine';
import {
  stateFromView,
  type AiLevel,
  type Reply,
  type GameUpdate,
  type WireResult,
  type WireSeat,
  type WireView,
} from '@cardauction/protocol';
import { openSession, request, sendMove, type ClientSocket } from './connection.js';

export type BotMode =
  | { readonly kind: 'quick' }
  | { readonly kind: 'ai'; readonly level: AiLevel }
  | { readonly kind: 'join'; readonly code: string };

export interface BotOptions {
  readonly url: string;
  readonly nickname: string;
  readonly mode: BotMode;
  /** Games to play in a row. */
  readonly games?: number;
  /** Pause before each move, to look like a person and spread the load. */
  readonly moveDelayMs?: number;
  readonly rng?: Rng;
  readonly log?: (line: string) => void;
  /** Give up on a game after this long. */
  readonly gameTimeoutMs?: number;
}

export interface BotGame {
  readonly gameId: string;
  readonly seat: WireSeat;
  readonly result: WireResult;
  readonly moves: number;
}

/** A client that plays random legal moves: for smoke, soak and load tests. */
export async function runBot(options: BotOptions): Promise<BotGame[]> {
  const log = options.log ?? (() => undefined);
  const rng = options.rng ?? cryptoRng();
  const session = await openSession(options.url, {
    nickname: options.nickname,
    build: 'bot',
  });
  const { socket } = session;
  const played: BotGame[] = [];
  try {
    for (let n = 0; n < (options.games ?? 1); n++) {
      const matched = waitForMatch(socket, options.gameTimeoutMs ?? 120_000);
      const mode = options.mode;
      const joined = await politely((): Promise<Reply<object>> =>
        mode.kind === 'quick'
          ? request(socket, 'lobby.quick.join', {})
          : mode.kind === 'ai'
            ? request(socket, 'lobby.ai.start', { level: mode.level, seat: 'random' })
            : request(socket, 'lobby.private.join', { code: mode.code }),
      );
      if (!joined.ok) throw new Error(`${options.nickname}: cannot start a game (${joined.code})`);
      const { gameId, seat } = await matched;
      log(`${options.nickname}: playing ${gameId} as ${seat}`);
      const game = await playGame(
        socket,
        gameId,
        rng,
        options.moveDelayMs ?? 0,
        options.gameTimeoutMs ?? 300_000,
      );
      played.push({ gameId, seat, ...game });
      log(
        `${options.nickname}: game over (${game.result.reason}), ${
          game.result.winner === null ? 'no winner' : game.result.winner === seat ? 'won' : 'lost'
        } after ${game.moves} moves`,
      );
      await politely(() => request(socket, 'game.leave', { gameId }));
    }
  } finally {
    socket.disconnect();
  }
  return played;
}

/** The server allows about 10 messages a second: when it says RATE_LIMITED, wait and retry. */
async function politely<T extends { ok: boolean; code?: string }>(
  send: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const reply = await send();
    if (reply.ok || reply.code !== 'RATE_LIMITED' || attempt >= 20) return reply;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function waitForMatch(
  socket: ClientSocket,
  timeoutMs: number,
): Promise<{ gameId: string; seat: WireSeat }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no match within ${timeoutMs} ms`)), timeoutMs);
    socket.once('lobby.matched', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function playGame(
  socket: ClientSocket,
  gameId: string,
  rng: Rng,
  delayMs: number,
  timeoutMs: number,
): Promise<{ result: WireResult; moves: number }> {
  return new Promise((resolve, reject) => {
    let latest: WireView | null = null;
    let busy = false;
    let readySent = false;
    let moves = 0;
    const timer = setTimeout(
      () => finish(new Error(`game ${gameId} did not end in time`)),
      timeoutMs,
    );

    const finish = (outcome: Error | WireResult): void => {
      clearTimeout(timer);
      socket.off('game.update', onUpdate);
      socket.off('game.cancelled', onCancelled);
      if (outcome instanceof Error) reject(outcome);
      else resolve({ result: outcome, moves });
    };

    const act = async (): Promise<void> => {
      const view = latest;
      if (busy || !view) return;
      if (view.status === 'over') {
        if (view.result) finish(view.result);
        return;
      }
      if (view.status === 'starting') {
        if (!readySent) {
          readySent = true;
          await politely(() => request(socket, 'game.ready', { gameId, version: view.version }));
        }
        return;
      }
      if (view.toMove !== view.you.seat) return;
      busy = true;
      try {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        const move = randomMove(stateFromView(view), rng);
        const reply = await politely(() => sendMove(socket, view, move));
        if (reply.ok) moves += 1;
        else if (reply.code === 'STALE' && reply.view) latest = reply.view;
        else if (reply.code !== 'GAME_OVER') throw new Error(`move refused: ${reply.code}`);
      } finally {
        busy = false;
      }
      // Our own update may have arrived while we waited for the answer.
      await act();
    };

    const onUpdate = (update: GameUpdate): void => {
      if (update.gameId !== gameId) return;
      if (!latest || update.view.version >= latest.version) latest = update.view;
      act().catch((error: unknown) =>
        finish(error instanceof Error ? error : new Error(String(error))),
      );
    };
    const onCancelled = (payload: { gameId: string; reason: string }): void => {
      if (payload.gameId === gameId) finish(new Error(`game cancelled (${payload.reason})`));
    };
    socket.on('game.update', onUpdate);
    socket.on('game.cancelled', onCancelled);
    request(socket, 'game.sync', { gameId })
      .then((reply) => {
        if (reply.ok) onUpdate(reply.update);
      })
      .catch(() => undefined);
  });
}
