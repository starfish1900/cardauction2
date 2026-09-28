/**
 * The Content-Security-Policy of the deployed site, for a game server at `server`. render.yaml
 * sends it from Render; `vite preview` sends it too, so the end-to-end tests run under the
 * production policy. A test checks that the two agree.
 */
export function contentSecurityPolicy(server: string): string {
  const url = new URL(server);
  const socket = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Motion animates through inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${url.origin} ${socket}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
