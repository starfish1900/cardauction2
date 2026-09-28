import { defineConfig } from 'tsup';

// One ESM file for Render. The workspace packages (engine, protocol) are bundled from source;
// npm dependencies stay in node_modules, which the build installs.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@cardauction\//],
});
