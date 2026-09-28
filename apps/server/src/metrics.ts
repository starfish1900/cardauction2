import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { EndReason } from '@cardauction/engine';

/** Counters since the process started. Gauges are computed on demand by the server. */
export class Metrics {
  gamesCreated = 0;
  aiGamesCreated = 0;
  startsCancelled = 0;
  readonly ended: Record<EndReason, number> = {
    noLegalBid: 0,
    resign: 0,
    timeout: 0,
    forfeit: 0,
    abandoned: 0,
    aborted: 0,
  };
  gamesDisposed = 0;
  rematches = 0;
  connections = 0;
  rejectedConnections = 0;
  badRequests = 0;
  rateLimited = 0;
  internalErrors = 0;
  /** Problems the reaper had to fix: each one is a bug to investigate. */
  reaperFixes = 0;

  private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

  startEventLoopMonitor(): void {
    if (this.histogram) return;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();
  }

  stopEventLoopMonitor(): void {
    this.histogram?.disable();
    this.histogram = null;
  }

  /** Event-loop delay percentiles in ms since the last reset. */
  eventLoopDelay(reset: boolean): { p50: number; p99: number; max: number } {
    const h = this.histogram;
    if (!h || h.count === 0) return { p50: 0, p99: 0, max: 0 };
    const ms = (ns: number): number => Math.round((ns / 1e6) * 10) / 10;
    const result = { p50: ms(h.percentile(50)), p99: ms(h.percentile(99)), max: ms(h.max) };
    if (reset) h.reset();
    return result;
  }

  counters(): Record<string, number | Record<string, number>> {
    return {
      gamesCreated: this.gamesCreated,
      aiGamesCreated: this.aiGamesCreated,
      startsCancelled: this.startsCancelled,
      ended: { ...this.ended },
      gamesDisposed: this.gamesDisposed,
      rematches: this.rematches,
      connections: this.connections,
      rejectedConnections: this.rejectedConnections,
      badRequests: this.badRequests,
      rateLimited: this.rateLimited,
      internalErrors: this.internalErrors,
      reaperFixes: this.reaperFixes,
    };
  }
}
