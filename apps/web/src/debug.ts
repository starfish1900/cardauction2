import { legalBids, type BidChoice } from '@cardauction/engine';
import { stateFromView } from '@cardauction/protocol';
import { useStore, type AppState } from './state/store';

/**
 * The player's own state, for debugging and the end-to-end tests. It holds nothing the screen
 * does not already show: the server never sends hidden cards.
 */
export interface DebugHandle {
  readonly getState: () => AppState;
  /** The legal bids of the current position, from the same engine as the server. */
  readonly legalBids: () => BidChoice[];
}

declare global {
  interface Window {
    __cardauction?: DebugHandle;
  }
}

export function installDebugHandle(): void {
  window.__cardauction = {
    getState: () => useStore.getState(),
    legalBids: () => {
      const game = useStore.getState().game;
      return game ? legalBids(stateFromView(game.view)) : [];
    },
  };
}
