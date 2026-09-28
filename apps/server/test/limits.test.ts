import { TIMING } from '@cardauction/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { addressKey } from '../src/address.js';
import { closeAll, startServer, TestClient, until, type TestServer } from './harness.js';

let t: TestServer | null = null;
const clients: TestClient[] = [];
const raw: WebSocket[] = [];

afterEach(async () => {
  for (const ws of raw.splice(0)) ws.close();
  await closeAll(...clients.splice(0));
  if (t) {
    const server = t;
    await until(() => server.server.players.count === 0);
    await server.close();
    t = null;
  }
});

function openRaw(url: string, headers: Record<string, string> = {}): Promise<WebSocket> {
  // An engine.io connection that never joins the Socket.IO namespace.
  const ws = new WebSocket(`${url.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`, {
    headers,
  });
  raw.push(ws);
  return new Promise((resolve) => {
    ws.addEventListener('message', () => resolve(ws), { once: true });
    ws.addEventListener('close', () => resolve(ws), { once: true });
  });
}

describe('addresses', () => {
  it('key IPv4 by address and IPv6 by /64 network', () => {
    expect(addressKey('203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:0db8:0001:0002:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});

describe('connections per address', () => {
  it('count connections that never join the namespace, and bursts', async () => {
    t = await startServer({ config: { maxConnectionsPerIp: 3 } });
    await Promise.all([openRaw(t.url), openRaw(t.url), openRaw(t.url)]);
    await expect(TestClient.connect(t.url)).rejects.toThrow();
    expect(t.server.metrics.rejectedConnections).toBeGreaterThan(0);
    for (const ws of raw.splice(0)) ws.close();
    await until(() => (t?.server.io.engine.clientsCount ?? 1) === 0);
    const burst = await Promise.allSettled(
      Array.from({ length: 8 }, () => TestClient.connect(t?.url ?? '')),
    );
    const admitted = burst.filter((r) => r.status === 'fulfilled');
    for (const r of admitted) clients.push(r.value);
    expect(admitted).toHaveLength(3);
  });

  it('ignore X-Forwarded-For, which clients can forge', async () => {
    t = await startServer({ config: { maxConnectionsPerIp: 2 } });
    const forged = (n: number): Promise<WebSocket> =>
      openRaw(t?.url ?? '', { 'x-forwarded-for': `198.51.100.${n}` });
    await Promise.all([forged(1), forged(2)]);
    await expect(TestClient.connect(t.url)).rejects.toThrow();
  });

  it('use the configured proxy header when there is one', async () => {
    t = await startServer({ config: { maxConnectionsPerIp: 1, clientIpHeader: 'true-client-ip' } });
    const via = (address: string): Promise<WebSocket> =>
      openRaw(t?.url ?? '', { 'true-client-ip': address });
    const [a, b] = await Promise.all([via('198.51.100.1'), via('198.51.100.2')]);
    expect(a.readyState).toBe(WebSocket.OPEN);
    expect(b.readyState).toBe(WebSocket.OPEN);
    const third = await via('198.51.100.1');
    await until(() => third.readyState === WebSocket.CLOSED);
  });
});

describe('private codes cannot pile up', () => {
  it('a host away for 25 s loses the code; one back in time keeps it', async () => {
    t = await startServer();
    const server = t;
    const [host, friend] = [await TestClient.connect(t.url), await TestClient.connect(t.url)];
    clients.push(host, friend);
    const created = await host.emit('lobby.private.create', {});
    if (!created.ok) throw new Error(created.code);
    await host.disconnect();
    await until(() => !server.server.players.isConnected(host.playerId));
    t.clock.advance(TIMING.graceMs - 1_000);
    const back = await host.reconnect();
    expect(back.ok && back.privateCode).toEqual({
      code: created.code,
      expiresAt: created.expiresAt,
    });
    t.clock.advance(5_000);
    expect(t.server.lobby.openCodes).toBe(1);

    await host.disconnect();
    await until(() => !server.server.players.isConnected(host.playerId));
    t.clock.advance(TIMING.graceMs);
    expect(t.server.lobby.openCodes).toBe(0);
    expect(await friend.emit('lobby.private.join', { code: created.code })).toEqual({
      ok: false,
      code: 'CODE_NOT_FOUND',
    });
  });

  it('allows 3 open codes per address', async () => {
    t = await startServer();
    const hosts = await Promise.all(
      Array.from({ length: 4 }, () => TestClient.connect(t?.url ?? '')),
    );
    clients.push(...hosts);
    const replies = [];
    for (const host of hosts) replies.push(await host.emit('lobby.private.create', {}));
    expect(replies.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(replies[3]).toEqual({ ok: false, code: 'RATE_LIMITED' });
    // Closing one frees a slot.
    await hosts[0]?.emit('lobby.private.cancel', {});
    expect((await hosts[3]?.emit('lobby.private.create', {}))?.ok).toBe(true);
  });
});
