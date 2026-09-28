import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentSecurityPolicy } from './deploy';

// In development the app talks to the game server through this proxy (same origin, no CORS);
// DEV_SERVER_URL points it elsewhere than the default port. In production VITE_SERVER_URL
// points the app at the server's own address.
const devServer = process.env.DEV_SERVER_URL ?? 'http://localhost:3000';

const serverUrl = process.env.VITE_SERVER_URL;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: devServer, ws: true },
    },
  },
  preview: {
    port: 4173,
    headers: serverUrl ? { 'Content-Security-Policy': contentSecurityPolicy(serverUrl) } : {},
  },
  build: {
    target: 'es2022',
    // React, Motion, i18next and Socket.IO make one ~170 kB (gzipped) bundle: fine for a game.
    chunkSizeWarningLimit: 600,
  },
});
