import { existsSync } from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';

// A preinstalled headless Chromium (this workspace cannot download Remotion's own).
const browser =
  process.env.REMOTION_BROWSER ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (existsSync(browser)) Config.setBrowserExecutable(browser);

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');

// The video draws the game's own card faces from the web app's sources, with one React.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias as Record<string, string> | undefined),
      '@cardauction/engine': path.resolve(process.cwd(), '../packages/engine/src/index.ts'),
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
    },
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
}));
