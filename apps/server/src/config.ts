import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Signs guest tokens. Required in production (Render generates it). At least 32 characters. */
  SESSION_SECRET: z.string().min(32).optional(),
  /** The previous secret, still accepted for verification while tokens rotate. */
  SESSION_SECRET_PREVIOUS: z.string().min(32).optional(),
  /** Comma-separated browser origins allowed to connect; empty allows any (development). */
  CORS_ORIGIN: z.string().default(''),
  MAX_GAMES: z.coerce.number().int().positive().default(250),
  MAX_AI_GAMES: z.coerce.number().int().nonnegative().default(5),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().positive().default(20),
  /** AI worker threads; 0 runs the AI on the main thread (tests). Render's small instances: 1. */
  AI_THREADS: z.coerce.number().int().min(0).max(16).default(1),
  /** Longest AI search, whatever the level's budget (a slow instance thinks longer). */
  AI_MAX_THINK_MS: z.coerce.number().int().min(100).max(30_000).default(8_000),
  /** memory: games live only in this process. A Key Value store is milestone M4 (postponed). */
  STATE_STORE: z.enum(['memory']).default('memory'),
  /** Bearer tokens for /metrics and /admin; the endpoints are off when unset. */
  METRICS_TOKEN: z.string().min(16).optional(),
  ADMIN_TOKEN: z.string().min(16).optional(),
  /**
   * Header holding the client's address, set by the proxy in front of the server (on Render,
   * which sits behind Cloudflare: true-client-ip). Unset: the TCP peer's address.
   */
  CLIENT_IP_HEADER: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Set by Render: the deployed commit, reported by /healthz and in logs. */
  RENDER_GIT_COMMIT: z.string().optional(),
});

export interface Config {
  readonly production: boolean;
  readonly port: number;
  readonly host: string;
  readonly sessionSecrets: readonly string[];
  readonly corsOrigins: readonly string[];
  readonly maxGames: number;
  readonly maxAiGames: number;
  readonly maxConnectionsPerIp: number;
  readonly aiThreads: number;
  readonly aiMaxThinkMs: number;
  readonly stateStore: 'memory';
  readonly metricsToken: string | null;
  readonly adminToken: string | null;
  /** Lower-case header name, or null to use the TCP peer's address. */
  readonly clientIpHeader: string | null;
  readonly logLevel: string;
  readonly commit: string | null;
}

/** Reads the environment. Throws with a readable message when a variable is invalid. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`invalid environment: ${problems.join('; ')}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && !e.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }
  // Without a secret (development only), tokens are valid until the process restarts.
  const secret = e.SESSION_SECRET ?? randomBytes(32).toString('base64url');
  return {
    production,
    port: e.PORT,
    host: e.HOST,
    sessionSecrets: [secret, ...(e.SESSION_SECRET_PREVIOUS ? [e.SESSION_SECRET_PREVIOUS] : [])],
    corsOrigins: e.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    maxGames: e.MAX_GAMES,
    maxAiGames: e.MAX_AI_GAMES,
    maxConnectionsPerIp: e.MAX_CONNECTIONS_PER_IP,
    aiThreads: e.AI_THREADS,
    aiMaxThinkMs: e.AI_MAX_THINK_MS,
    stateStore: e.STATE_STORE,
    metricsToken: e.METRICS_TOKEN ?? null,
    adminToken: e.ADMIN_TOKEN ?? null,
    clientIpHeader: e.CLIENT_IP_HEADER.trim().toLowerCase() || null,
    logLevel: e.LOG_LEVEL,
    commit: e.RENDER_GIT_COMMIT ?? null,
  };
}
