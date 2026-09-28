/**
 * Play CardAuction in a terminal against a bot that picks random legal moves.
 *
 *   pnpm play                  random seat, cryptographically shuffled deal
 *   pnpm play --seat p2        play as P2 (you start with the exchange)
 *   pnpm play --seed 42        reproducible deal
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  applyMove,
  cardCode,
  cryptoRng,
  describeMove,
  describeWindow,
  formatCards,
  formatRow,
  legalBids,
  newGame,
  otherSeat,
  parseMove,
  randomMove,
  seatName,
  seededRng,
  validateMove,
  type BidChoice,
  type GameState,
  type MoveError,
  type Seat,
} from '../src/index.js';

const MESSAGES: Record<MoveError, string> = {
  GAME_OVER: 'The game is over.',
  NOT_YOUR_TURN: 'It is not your turn.',
  WRONG_PHASE: 'That move is not allowed now.',
  NOT_A_CARD: 'Unknown card.',
  DUPLICATE_CARD: 'The same card is used twice.',
  NOT_A_DIGIT: 'Tens and units must be digit cards.',
  NOT_AN_ACTION: 'That is not an action card.',
  BAD_COLUMN: 'Action cards go in column 1 (+) or 4 (−).',
  CARD_NOT_IN_HAND: 'That card is not in your hand.',
  CARD_NOT_ON_TABLE: 'That card is not on the table.',
  TABLE_CARD_REQUIRED:
    'Your first bid must use exactly one table card: mark it with t (e.g. t6D, or +t for the action card).',
  ONE_TABLE_CARD_ONLY: 'Only one table card may be used in the first bid.',
  TABLE_CARD_NOT_ALLOWED: 'Only the first bid may use a table card.',
  NO_NEW_COLOR: 'Your bid needs a suit that the latest bid does not have.',
  OUT_OF_RANGE: 'The new number must be 1 to 10 above the (modified) latest bid.',
  TAKE_REQUIRED: 'Add the table card you take: ... take <card>.',
  TAKE_NOT_ALLOWED: 'The table is empty: nothing to take.',
  TAKE_NOT_ON_TABLE: 'You can only take a card that is still on the table.',
};

function bidNotation(state: GameState, bid: BidChoice): string {
  const hand = state.hands[state.toMove];
  const code = (id: number): string => (hand.includes(id) ? '' : 't') + cardCode(id);
  const sign = bid.action
    ? `${bid.action.column === 1 ? '+' : '-'}${hand.includes(bid.action.card) ? '' : 't'} `
    : '';
  return `${sign}${code(bid.tens)} ${code(bid.units)}`;
}

function render(state: GameState, you: Seat): string {
  const opponent = otherSeat(you);
  const lines = [
    '',
    '─'.repeat(72),
    'Bids',
    ...state.bids.map((row) => `  ${formatRow(row)}`),
    state.phase === 'firstBid' || state.phase === 'bid' ? describeWindow(state) : '',
    `Table (${state.table.length}): ${formatCards(state.table)}`,
    `Opponent (${seatName(opponent)}): ${state.hands[opponent].length} cards · known: ${formatCards(state.known[opponent])}`,
    `Your hand (${seatName(you)}, ${state.hands[you].length}): ${formatCards(state.hands[you])}`,
  ];
  return lines.filter((line) => line !== '').join('\n');
}

const HELP = `
Moves (suits: * stars, D diamonds, C clubs, H hearts, S spades; A = action card):
  pass                     keep your hand (P2's opening only)
  swap 5H 3C               P2's opening: give 5♥, take 3♣ from the table
  7* 0H take 9C            bid 70 with 7★ and 0♥, then take 9♣ from the table
  + 7D 0* take 3C          same with an action card in column 1 (+10); "-" is column 4 (−10)
  6D 6D take 2C            both copies of one card: 66 (the two cards may share a suit)
  t6D 3* take 4C           first bid: t marks the table card you use
  +t 7D 0* take 3C         first bid: use the table's action card
  hint                     list some legal bids
  quit`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seat: { type: 'string', default: 'random' },
      seed: { type: 'string' },
    },
  });
  const rng = values.seed !== undefined ? seededRng(Number(values.seed)) : cryptoRng();
  const you: Seat = values.seat === 'p1' ? 0 : values.seat === 'p2' ? 1 : (rng.int(2) as Seat);
  const bot = seededRng(values.seed !== undefined ? Number(values.seed) + 1 : Date.now());
  const io = createInterface({ input: process.stdin, output: process.stdout });
  // An async line iterator buffers input, so piped or pasted lines are never lost.
  const lines = io[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? null : String(next.value);
  };

  let state = newGame(rng);
  console.log(`CardAuction — you are ${seatName(you)}. Type "help" for the move notation.`);
  while (state.result === null) {
    if (state.toMove !== you) {
      const move = randomMove(state, bot);
      console.log(`\n${seatName(state.toMove)} ${describeMove(move, state)}.`);
      state = applyMove(state, state.toMove, move);
      continue;
    }
    console.log(render(state, you));
    if (state.phase === 'exchange')
      console.log('Your opening: "swap <hand card> <table card>" or "pass".');
    if (state.phase === 'firstBid')
      console.log('First bid: use exactly one table card (mark it with t).');
    const answer = await ask('> ');
    if (answer === null) break;
    const text = answer.trim();
    if (text === 'quit') break;
    if (text === 'help' || text === '') {
      console.log(HELP);
      continue;
    }
    if (text === 'hint') {
      if (state.phase === 'exchange') {
        console.log('Pass, or swap one hand card for a table card: swap <hand card> <table card>.');
        continue;
      }
      const bids = legalBids(state);
      const shown = bids.slice(0, 12).map((b) => `  ${bidNotation(state, b)}`);
      if (bids.length > shown.length) shown.push(`  … and ${bids.length - shown.length} more`);
      console.log(`${shown.join('\n')}\nThen add "take <card>" while the table has cards.`);
      continue;
    }
    const move = parseMove(state, you, text);
    if (typeof move === 'string') {
      console.log(`Not understood: ${move}.`);
      continue;
    }
    const check = validateMove(state, you, move);
    if (!check.ok) {
      console.log(MESSAGES[check.error]);
      continue;
    }
    console.log(`You ${describeMove(move, state, 'second')}.`);
    state = applyMove(state, you, move);
  }
  io.close();
  if (state.result) {
    const { winner, reason } = state.result;
    console.log(render(state, you));
    console.log(
      `\nGame over (${reason}): ${winner === null ? 'no winner' : winner === you ? 'you win!' : `${seatName(winner)} wins.`}`,
    );
    console.log(
      `Final hands: P1 ${formatCards(state.hands[0])} · P2 ${formatCards(state.hands[1])}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
