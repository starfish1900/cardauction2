import { cryptoRng, randomMove, type Move, type Rng } from '@cardauction/engine';
import { stateFromView, type AiLevel, type WireView } from '@cardauction/protocol';

/**
 * The server's AI opponent. It receives only its own seat's view, exactly like a human client,
 * so it can never peek at hidden cards.
 */
export interface AiPlayer {
  /** How long to wait before thinking, so moves do not land instantly. */
  thinkDelayMs(level: AiLevel): number;
  chooseMove(view: WireView, level: AiLevel, signal: AbortSignal): Promise<Move>;
}

/**
 * Placeholder until milestone M3 brings ISMCTS in a worker thread: every level plays a random
 * legal move from its own view.
 */
export class RandomAi implements AiPlayer {
  constructor(private readonly rng: Rng = cryptoRng()) {}

  thinkDelayMs(): number {
    return 600 + this.rng.int(900);
  }

  chooseMove(view: WireView): Promise<Move> {
    return Promise.resolve(randomMove(stateFromView(view), this.rng));
  }
}
