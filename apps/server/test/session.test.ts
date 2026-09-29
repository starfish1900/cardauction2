import { PROTOCOL_VERSION } from '@cardauction/protocol';
import { io as connect } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { normalizeNickname, TokenSigner } from '../src/session.js';
import { closeAll, startServer, TestClient, until, type TestServer } from './harness.js';

let t: TestServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  await closeAll(...clients.splice(0));
  if (t) {
    await until(() => t?.server.players.count === 0);
    await t.close();
    t = null;
  }
});

describe('guest tokens', () => {
  const signer = new TokenSigner(['a'.repeat(40)]);
  const identity = { playerId: 'pAAAAAAAAAAAAAAAAAAAA', nickname: 'Ada' };

  it('round-trip, and reject forgeries and garbage', () => {
    const token = signer.sign(identity, Date.now());
    expect(signer.verify(token)).toEqual(identity);
    const [v, kid, payload, signature] = token.split('.') as [string, string, string, string];
    const forged = Buffer.from(JSON.stringify({ p: identity.playerId, n: 'Admin', t: 0 })).toString(
      'base64url',
    );
    expect(signer.verify(`${v}.${kid}.${forged}.${signature}`)).toBeNull();
    const tampered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(signer.verify(`${v}.${kid}.${payload}.${tampered}`)).toBeNull();
    expect(signer.verify(new TokenSigner(['b'.repeat(40)]).sign(identity, 0))).toBeNull();
    for (const junk of [undefined, 42, '', 'v1', 'a.b.c.d', 'x'.repeat(600)])
      expect(signer.verify(junk)).toBeNull();
  });

  it('stay valid through a secret rotation', () => {
    const old = signer.sign(identity, Date.now());
    const rotated = new TokenSigner(['c'.repeat(40), 'a'.repeat(40)]);
    expect(rotated.verify(old)).toEqual(identity);
    expect(rotated.sign(identity, 0).split('.')[1]).not.toBe(old.split('.')[1]);
  });
});

describe('nicknames', () => {
  it("are 2–16 letters, digits, spaces or - _ ' . and polite", () => {
    expect(normalizeNickname('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(normalizeNickname('Zoé-Marie_2')).toBe('Zoé-Marie_2');
    expect(normalizeNickname("D'Artagnan")).toBe("D'Artagnan");
    for (const bad of [
      'A',
      'x'.repeat(17),
      '<script>',
      '   ',
      '---',
      'sh1thead',
      'Connard',
      'CONNASSE',
    ]) {
      expect(normalizeNickname(bad)).toBeNull();
    }
    expect(normalizeNickname('Scunthorpe')).toBe('Scunthorpe');
  });
});

describe('session.hello', () => {
  it('gives a first-time player an identity and a token that brings them back', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url);
    clients.push(a);
    expect(a.playerId).toMatch(/^p/);
    expect(a.nickname).toMatch(/^Guest \d{4}$/);
    expect(a.token).toBeTruthy();
    const again = await TestClient.connect(t.url, { token: a.token });
    clients.push(again);
    expect(again.playerId).toBe(a.playerId);
    expect(again.token).toBeNull(); // nothing new to store
  });

  it('changes the nickname and issues a new token; refuses bad nicknames', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url, { nickname: 'Ada' });
    clients.push(a);
    const first = a.token;
    const renamed = await a.hello('Ada L.');
    expect(renamed.ok && renamed.nickname).toBe('Ada L.');
    expect(a.token).not.toBe(first);
    expect(await a.hello('x')).toEqual({ ok: false, code: 'BAD_NICKNAME' });
  });

  it('treats a forged token as a first visit', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url, { token: 'v1.00000000.e30.AAAA' });
    clients.push(a);
    expect(a.token).toBeTruthy();
  });

  it('refuses an old protocol version with a notice to reload', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url);
    clients.push(a);
    const reply = await a.emit('session.hello', { protocol: PROTOCOL_VERSION + 99, build: 'old' });
    expect(reply).toEqual({ ok: false, code: 'UPDATE_REQUIRED' });
    expect(await a.take('server.notice')).toMatchObject({ kind: 'update-required' });
  });
});

describe('the message gate', () => {
  it('requires a session, a valid payload and a reasonable pace', async () => {
    t = await startServer();
    const raw = connect(t.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve) => raw.once('connect', () => resolve()));
    const ask = (event: string, payload: unknown): Promise<unknown> =>
      new Promise((resolve) => {
        raw.emit(event, payload, resolve);
      });
    expect(await ask('lobby.quick.join', {})).toEqual({ ok: false, code: 'NO_SESSION' });
    expect(await ask('session.hello', { protocol: PROTOCOL_VERSION })).toEqual({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(
      await ask('session.hello', { protocol: PROTOCOL_VERSION, build: 'x', extra: 1 }),
    ).toEqual({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await ask('session.hello', { protocol: PROTOCOL_VERSION, build: 'x' })).toMatchObject({
      ok: true,
    });
    expect(
      await ask('game.turn', { gameId: 'g', cmdId: 'c', expectedVersion: 1, tens: 500, units: 1 }),
    ).toEqual({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(
      await ask('game.exchange', { gameId: 'g', cmdId: 'c', expectedVersion: 1, give: 3 }),
    ).toEqual({
      ok: false,
      code: 'BAD_REQUEST',
    });

    // The bucket holds 20 messages and refills at 10 a second of (manual) time.
    const replies = await Promise.all(
      Array.from({ length: 30 }, () => ask('lobby.quick.leave', {})),
    );
    const limited = replies.filter((r) => (r as { code?: string }).code === 'RATE_LIMITED').length;
    expect(limited).toBeGreaterThan(0);
    t.clock.advance(2_000);
    expect(await ask('lobby.quick.leave', {})).toEqual({ ok: true });
    raw.disconnect();
  });

  it('drops messages over 4 KB by closing the connection', async () => {
    t = await startServer();
    const a = await TestClient.connect(t.url);
    clients.push(a);
    const closed = new Promise<void>((resolve) => a.socket.once('disconnect', () => resolve()));
    a.socket.emit(
      'session.hello',
      { protocol: PROTOCOL_VERSION, build: 'x'.repeat(5000) },
      () => {},
    );
    await closed;
  });

  it('refuses browsers from other origins and too many connections from one address', async () => {
    t = await startServer({
      config: { corsOrigins: ['https://cardauction.example'], maxConnectionsPerIp: 2 },
    });
    const refused = connect(t.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: 'https://evil.example' },
    });
    await new Promise<void>((resolve) => refused.once('connect_error', () => resolve()));
    refused.close();
    const a = await TestClient.connect(t.url);
    const b = await TestClient.connect(t.url);
    clients.push(a, b);
    await expect(TestClient.connect(t.url)).rejects.toThrow();
    expect(t.server.metrics.rejectedConnections).toBe(2);
  });

  it('accepts browsers from every address listed in CORS_ORIGIN, and only those', async () => {
    const { corsOrigins } = loadConfig({
      CORS_ORIGIN:
        'https://cardauction.ca,https://www.cardauction.ca,https://cardauction-web.onrender.com',
    });
    expect(corsOrigins).toHaveLength(3);
    t = await startServer({ config: { corsOrigins } });
    for (const origin of [...corsOrigins, 'https://evil.example']) {
      const socket = connect(t.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { origin },
      });
      const accepted = await new Promise<boolean>((resolve) => {
        socket.once('connect', () => resolve(true));
        socket.once('connect_error', () => resolve(false));
      });
      socket.close();
      expect(accepted, origin).toBe(origin !== 'https://evil.example');
    }
    expect(t.server.metrics.rejectedConnections).toBe(1);
  });
});
