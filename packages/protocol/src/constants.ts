/** Bumped whenever an event or payload changes shape. The server accepts this and the previous one. */
export const PROTOCOL_VERSION = 1;

/** Protocol versions the server accepts: the current one and, once there is one, the previous. */
export const ACCEPTED_PROTOCOLS: readonly number[] = [PROTOCOL_VERSION];

/** Every duration the server enforces, in milliseconds. Clients use them for countdowns. */
export const TIMING = {
  /** Time to make a move (bid and take together, or P2's exchange). */
  turnMs: 60_000,
  /** A move arriving this long after the turn deadline is still accepted (network delay). */
  lateMoveToleranceMs: 1_000,
  /** A disconnected player who is not back within this window forfeits. */
  graceMs: 25_000,
  /** Both matched players must acknowledge the first state within this window. */
  startHandshakeMs: 10_000,
  /** A finished game stays available for the result screen this long. */
  lingerMs: 60_000,
  /** Both players must accept a rematch within this window after the game ends. */
  rematchMs: 30_000,
  /** A player alone in the quick-match queue is offered the AI after this long. */
  aiOfferMs: 30_000,
  /** A private game code stays valid this long. */
  privateCodeMs: 10 * 60_000,
  /** A deleted game still answers late returners with its result this long. */
  tombstoneMs: 10 * 60_000,
  /** Safety-net sweep that checks every game, index and timer. */
  reaperIntervalMs: 30_000,
} as const;

/** Private game codes avoid look-alike characters: no 0, O, 1, I or L. */
export const PRIVATE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PRIVATE_CODE_LENGTH = 6;

/** Messages larger than this are dropped by the transport. */
export const MAX_MESSAGE_BYTES = 4096;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

export const AI_LEVELS = ['easy', 'medium', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];
