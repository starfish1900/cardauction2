import type { IncomingMessage } from 'node:http';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * The address per-IP limits count against. Behind Render's proxy the TCP peer is the proxy, so
 * the client's address comes from a header the proxy sets and a client cannot forge: configure
 * it with CLIENT_IP_HEADER (Render sits behind Cloudflare, which sets True-Client-IP). The first
 * X-Forwarded-For entry is never used: clients can put anything there.
 */
export function clientAddress(req: IncomingMessage, header: string | null): string {
  if (header) {
    const value = req.headers[header];
    const text = (Array.isArray(value) ? value[0] : value)?.trim();
    if (text && (isIPv4(text) || isIPv6(text))) return addressKey(text);
  }
  return addressKey(req.socket.remoteAddress ?? 'unknown');
}

/**
 * One key per IPv4 address and per IPv6 /64 network: a single IPv6 host usually controls a whole
 * /64, so keying by full address would let it dodge every per-IP limit.
 */
export function addressKey(address: string): string {
  const bare = address.split('%')[0] ?? address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(bare);
  if (mapped?.[1]) return mapped[1];
  if (!isIPv6(bare)) return bare;
  const [head = '', tail] = bare.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  const prefix = groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/u, ''));
  return `${prefix.join(':')}::/64`;
}
