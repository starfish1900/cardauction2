/**
 * Random number sources.
 *
 * Production deals use {@link cryptoRng}, backed by the Web Crypto API (available in Node and in
 * browsers). Tests, simulations and the AI use {@link seededRng}, a fast and reproducible
 * generator that must never deal real games: its state can be inferred from its output.
 */

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

function checkBound(maxExclusive: number): void {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`bad bound ${maxExclusive}`);
  }
}

/** Unbiased integer from a stream of uniform 32-bit words, by rejection sampling. */
function uniformInt(next32: () => number, maxExclusive: number): number {
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  for (;;) {
    const word = next32();
    if (word < limit) return word % maxExclusive;
  }
}

/** Cryptographically secure source for real deals. */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(256);
  let index = buffer.length;
  const next32 = (): number => {
    if (index >= buffer.length) {
      globalThis.crypto.getRandomValues(buffer);
      index = 0;
    }
    return buffer[index++] ?? 0;
  };
  return {
    int(maxExclusive) {
      checkBound(maxExclusive);
      return uniformInt(next32, maxExclusive);
    },
  };
}

/** Reproducible source (sfc32 seeded through splitmix32). Not for real deals. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const next32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) next32();
  return {
    int(maxExclusive) {
      checkBound(maxExclusive);
      return uniformInt(next32, maxExclusive);
    },
  };
}

/** In-place Fisher–Yates shuffle. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new RangeError('cannot pick from an empty list');
  return items[rng.int(items.length)] as T;
}
