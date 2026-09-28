import type { CardId } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import type { TargetAndTransition, Transition } from 'motion/react';
import type { GameSlice } from '../state/store';

/** Every card id a view shows face up. */
export function visibleIds(view: WireView): Set<CardId> {
  const ids = new Set<CardId>([...view.you.hand, ...view.opponent.known, ...view.table]);
  for (const row of view.bids) {
    ids.add(row.tens);
    ids.add(row.units);
    if (row.action) ids.add(row.action.card);
  }
  return ids;
}

export interface CardMotion {
  readonly initial: TargetAndTransition | false;
  readonly animate: TargetAndTransition;
  readonly transition: Transition;
}

const REST: TargetAndTransition = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
const STILL: CardMotion = { initial: false, animate: REST, transition: { duration: 0.3 } };

/**
 * How each card enters, from what changed since the last update:
 * - the first view of a new game deals every card from the middle of the table, one by one;
 * - a card that was hidden until now (from the opponent's hand) flies in from their side;
 * - a card that was already visible elsewhere moves there on its own, through its layoutId.
 */
export function entrance(game: GameSlice): (id: CardId, order: number) => CardMotion {
  const { view } = game;
  const dealing =
    game.synced && view.bids.length === 1 && view.phase === 'exchange' && game.events.length <= 1;
  if (dealing) {
    return (_id, order) => ({
      initial: { opacity: 0, y: -60, scale: 0.4, rotate: -12 },
      animate: REST,
      transition: { delay: 0.05 + order * 0.028, type: 'spring', stiffness: 320, damping: 26 },
    });
  }
  if (!game.previous) return () => STILL;
  const before = visibleIds(game.previous);
  return (id) =>
    before.has(id)
      ? STILL
      : {
          initial: { opacity: 0, y: -160, scale: 0.7, rotate: 8 },
          animate: REST,
          transition: { type: 'spring', stiffness: 220, damping: 24 },
        };
}

export const LAYOUT_TRANSITION: Transition = { type: 'spring', stiffness: 260, damping: 30 };

/** Cards that just arrived in the player's hand or on the table: they glow for a moment. */
export function freshIds(game: GameSlice): Set<CardId> {
  const before = game.previous;
  if (!before) return new Set();
  const hand = new Set(before.you.hand);
  const table = new Set(before.table);
  return new Set([
    ...game.view.you.hand.filter((id) => !hand.has(id)),
    ...game.view.table.filter((id) => !table.has(id)),
  ]);
}
