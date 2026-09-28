import { applyMove, legalBids, newGame, seededRng, takeOptions } from '@cardauction/engine';
import { describe, expect, it } from 'vitest';
import type { GameSlice } from '../state/store';
import { viewOf } from '../test/views';
import { entrance, freshIds } from './motion';

const slice = (partial: Partial<GameSlice> & Pick<GameSlice, 'view'>): GameSlice => ({
  gameId: 'g',
  previous: null,
  events: [],
  fresh: [],
  synced: false,
  rematchOffer: false,
  ...partial,
});

describe('card motion', () => {
  const start = newGame(seededRng(7));

  it('deals a new game card by card', () => {
    const view = viewOf(start, 0, 1);
    const enter = entrance(slice({ view, synced: true }));
    const first = enter(view.you.hand[0] ?? 0, 0);
    const later = enter(view.you.hand[1] ?? 0, 5);
    expect(first.initial).toMatchObject({ opacity: 0 });
    expect(Number(later.transition.delay)).toBeGreaterThan(Number(first.transition.delay));
  });

  it('does not deal again when the page reconnects to a game in progress', () => {
    const later = applyMove(start, 1, { type: 'pass' });
    const view = viewOf(later, 0, 2);
    const enter = entrance(slice({ view, synced: true, events: [] }));
    expect(enter(view.you.hand[0] ?? 0, 0).initial).toBe(false);
  });

  it('flies in only the cards that were hidden before', () => {
    const exchanged = applyMove(start, 1, { type: 'pass' });
    const bid = legalBids(exchanged)[0];
    if (!bid) throw new Error('no legal bid');
    const take = takeOptions(exchanged, bid)[0];
    const after = applyMove(exchanged, 0, {
      type: 'bid',
      ...bid,
      ...(take !== undefined ? { take } : {}),
    });
    // Seen by P2: P1's hand cards in the bid were hidden, the table card was not.
    const previous = viewOf(exchanged, 1, 2);
    const view = viewOf(after, 1, 3);
    const enter = entrance(slice({ view, previous }));
    const hidden = [bid.tens, bid.units].find((id) => !previous.table.includes(id));
    const seen = view.table[0];
    if (hidden !== undefined) expect(enter(hidden, 0).initial).not.toBe(false);
    if (seen !== undefined) expect(enter(seen, 0).initial).toBe(false);
  });

  it('marks the card just taken as fresh', () => {
    const exchanged = applyMove(start, 1, { type: 'pass' });
    const bid = legalBids(exchanged)[0];
    if (!bid) throw new Error('no legal bid');
    const take = takeOptions(exchanged, bid)[0];
    if (take === undefined) throw new Error('nothing to take');
    const after = applyMove(exchanged, 0, { type: 'bid', ...bid, take });
    const fresh = freshIds(slice({ view: viewOf(after, 0, 3), previous: viewOf(exchanged, 0, 2) }));
    expect([...fresh]).toContain(take);
  });
});
