import type { Clock } from './clock.js';

/** Classic token bucket: `capacity` tokens, refilled continuously at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly clock: Clock,
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity;
    this.updatedAt = clock.now();
  }

  take(count = 1): boolean {
    const now = this.clock.now();
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }

  /** True when the bucket is full again, so a keyed map can forget it. */
  idle(): boolean {
    this.take(0);
    return this.tokens >= this.capacity;
  }
}

/** One bucket per key (an IP address, say), forgotten once full again. */
export class KeyedBuckets {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly clock: Clock,
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {}

  take(key: string): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.clock, this.capacity, this.perSecond);
      this.buckets.set(key, bucket);
    }
    return bucket.take();
  }

  /** Drops buckets that have refilled; called by the reaper. */
  prune(): void {
    for (const [key, bucket] of this.buckets) if (bucket.idle()) this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }
}

/** Per-socket limits from the plan: about 10 messages a second, bursts of 20. */
export const SOCKET_RATE = { capacity: 20, perSecond: 10 } as const;
/** Private-code guesses per IP: 10 a minute. */
export const CODE_GUESS_RATE = { capacity: 10, perSecond: 10 / 60 } as const;
/** A socket that keeps sending after this many refusals in a row is disconnected. */
export const MAX_REFUSALS_IN_A_ROW = 100;
