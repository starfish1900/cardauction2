import { timingSafeEqual } from 'node:crypto';
import express, { type Express, type RequestHandler } from 'express';
import { clientAddress } from './address.js';
import type { Config } from './config.js';

export interface HttpDeps {
  readonly config: Config;
  /** Process health only; never depends on outside services (see the plan's Health check). */
  health(): object;
  metrics(): object;
  admin: {
    status(): object;
    drain(on: boolean): void;
    abort(gameId: string): boolean;
  };
}

/** Plain HTTP beside Socket.IO: the health check for Render, and token-protected metrics and admin. */
export function createHttpApp(deps: HttpDeps): Express {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send('CardAuction game server\n');
  });

  app.get('/healthz', (_req, res) => {
    res.json(deps.health());
  });

  if (config.metricsToken) {
    app.get('/metrics', bearer(config.metricsToken), (_req, res) => {
      res.json(deps.metrics());
    });
  }

  if (config.adminToken) {
    const admin = express.Router();
    admin.use(bearer(config.adminToken));
    admin.get('/status', (_req, res) => {
      res.json(deps.admin.status());
    });
    // To check the deploy: the address per-IP limits would use for this request. Send a forged
    // header (curl -H 'True-Client-IP: 203.0.113.9') and make sure it is not what comes back.
    admin.get('/whoami', (req, res) => {
      res.json({
        address: clientAddress(req, config.clientIpHeader),
        header: config.clientIpHeader,
      });
    });
    admin.post('/drain', (req, res) => {
      const on = req.query.on !== 'false';
      deps.admin.drain(on);
      res.json({ draining: on });
    });
    admin.post('/games/:id/abort', (req, res) => {
      const found = deps.admin.abort(String(req.params.id));
      res.status(found ? 200 : 404).json({ aborted: found });
    });
    app.use('/admin', admin);
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  return app;
}

function bearer(token: string): RequestHandler {
  const expected = Buffer.from(`Bearer ${token}`);
  return (req, res, next) => {
    const given = Buffer.from(req.get('authorization') ?? '');
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}
