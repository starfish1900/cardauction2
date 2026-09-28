import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { NICKNAME_MAX, NICKNAME_MIN } from '@cardauction/protocol';
import {
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  pattern,
  RegExpMatcher,
} from 'obscenity';

export interface Identity {
  readonly playerId: string;
  readonly nickname: string;
}

/**
 * Guest identities are HMAC-SHA256-signed tokens: `v1.<key id>.<payload>.<signature>`. Checking
 * one needs only the server secret, so there is no database and tokens survive restarts. The key
 * id lets a new secret take over while tokens signed with the previous one stay valid.
 */
export class TokenSigner {
  private readonly keys: ReadonlyMap<string, string>;
  private readonly currentKid: string;

  constructor(secrets: readonly string[]) {
    if (secrets.length === 0) throw new Error('at least one session secret is needed');
    const keys = new Map<string, string>();
    for (const secret of secrets) keys.set(keyId(secret), secret);
    this.keys = keys;
    this.currentKid = keyId(secrets[0] as string);
  }

  sign(identity: Identity, issuedAt: number): string {
    const payload = Buffer.from(
      JSON.stringify({
        p: identity.playerId,
        n: identity.nickname,
        t: Math.floor(issuedAt / 1000),
      }),
    ).toString('base64url');
    const head = `v1.${this.currentKid}.${payload}`;
    return `${head}.${this.mac(this.keys.get(this.currentKid) as string, head)}`;
  }

  /** The identity in a valid token, or null for anything malformed, forged or unknown. */
  verify(token: unknown): Identity | null {
    if (typeof token !== 'string' || token.length > 512) return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const [, kid, payload, signature] = parts as [string, string, string, string];
    const secret = this.keys.get(kid);
    if (!secret) return null;
    const expected = Buffer.from(this.mac(secret, `v1.${kid}.${payload}`));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
      if (typeof data !== 'object' || data === null) return null;
      const { p, n } = data as { p?: unknown; n?: unknown };
      if (typeof p !== 'string' || !/^p[A-Za-z0-9_-]{16,40}$/u.test(p)) return null;
      if (typeof n !== 'string' || normalizeNickname(n) === null) return null;
      return { playerId: p, nickname: n };
    } catch {
      return null;
    }
  }

  private mac(secret: string, text: string): string {
    return createHmac('sha256', secret).update(text).digest('base64url');
  }
}

function keyId(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 8);
}

export function newPlayerId(): string {
  return `p${randomBytes(15).toString('base64url')}`;
}

// Profanity: obscenity's English list (it handles l33t spellings and avoids false positives such
// as "Scunthorpe"), plus a few common French words, since the client is bilingual. The matcher
// collapses repeated letters first (only b, e, g, l, o and s may stay doubled), so the French
// words are listed the same way: "connard" is matched as "conard".
const FRENCH_WORDS = ['merde', 'putain', 'pute', 'salope', 'conard', 'conasse', 'encule', 'nique'];
const profanity = (() => {
  const data = new DataSet<{ originalWord?: string }>().addAll(englishDataset);
  for (const word of FRENCH_WORDS) {
    data.addPhrase((phrase) =>
      phrase.setMetadata({ originalWord: word }).addPattern(pattern`${word}`),
    );
  }
  return new RegExpMatcher({ ...data.build(), ...englishRecommendedTransformers });
})();

const ALLOWED = /^[\p{L}\p{M}\p{N} _\-'.]+$/u;

/**
 * Returns the cleaned nickname (trimmed, single spaces, NFC), or null when it is not acceptable:
 * 2–16 characters from letters, digits, spaces and - _ ' . with at least one letter or digit,
 * and nothing rude.
 */
export function normalizeNickname(raw: string): string | null {
  const text = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = [...text].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return null;
  if (!ALLOWED.test(text) || !/[\p{L}\p{N}]/u.test(text)) return null;
  if (profanity.hasMatch(text)) return null;
  return text;
}

export function guestNickname(): string {
  return `Guest ${randomInt(1000, 10000)}`;
}
