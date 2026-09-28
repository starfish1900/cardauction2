import { z } from 'zod';
import { AI_LEVELS } from './constants.js';

/**
 * Payload schemas for every client-to-server event. The server parses each payload with these
 * before anything else; unknown keys are rejected so a typo never passes silently.
 */
const cardId = z.number().int().min(0).max(119);
const gameId = z.string().min(1).max(40);
const cmdId = z.string().min(1).max(64);
const version = z.number().int().min(0);

export const helloSchema = z
  .object({
    protocol: z.number().int(),
    build: z.string().max(64),
    nickname: z.string().max(64).optional(),
  })
  .strict();

export const emptySchema = z.object({}).strict();

export const privateJoinSchema = z.object({ code: z.string().min(1).max(16) }).strict();

export const aiStartSchema = z
  .object({
    level: z.enum(AI_LEVELS),
    seat: z.enum(['P1', 'P2', 'random']),
  })
  .strict();

export const readySchema = z.object({ gameId, version }).strict();

/** P2's opening: both cards to swap, or neither to pass. */
export const exchangeSchema = z
  .object({
    gameId,
    cmdId,
    expectedVersion: version,
    give: cardId.optional(),
    take: cardId.optional(),
  })
  .strict()
  .refine((p) => (p.give === undefined) === (p.take === undefined), {
    message: 'give and take go together; send neither to pass',
  });

export const turnSchema = z
  .object({
    gameId,
    cmdId,
    expectedVersion: version,
    tens: cardId,
    units: cardId,
    action: z
      .object({ card: cardId, column: z.union([z.literal(1), z.literal(4)]) })
      .strict()
      .optional(),
    take: cardId.optional(),
  })
  .strict();

export const resignSchema = z.object({ gameId, cmdId }).strict();

export const rematchSchema = z.object({ gameId, accept: z.boolean() }).strict();

export const gameRefSchema = z.object({ gameId }).strict();

export type HelloPayload = z.infer<typeof helloSchema>;
export type EmptyPayload = z.infer<typeof emptySchema>;
export type PrivateJoinPayload = z.infer<typeof privateJoinSchema>;
export type AiStartPayload = z.infer<typeof aiStartSchema>;
export type ReadyPayload = z.infer<typeof readySchema>;
export type ExchangePayload = z.infer<typeof exchangeSchema>;
export type TurnPayload = z.infer<typeof turnSchema>;
export type ResignPayload = z.infer<typeof resignSchema>;
export type RematchPayload = z.infer<typeof rematchSchema>;
export type GameRefPayload = z.infer<typeof gameRefSchema>;
