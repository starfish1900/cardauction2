import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../deploy';

const blueprint = readFileSync(new URL('../../../render.yaml', import.meta.url), 'utf8');

/** The value of `key` in the service named `service` (render.yaml is simple enough for this). */
function setting(service: string, pattern: RegExp): string | undefined {
  const start = blueprint.indexOf(`name: ${service}`);
  const next = blueprint.indexOf('\n  - type:', start);
  const block = blueprint.slice(start, next === -1 ? undefined : next);
  return pattern.exec(block)?.[1];
}

describe('the Render Blueprint', () => {
  const server = setting('cardauction-web', /key: VITE_SERVER_URL\s+value: (\S+)/);
  const web = setting('cardauction-server', /key: CORS_ORIGIN\s+value: (\S+)/);

  it('points the web client at the server, and the server accepts the web client', () => {
    expect(server).toBe('https://cardauction-server.onrender.com');
    expect(web).toBe('https://cardauction-web.onrender.com');
  });

  it('sends the same Content-Security-Policy as the end-to-end tests', () => {
    const policy = setting('cardauction-web', /name: Content-Security-Policy\s+value: "([^"]+)"/);
    expect(policy).toBe(contentSecurityPolicy(server ?? ''));
  });

  it('rewrites every path to the single page (for /join/CODE links)', () => {
    expect(setting('cardauction-web', /source: (\S+)\s+destination: \/index\.html/)).toBe('/*');
    expect(setting('cardauction-web', /staticPublishPath: (\S+)/)).toBe('apps/web/dist');
  });
});
