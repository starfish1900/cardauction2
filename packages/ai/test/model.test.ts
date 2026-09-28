import {
  exchangeOptions,
  faceOf,
  legalBids,
  playRandomGame,
  seededRng,
  STANDARD_RULES,
  takeOptions,
  validateMove,
  viewFor,
  type GameState,
  type Move,
  type RuleSet,
} from '@cardauction/engine';
import { describe, expect, it } from 'vitest';
import {
  BID,
  codeOfMove,
  EXCHANGE,
  FACES,
  FIRST_BID,
  knowledgeFromView,
  moveOfCode,
  OVER,
  PASS,
  type State,
  stateFromGame,
  TAKE,
  takeCode,
} from '../src/model.js';

const buffer = new Int32Array(8192);

function modelMoves(s: State): number[] {
  const n = s.legalMoves(buffer);
  return Array.from(buffer.subarray(0, n)).sort((a, b) => a - b);
}

function engineBidCodes(game: GameState): number[] {
  return legalBids(game)
    .map((bid) => codeOfMove(game, { type: 'bid', ...bid }).move)
    .sort((a, b) => a - b);
}

function engineExchangeCodes(game: GameState): number[] {
  const codes = exchangeOptions(game)
    .filter(({ give, take }) => faceOf(give) !== faceOf(take))
    .map((option) => codeOfMove(game, { type: 'exchange', ...option }).move);
  return [PASS, ...codes].sort((a, b) => a - b);
}

/** Compares the model with the engine at every step of random games. */
function lockstep(rules: RuleSet | undefined, games: number, firstSeed: number): number {
  let checked = 0;
  for (let seed = firstSeed; seed < firstSeed + games; seed++) {
    playRandomGame(
      seededRng(seed),
      (before: GameState, move: Move, after: GameState) => {
        const model = stateFromGame(before);
        // Same legal moves.
        if (before.phase === 'exchange') {
          expect(model.phase).toBe(EXCHANGE);
          expect(modelMoves(model)).toEqual(engineExchangeCodes(before));
        } else {
          expect([BID, FIRST_BID]).toContain(model.phase);
          expect(modelMoves(model)).toEqual(engineBidCodes(before));
        }
        // Same move, same outcome.
        const { move: code, take } = codeOfMove(before, move);
        model.apply(code);
        if (move.type === 'bid' && model.phase === TAKE) {
          const bid = {
            tens: move.tens,
            units: move.units,
            ...(move.action ? { action: move.action } : {}),
          };
          const takes = takeOptions(before, bid).map((id) => takeCode(faceOf(id)));
          expect(modelMoves(model)).toEqual(takes.sort((a, b) => a - b));
          expect(take).not.toBeNull();
          model.apply(take as number);
        }
        const expected = stateFromGame(after);
        expect(model.phase).toBe(expected.phase);
        expect(model.winner).toBe(expected.winner);
        if (model.phase === OVER && after.result?.reason === 'noLegalBid') {
          // The model ends the game before the card taken; the rest may differ by that card.
          checked++;
          return;
        }
        expect(model.toMove).toBe(expected.toMove);
        expect(model.latest).toBe(expected.latest);
        expect(model.latestSuits).toBe(expected.latestSuits);
        expect(Array.from(model.hands[0])).toEqual(Array.from(expected.hands[0]));
        expect(Array.from(model.hands[1])).toEqual(Array.from(expected.hands[1]));
        expect(Array.from(model.table)).toEqual(Array.from(expected.table));
        expect(Array.from(model.mask)).toEqual(Array.from(expected.mask));
        expect(Array.from(model.pair)).toEqual(Array.from(expected.pair));
        expect(model.tableCount).toBe(expected.tableCount);
        checked++;
      },
      rules,
    );
  }
  return checked;
}

describe('the search model agrees with the engine', () => {
  it('on legal moves and on every move of 300 random games', () => {
    expect(lockstep(undefined, 300, 1)).toBeGreaterThan(2000);
  });

  it('under every rule variant', () => {
    const variants: Partial<RuleSet>[] = [
      { exchange: false },
      { firstBidTableCard: false },
      { distinctSuits: true },
      { handSize: 10, tableSize: 12 },
      // No table at all: P1 then opens from the hand (with a table card required, P1 never can).
      { tableSize: 0, firstBidTableCard: false },
    ];
    for (const changes of variants) {
      expect(lockstep({ ...STANDARD_RULES, ...changes }, 60, 1000)).toBeGreaterThan(200);
    }
  });

  it('turns each of its moves back into a move the engine accepts', () => {
    let checked = 0;
    for (let seed = 5000; seed < 5100; seed++) {
      playRandomGame(seededRng(seed), (before) => {
        const seat = before.toMove;
        const hand = before.hands[seat];
        const model = stateFromGame(before);
        const n = model.legalMoves(buffer);
        for (let i = 0; i < n; i += 7) {
          const code = buffer[i]!;
          const after = model.clone();
          after.apply(code);
          let take: number | null = null;
          if (after.phase === TAKE) {
            after.legalMoves(buffer, n);
            take = buffer[n]!;
          } else if (before.phase !== 'exchange' && after.phase === OVER) {
            // The game ends at the bid, but a card must still be taken when the table has one.
            const probe = moveOfCode(hand, before.table, code, null);
            if (probe.type === 'bid') {
              const left = takeOptions(before, probe);
              take = left.length > 0 ? takeCode(faceOf(left[0]!)) : null;
            }
          }
          const move = moveOfCode(hand, before.table, code, take);
          expect(validateMove(before, seat, move)).toEqual({ ok: true });
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('knows from a view exactly which cards may be in the hidden part of the opponent hand', () => {
    for (let seed = 7000; seed < 7050; seed++) {
      playRandomGame(seededRng(seed), (before) => {
        for (const seat of [0, 1] as const) {
          const view = viewFor(before, seat);
          const k = knowledgeFromView(view);
          const opponent = 1 - seat;
          const known = new Set(before.known[opponent]);
          const hidden = before.hands[opponent]!.filter((id) => !known.has(id));
          expect(k.hidden).toBe(hidden.length);
          // The hidden cards and the stock are exactly the unseen pool.
          const unseen = Array.from(k.unseen).sort((a, b) => a - b);
          const truth = [...hidden, ...before.stock].map(faceOf).sort((a, b) => a - b);
          expect(unseen).toEqual(truth);
          // The base state holds the seat's hand and the opponent's known cards, nothing else.
          const full = stateFromGame(before);
          expect(Array.from(k.base.hands[seat])).toEqual(Array.from(full.hands[seat]));
          const knownCounts = new Array<number>(FACES).fill(0);
          for (const id of before.known[opponent]!) knownCounts[faceOf(id)]!++;
          expect(Array.from(k.base.hands[opponent]!)).toEqual(knownCounts);
        }
      });
    }
  });
});
