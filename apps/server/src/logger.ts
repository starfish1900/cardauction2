import { pino, type Logger } from 'pino';

export type { Logger };

/** JSON lines on stdout; Render keeps them (7 days on the Hobby workspace). */
export function createLogger(level: string, commit: string | null): Logger {
  return pino({
    level,
    base: { service: 'cardauction-server', ...(commit ? { commit: commit.slice(0, 7) } : {}) },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const silentLogger: Logger = pino({ level: 'silent' });
