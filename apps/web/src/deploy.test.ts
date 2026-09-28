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

/** The workspace packages a package uses, directly or not, as directories ("packages/engine"). */
function workspacePackages(dir: string, found = new Set<string>()): Set<string> {
  const manifest = JSON.parse(
    readFileSync(new URL(`../../../${dir}/package.json`, import.meta.url), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!version.startsWith('workspace:')) continue;
    const used = `packages/${name.replace('@cardauction/', '')}`;
    if (found.has(used)) continue;
    found.add(used);
    workspacePackages(used, found);
  }
  return found;
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

  it('asks nothing of a free service that only paid plans allow', () => {
    // Render refuses the whole Blueprint otherwise ("not supported for free tier services").
    expect(setting('cardauction-server', /plan: (\S+)/)).toBe('free');
    expect(
      setting('cardauction-server', /(maxShutdownDelaySeconds|numInstances|scaling|disk):/),
    ).toBeUndefined();
  });

  it('installs each service alone, and rebuilds it when a package it uses changes', () => {
    for (const [service, app] of [
      ['cardauction-server', 'server'],
      ['cardauction-web', 'web'],
    ] as const) {
      const build = setting(service, /buildCommand: (.+)/) ?? '';
      expect(build).toContain(`install --frozen-lockfile --filter @cardauction/${app}...`);
      const paths = /buildFilter:\s+paths:\n((?:\s+(?:- .+|#.*)\n)+)/.exec(
        blueprint.slice(blueprint.indexOf(`name: ${service}`)),
      )?.[1];
      const watched = (paths ?? '').match(/- \S+/g)?.map((line) => line.slice(2)) ?? [];
      expect(watched).toContain(`apps/${app}/**`);
      for (const used of workspacePackages(`apps/${app}`)) {
        expect(watched.includes(`${used}/**`) || watched.includes('packages/**'), used).toBe(true);
      }
    }
  });

  it('rewrites every path to the single page (for /join/CODE links)', () => {
    expect(setting('cardauction-web', /source: (\S+)\s+destination: \/index\.html/)).toBe('/*');
    expect(setting('cardauction-web', /staticPublishPath: (\S+)/)).toBe('apps/web/dist');
  });
});
