import type { MoveError } from '@cardauction/engine';

/** Why the server refused a request. Rule violations reuse the engine's codes. */
export type ErrorCode =
  | MoveError
  /** The payload does not match the event's schema. */
  | 'BAD_REQUEST'
  /** Send session.hello first. */
  | 'NO_SESSION'
  /** This client speaks a protocol version the server no longer accepts: reload. */
  | 'UPDATE_REQUIRED'
  /** Too many messages; slow down. */
  | 'RATE_LIMITED'
  /** The server is at its game limits; try again later. */
  | 'SERVER_BUSY'
  /** The server is restarting and takes no new games. */
  | 'DRAINING'
  /** Nicknames are 2–16 letters, digits, spaces or - _ ' . and must be polite. */
  | 'BAD_NICKNAME'
  /** A player has at most one game in progress. */
  | 'ALREADY_IN_GAME'
  /** Unknown or expired private code. */
  | 'CODE_NOT_FOUND'
  /** The player who created the code is away; try again in a moment. */
  | 'CODE_HOST_AWAY'
  /** You cannot join your own private game. */
  | 'OWN_CODE'
  /** No such game, or not yours. */
  | 'GAME_NOT_FOUND'
  /** Both players have not confirmed the start yet. */
  | 'NOT_STARTED'
  /** The command was based on an older version; the reply carries the current view. */
  | 'STALE'
  /** The game is still being played: resign instead of leaving. */
  | 'GAME_IN_PROGRESS'
  /** The rematch window has closed, or the opponent left. */
  | 'REMATCH_CLOSED'
  /** Unexpected server error; the game concerned has been ended. */
  | 'INTERNAL';
