import {
  ACTION,
  BID,
  bidCode,
  DIGITS_FROM_HAND,
  EXCHANGE,
  exchangeCode,
  FACES,
  FIRST_BID,
  OVER,
  PASS,
  POP,
  SHIFT_MINUS,
  SHIFT_NONE,
  SHIFT_PLUS,
  shiftOf,
  State,
  TAKE,
  takeCode,
} from './model.js';
import type { Random } from './random.js';

/** Using an action card when the direct window would do costs flexibility later. */
const ACTION_COST = 2;
/** Spending the last card (or last two) of a rank. */
const SCARCE_COST = 0.8;
/** Each fresh suit the opponent still has for a reply. */
const OPEN_SUIT_COST = 0.35;
const KILL = 1000;

/**
 * The playout policy: epsilon-greedy over cheap scores. A bid scores high when the opponent,
 * whose whole hand the determinization knows, cannot answer it at all; otherwise when it leaves
 * them few fresh suits, keeps the action cards and does not spend the last card of a rank. A take
 * favors what the hand lacks (an action card, a missing rank or suit) and what the opponent lacks.
 */
export class Policy {
  private readonly moves = new Int32Array(4096);
  /** For the opponent: per number 0–99, the suits that let them bid it (0: not at all). */
  private readonly replies = new Uint8Array(100);
  /** Suits of `replies` over the ten numbers from each index (a window of ten). */
  private readonly window10 = new Uint8Array(100);
  private readonly window2 = new Uint8Array(100);
  private readonly window4 = new Uint8Array(100);
  private readonly takeScores = new Float64Array(FACES);

  constructor(
    private readonly rng: Random,
    private readonly epsilon: number,
  ) {}

  /** Plays to the end with the policy; returns the winner. */
  playout(s: State): number {
    for (let guard = 0; s.phase !== OVER; guard++) {
      if (guard > 500) throw new Error('a playout did not end');
      s.apply(this.choose(s));
    }
    return s.winner;
  }

  choose(s: State): number {
    switch (s.phase) {
      case BID:
        return this.rng.next() < this.epsilon ? this.randomMove(s) : this.bestBid(s);
      case TAKE:
        return this.rng.next() < this.epsilon ? this.randomMove(s) : this.bestTake(s);
      case FIRST_BID:
        return this.firstBid(s);
      case EXCHANGE:
        return PASS;
      default:
        throw new Error('no move in a finished game');
    }
  }

  randomMove(s: State): number {
    const n = s.legalMoves(this.moves);
    return this.moves[this.rng.int(n)]!;
  }

  /**
   * Fills `replies` for `seat`: the suits with which it could bid each number. A reply to a bid
   * with suits S exists at w exactly when replies[w] has a suit outside S.
   */
  private computeReplies(s: State, seat: number): void {
    const base = seat * 10;
    const r = this.replies;
    for (let t = 0; t < 10; t++) {
      const mt = s.mask[base + t]!;
      for (let u = 0; u < 10; u++) {
        const w = t * 10 + u;
        if (mt === 0) {
          r[w] = 0;
          continue;
        }
        if (t !== u) {
          const mu = s.mask[base + u]!;
          r[w] = mu === 0 ? 0 : mt | mu;
        } else {
          r[w] = POP[mt]! >= 2 ? mt : s.pair[base + t]!;
        }
      }
    }
    // Ten-wide windows by doubling: 2, 4, 8, then 8 + 2.
    const w2 = this.window2;
    for (let i = 0; i < 100; i++) w2[i] = r[i]! | r[(i + 1) % 100]!;
    const w4 = this.window4;
    for (let i = 0; i < 100; i++) w4[i] = w2[i]! | w2[(i + 2) % 100]!;
    for (let i = 0; i < 100; i++) {
      this.window10[i] = w4[i]! | w4[(i + 4) % 100]! | w2[(i + 8) % 100]!;
    }
  }

  /** Suits the opponent could answer a bid of `value` with (over all its windows). */
  private answerSuits(value: number, withAction: boolean): number {
    const w = this.window10;
    let suits = w[(value + 1) % 100]!;
    if (withAction) suits |= w[(value + 91) % 100]! | w[(value + 11) % 100]!;
    return suits;
  }

  bestBid(s: State): number {
    const seat = s.toMove;
    const opponent = 1 - seat;
    if (s.distinct) return this.bestBidSlow(s);
    this.computeReplies(s, opponent);
    const opponentAction = s.hands[opponent]![ACTION]! > 0;
    const fresh = ~s.latestSuits & 31;
    const base = seat * 10;
    const hand = s.hands[seat]!;
    const shifts = hand[ACTION]! > 0 ? 3 : 1;
    let best = -Infinity;
    let bestMove = 0;
    for (let shift = SHIFT_NONE; shift < shifts; shift++) {
      const reference =
        (s.latest + (shift === SHIFT_PLUS ? 10 : shift === SHIFT_MINUS ? 90 : 0)) % 100;
      const shiftCost = shift === SHIFT_NONE ? 0 : ACTION_COST;
      for (let step = 1; step <= 10; step++) {
        const v = (reference + step) % 100;
        const t = (v / 10) | 0;
        const u = v % 10;
        const mt = s.mask[base + t]!;
        if (mt === 0) continue;
        const mu = s.mask[base + u]!;
        if (mu === 0) continue;
        const answer = this.answerSuits(v, opponentAction);
        const scarce =
          t === u
            ? s.rankCount(seat, t) <= 2
              ? SCARCE_COST
              : 0
            : (s.rankCount(seat, t) <= 1 ? SCARCE_COST : 0) +
              (s.rankCount(seat, u) <= 1 ? SCARCE_COST : 0);
        for (let s1 = 0; s1 < 5; s1++) {
          if (((mt >> s1) & 1) === 0) continue;
          for (let s2 = 0; s2 < 5; s2++) {
            if (((mu >> s2) & 1) === 0) continue;
            if ((((fresh >> s1) | (fresh >> s2)) & 1) === 0) continue;
            const f1 = s1 * 10 + t;
            const f2 = s2 * 10 + u;
            if (f1 === f2 && hand[f1]! < 2) continue;
            const open = answer & ~((1 << s1) | (1 << s2)) & 31;
            const score =
              (open === 0 ? KILL : -POP[open]! * OPEN_SUIT_COST) -
              shiftCost -
              scarce +
              this.rng.next() * 0.9;
            if (score > best) {
              best = score;
              bestMove = bidCode(f1, f2, shift, 0, DIGITS_FROM_HAND);
            }
          }
        }
      }
    }
    return bestMove;
  }

  /** The distinct-suits variant: exact checks through the model (the balance lab only). */
  private bestBidSlow(s: State): number {
    const n = s.legalMoves(this.moves);
    const seat = s.toMove;
    const probe = new State();
    let best = -Infinity;
    let bestMove = this.moves[0]!;
    for (let i = 0; i < n; i++) {
      const m = this.moves[i]!;
      probe.copyFrom(s);
      probe.apply(m);
      const kill = probe.phase === OVER && probe.winner === seat;
      const score =
        (kill ? KILL : 0) - (shiftOf(m) === SHIFT_NONE ? 0 : ACTION_COST) + this.rng.next();
      if (score > best) {
        best = score;
        bestMove = m;
      }
    }
    return bestMove;
  }

  /** The take's worth for the player to move, without the random part (stable for the tree). */
  takeScore(s: State, face: number, suits: number): number {
    const seat = s.toMove;
    if (face === ACTION) {
      const held = s.hands[seat]![ACTION]!;
      return held === 0 ? 3 : held === 1 ? 1.5 : 0.3;
    }
    const r = face % 10;
    const held = s.rankCount(seat, r);
    let score = held === 0 ? 2.5 : held === 1 ? 1.2 : 0.3;
    if (((suits >> ((face / 10) | 0)) & 1) === 0) score += 0.8;
    if (s.rankCount(1 - seat, r) === 0) score += 0.4;
    return score;
  }

  private suitsHeld(s: State): number {
    let suits = 0;
    for (let r = 0; r < 10; r++) suits |= s.mask[s.toMove * 10 + r]!;
    return suits;
  }

  /**
   * The `width` best takes by score (ties by face), for the tree below the root: the search then
   * spends its iterations on bids rather than on near-equal takes.
   */
  topTakes(s: State, width: number, out: Int32Array): number {
    const suits = this.suitsHeld(s);
    let n = 0;
    const scores = this.takeScores;
    for (let f = 0; f < FACES; f++) {
      if (s.table[f]! === 0) continue;
      const score = this.takeScore(s, f, suits);
      // Insertion into the short sorted list.
      let i = Math.min(n, width);
      if (i === width && score <= scores[width - 1]!) continue;
      if (i === width) i = width - 1;
      while (i > 0 && scores[i - 1]! < score) {
        scores[i] = scores[i - 1]!;
        out[i] = out[i - 1]!;
        i--;
      }
      scores[i] = score;
      out[i] = takeCode(f);
      if (n < width) n++;
    }
    return n;
  }

  bestTake(s: State): number {
    const suits = this.suitsHeld(s);
    let best = -Infinity;
    let bestFace = -1;
    for (let f = 0; f < FACES; f++) {
      if (s.table[f]! === 0) continue;
      const score = this.takeScore(s, f, suits) + this.rng.next() * 0.5;
      if (score > best) {
        best = score;
        bestFace = f;
      }
    }
    return takeCode(bestFace);
  }

  /** P1's first bid: rather without an action card; it happens once, so a plain choice will do. */
  firstBid(s: State): number {
    const n = s.legalFirstBids(this.moves, 0, false);
    if (n === 0) throw new Error('no first bid');
    let plain = 0;
    for (let i = 0; i < n; i++) if (shiftOf(this.moves[i]!) === SHIFT_NONE) plain++;
    if (plain > 0 && this.rng.next() < 0.75) {
      let k = this.rng.int(plain);
      for (let i = 0; i < n; i++) {
        if (shiftOf(this.moves[i]!) !== SHIFT_NONE) continue;
        if (k-- === 0) return this.moves[i]!;
      }
    }
    return this.moves[this.rng.int(n)]!;
  }
}

/**
 * How many of the 100 possible latest numbers `seat` could answer, counting ranks only: a
 * measure of how flexible a hand is, with and without its action cards.
 */
export function coverage(s: State, seat: number): number {
  const counts = new Uint8Array(10);
  for (let r = 0; r < 10; r++) counts[r] = s.rankCount(seat, r);
  const make = new Uint8Array(200);
  for (let v = 0; v < 100; v++) {
    const t = (v / 10) | 0;
    const u = v % 10;
    const ok = t !== u ? counts[t]! > 0 && counts[u]! > 0 : counts[t]! >= 2;
    make[v] = make[v + 100] = ok ? 1 : 0;
  }
  // prefix[i] = makeable numbers among 0..i-1 of the doubled circle
  const prefix = new Int32Array(201);
  for (let i = 0; i < 200; i++) prefix[i + 1] = prefix[i]! + make[i]!;
  // Without an action card the answers lie in latest + 1 … latest + 10; with one, in
  // latest − 9 … latest + 20.
  const wide = s.hands[seat]![ACTION]! > 0;
  const length = wide ? 30 : 10;
  let covered = 0;
  for (let latest = 0; latest < 100; latest++) {
    const start = (latest + (wide ? 91 : 1)) % 100;
    if (prefix[start + length]! - prefix[start]! > 0) covered++;
  }
  return covered;
}

/**
 * P2's exchange options, best first by the coverage they leave P2's hand (plus a little for an
 * action card), keeping `limit` of them; passing always stays first in the list.
 */
export function rankedExchanges(s: State, limit: number): number[] {
  const scored: { move: number; score: number }[] = [];
  const probe = new State();
  for (let give = 0; give < FACES; give++) {
    if (s.hands[1][give]! === 0) continue;
    for (let take = 0; take < FACES; take++) {
      if (take === give || s.table[take]! === 0) continue;
      probe.copyFrom(s);
      probe.remove(1, give);
      probe.add(1, take);
      const actions = probe.hands[1][ACTION]!;
      const score = coverage(probe, 1) + (actions > 0 ? 2 : 0) + Math.min(actions, 2);
      scored.push({ move: exchangeCode(give, take), score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.move - b.move);
  return [PASS, ...scored.slice(0, limit).map((x) => x.move)];
}
