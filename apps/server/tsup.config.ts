import { defineConfig } from 'tsup';

// ESM files for Render: the server and the AI's worker thread. The workspace packages (engine,
// protocol, ai) are bundled from source; npm dependencies stay in node_modules, which the build
// installs.
export default defineConfig({
  entry: ['src/main.ts', 'src/ai-worker.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@cardauction\//],
});
