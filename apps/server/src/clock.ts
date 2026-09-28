/**
 * Time source for everything the server schedules. Production uses the system clock; tests inject
 * a ManualClock and move time forward explicitly, so a 25 s grace period or a 60 s turn takes no
 * real time and every deadline fires in a known order.
 */
export interface TimerHandle {
  readonly __timer: true;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle | null): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) =>
    setTimeout(callback, Math.max(0, delayMs)) as unknown as TimerHandle,
  clearTimeout: (handle) => {
    if (handle) clearTimeout(handle as unknown as NodeJS.Timeout);
  },
};

interface ManualTimer extends TimerHandle {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/** A clock that only moves when told to. Timers fire in deadline order, then creation order. */
export class ManualClock implements Clock {
  private time: number;
  private nextId = 1;
  private readonly timers = new Map<number, ManualTimer>();

  constructor(start = Date.UTC(2026, 8, 27, 12, 0, 0)) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    const timer: ManualTimer = {
      __timer: true,
      id: this.nextId++,
      at: this.time + Math.max(0, delayMs),
      callback,
    };
    this.timers.set(timer.id, timer);
    return timer;
  }

  clearTimeout(handle: TimerHandle | null): void {
    if (handle) this.timers.delete((handle as ManualTimer).id);
  }

  /** Moves time forward, firing every timer that falls due on the way. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let next: ManualTimer | undefined;
      for (const timer of this.timers.values()) {
        if (
          timer.at <= target &&
          (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id))
        ) {
          next = timer;
        }
      }
      if (!next) break;
      this.timers.delete(next.id);
      this.time = Math.max(this.time, next.at);
      next.callback();
    }
    this.time = target;
  }

  /** Number of armed timers, for leak checks. */
  get pending(): number {
    return this.timers.size;
  }
}
