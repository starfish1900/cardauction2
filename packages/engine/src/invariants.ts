import { DECK_SIZE, isDigit, suitOf, type CardId } from './cards.js';
import { effectiveValue, hasNewColor, inWindow } from './rules.js';
import { STOCK_SIZE } from './setup.js';
import { P1, P2, type GameState } from './state.js';

/**
 * Checks everything that must hold in any reachable state. Returns human-readable violations
 * (empty when the state is sound). Used by the tests and by the random-play simulator.
 */
export function findViolations(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<CardId, string>();
  const place = (id: CardId, where: string): void => {
    const previous = seen.get(id);
    if (previous !== undefined) problems.push(`card ${id} is both in ${previous} and in ${where}`);
    seen.set(id, where);
  };
  state.hands[0].forEach((id) => place(id, 'P1 hand'));
  state.hands[1].forEach((id) => place(id, 'P2 hand'));
  state.table.forEach((id) => place(id, 'table'));
  state.stock.forEach((id) => place(id, 'stock'));
  state.bids.forEach((row, i) => {
    place(row.tens, `bid ${i}`);
    place(row.units, `bid ${i}`);
    if (row.modifier) place(row.modifier.card, `modifier on bid ${i}`);
  });
  if (seen.size !== DECK_SIZE) problems.push(`${seen.size} distinct cards instead of ${DECK_SIZE}`);
  for (const id of seen.keys()) {
    if (!Number.isInteger(id) || id < 0 || id >= DECK_SIZE) problems.push(`bad card id ${id}`);
  }
  if (state.stock.length !== STOCK_SIZE) problems.push(`stock has ${state.stock.length} cards`);

  for (const seat of [P1, P2] as const) {
    for (const id of state.known[seat]) {
      if (!state.hands[seat].includes(id)) problems.push(`known card ${id} is not in hand ${seat}`);
    }
  }

  const bidsBy = [0, 0];
  state.bids.forEach((row, i) => {
    if (!isDigit(row.tens) || !isDigit(row.units)) problems.push(`bid ${i} uses a non-digit card`);
    if (i === 0) {
      if (row.by !== null) problems.push('the starting number has a bidder');
      return;
    }
    if (row.by === null) {
      problems.push(`bid ${i} has no bidder`);
      return;
    }
    bidsBy[row.by] = (bidsBy[row.by] ?? 0) + 1;
    const previous = state.bids[i - 1];
    if (!previous) return;
    if (suitOf(row.tens) === suitOf(row.units)) problems.push(`bid ${i} repeats a suit`);
    if (!hasNewColor(previous, row.tens, row.units)) problems.push(`bid ${i} brings no new suit`);
    if (!inWindow(effectiveValue(previous), row.value)) problems.push(`bid ${i} is out of range`);
    if (previous.modifier && previous.modifier.by !== row.by) {
      problems.push(`the action card on bid ${i - 1} was not played by the next bidder`);
    }
    const expected = i % 2 === 1 ? P1 : P2;
    if (row.by !== expected) problems.push(`bid ${i} was made by the wrong seat`);
  });
  const lastRow = state.bids[state.bids.length - 1];
  if (lastRow?.modifier) problems.push('the latest bid carries an action card');
  if (bidsBy[0] !== state.bidCount[0] || bidsBy[1] !== state.bidCount[1]) {
    problems.push('bid counters do not match the bid rows');
  }

  if (state.result === null && state.phase === 'over') problems.push('over without a result');
  if (state.result !== null && state.phase !== 'over') problems.push('a result before the end');
  if (state.phase === 'exchange' && (state.toMove !== P2 || state.moveCount !== 0)) {
    problems.push('the exchange belongs to P2 at move 0');
  }
  if (state.phase === 'firstBid' && (state.toMove !== P1 || state.bids.length !== 1)) {
    problems.push('the first bid belongs to P1 before any other bid');
  }
  if (state.phase === 'bid' && state.bids.length < 2) problems.push('bid phase without a bid');
  return problems;
}
