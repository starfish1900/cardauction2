import { cardLabel, type CardId } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import { describe, expect, it } from 'vitest';
import { card, position } from '../../../../packages/engine/test/helpers';
import { viewOf } from '../test/views';
import { analyze, chooseColumn, EMPTY, pick, type Selection } from './compose';

/** Taps cards in order: "h:6S" for a hand card, "t:4C" for a table card. */
function tap(view: WireView, taps: string[], start: Selection = EMPTY): Selection {
  return taps.reduce((sel, t) => {
    const [zone, code] = t.split(':') as ['h' | 't', string];
    const pool = zone === 'h' ? view.you.hand : view.table;
    return pick(view, sel, zone === 'h' ? 'hand' : 'table', card(pool, code));
  }, start);
}

const labels = (ids: Iterable<CardId>): string[] => [...ids].map(cardLabel).sort();

describe('composing a bid (latest 5♥ 8♠ = 58)', () => {
  const view = viewOf(
    position({
      rows: [{ by: 1, cards: '4H 9S' }],
      start: '4D 7C',
      toMove: 0,
      p1: '6S 3* 6D 3D 7D 0* 6H A',
      p2: '8H 1C',
      table: '9C 2H',
    }),
  );
  // Latest row: 4♥ 9♠ = 49 by P2. P1 to bid 50–59, or 60–69 with +10, or 40–49 with −10.

  it('waits for two digits and the column, then a table card to take', () => {
    const first = tap(view, ['h:6D']);
    expect(analyze(view, first).stage).toBe('pickDigits');
    const withAction = tap(view, ['h:A', 'h:3D'], first);
    expect(analyze(view, withAction).stage).toBe('pickColumn');
    expect(analyze(view, chooseColumn(withAction, 1))).toMatchObject({
      stage: 'pickTake',
      value: 63,
    });
  });

  it('checks the number live and explains a wrong one', () => {
    const seventy = { ...EMPTY, tens: card(view.you.hand, '7D'), units: card(view.you.hand, '0*') };
    const outOfRange = analyze(view, seventy);
    expect(outOfRange).toMatchObject({ stage: 'invalid', error: 'OUT_OF_RANGE', value: 70 });
    expect(outOfRange.window).toEqual({ from: 50, to: 59 });
    const withPlus = tap(view, ['h:A', 'h:7D', 'h:0*']);
    expect(analyze(view, withPlus).stage).toBe('pickColumn');
    const minus = analyze(view, chooseColumn(withPlus, 4));
    expect(minus).toMatchObject({ stage: 'invalid', error: 'OUT_OF_RANGE', reference: 39 });
    const plus = chooseColumn(withPlus, 1);
    expect(analyze(view, plus)).toMatchObject({ stage: 'invalid', error: 'OUT_OF_RANGE' });
    expect(analyze(view, plus).window).toEqual({ from: 60, to: 69 });
  });

  it('needs a new color: ♥ and ♠ are old', () => {
    const sel = tap(view, ['h:A', 'h:6H', 'h:3*']);
    const a = analyze(view, chooseColumn(sel, 1));
    expect(labels(a.oldSuits.map((s) => s * 20))).toHaveLength(2);
    expect(a.stage).toBe('pickTake'); // 63: +4 over 59 with +10, and ★ is new
    const oldOnly = analyze(view, chooseColumn(tap(view, ['h:A', 'h:6H', 'h:6S']), 1));
    expect(oldOnly).toMatchObject({ stage: 'invalid', error: 'NO_NEW_COLOR' });
  });

  it('is ready once the take is chosen, and the move is what the server expects', () => {
    const sel = chooseColumn(tap(view, ['h:A', 'h:6D', 'h:3D']), 1);
    const ready = analyze(view, tap(view, ['t:9C'], sel));
    expect(ready.stage).toBe('ready');
    expect(ready.step).toBe(4);
    expect(ready.move).toMatchObject({ type: 'bid', take: card(view.table, '9C') });
  });

  it('toggles a card off when tapped again, and a take when tapped again', () => {
    const sel = tap(view, ['h:6D', 'h:6D']);
    expect(sel).toEqual(EMPTY);
    const take = tap(view, ['t:9C', 't:9C']);
    expect(take.take).toBeNull();
  });

  it('assist mode lights the cards that fit a legal bid', () => {
    const none = analyze(view, EMPTY);
    // With no action card chosen, legal bids are 50–59: no 5 in hand, so only the action card.
    expect(labels(none.playable)).toEqual(['±10']);
    const withAction = analyze(view, tap(view, ['h:A']));
    expect(labels(withAction.playable)).toEqual(
      expect.arrayContaining(['6♦', '6♠', '3♦', '3★', '0★']),
    );
    expect(withAction.columns).toEqual([1]);
  });
});

describe('placing a digit where it can be legal', () => {
  it('puts a card that only works as units into units', () => {
    const view = viewOf(
      position({ start: '5H 8S', toMove: 0, p1: '9* 5D 1C', p2: '8H', table: '2H' }),
    );
    const sel = tap(view, ['h:9*']);
    expect(sel.units).toBe(card(view.you.hand, '9*'));
    const both = tap(view, ['h:5D'], sel);
    expect(analyze(view, both)).toMatchObject({ stage: 'pickTake', value: 59 });
  });
});

describe("P1's first bid", () => {
  const view = viewOf(
    position({
      phase: 'firstBid',
      toMove: 0,
      p1: '6S 3* 7C',
      p2: '8H 1C',
      table: '6D 4C 2H',
    }),
  );

  it('lets table cards join the bid until it is complete, then they are taken', () => {
    const sel = tap(view, ['t:6D', 'h:3*']);
    expect(sel.tens).toBe(card(view.table, '6D'));
    expect(analyze(view, sel).stage).toBe('pickTake');
    const done = tap(view, ['t:4C'], sel);
    expect(done.take).toBe(card(view.table, '4C'));
    expect(analyze(view, done).stage).toBe('ready');
  });

  it('keeps a single table card in the bid: a new one replaces it', () => {
    const sel = tap(view, ['t:6D', 't:4C']);
    expect([sel.tens, sel.units]).not.toContain(card(view.table, '6D'));
    expect([sel.tens, sel.units]).toContain(card(view.table, '4C'));
  });

  it('refuses a bid made only of hand cards', () => {
    const a = analyze(view, tap(view, ['h:6S', 'h:3*']));
    expect(a).toMatchObject({ stage: 'invalid', error: 'TABLE_CARD_REQUIRED' });
  });

  it('lets a table card into a complete bid that has none yet, instead of taking it', () => {
    const digits = tap(view, ['h:6S', 'h:3*']);
    const fixed = tap(view, ['t:2H'], digits);
    expect(fixed.units).toBe(card(view.table, '2H'));
    expect(fixed.take).toBeNull();
    expect(analyze(view, fixed).error).not.toBe('TABLE_CARD_REQUIRED');
  });

  it('moves the card to take into the bid when the bid needs it', () => {
    const complete = tap(view, ['t:6D', 'h:3*', 't:4C']);
    expect(complete.take).toBe(card(view.table, '4C'));
    // Tap 6♦ off the bid: now 4♣, the card to take, can join the bid instead.
    const joined = tap(view, ['t:6D', 't:4C'], complete);
    expect(joined.take).toBeNull();
    expect([joined.tens, joined.units]).toContain(card(view.table, '4C'));
  });
});

describe("P1's first bid with an action card on the table", () => {
  const view = viewOf(
    position({
      phase: 'firstBid',
      rows: [],
      start: '4D 7C',
      toMove: 0,
      p1: '5H 2S 9D',
      p2: '8H 1C',
      table: 'A 6D 3C',
    }),
  );

  it('takes the table ±10 into the bid after two hand digits', () => {
    const sel = tap(view, ['h:5H', 'h:2S', 't:A']);
    expect(sel.action?.card).toBe(card(view.table, 'A'));
    expect(sel.take).toBeNull();
    expect(analyze(view, sel).stage).toBe('pickColumn');
    // With its column, the bid is checked as usual.
    expect(analyze(view, chooseColumn(sel, 4)).stage).not.toBe('pickColumn');
  });
});

describe('a pair split between the hand and the table', () => {
  const view = viewOf(
    position({
      phase: 'firstBid',
      rows: [],
      start: '8C 1D',
      toMove: 0,
      p1: '8H 0S',
      p2: '1C 2C',
      table: '8H 5S',
    }),
  );

  it('highlights both copies, in either order', () => {
    // 88 is 1–10 above 81, and ♥ is new; one copy in the hand, one on the table.
    const tensFromHand = tap(view, ['h:8H']);
    expect(tensFromHand.tens).toBe(card(view.you.hand, '8H'));
    const a = analyze(view, tensFromHand);
    expect(a.playable.has(card(view.table, '8H'))).toBe(true);
    const both = tap(view, ['t:8H'], tensFromHand);
    expect(analyze(view, both).stage).toBe('pickTake');
  });
});

describe("P2's exchange", () => {
  const view = viewOf(
    position({ phase: 'exchange', toMove: 1, p1: '6S 3*', p2: '1H 9D', table: '7C 0*' }),
  );

  it('picks one hand card and one table card', () => {
    const sel = tap(view, ['h:1H', 't:7C']);
    const a = analyze(view, sel);
    expect(a.mode).toBe('exchange');
    expect(a.move).toEqual({ type: 'exchange', give: sel.give, take: sel.take });
  });

  it("shows nothing to do when it is the other player's turn", () => {
    const other = { ...view, toMove: 'P1' as const };
    expect(analyze(other, EMPTY).mode).toBe('watch');
    expect(pick(other, EMPTY, 'hand', view.you.hand[0] as CardId)).toBe(EMPTY);
  });
});
