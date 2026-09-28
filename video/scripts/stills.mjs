// Renders stills of the tutorial for review: node scripts/stills.mjs <outDir> <scene@seconds | seconds>...
// Bundles once, then renders each frame at half size with the subtitles, and a contact sheet.
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [outDir, ...items] = process.argv.slice(2);
if (!outDir || items.length === 0) {
  console.error('usage: node scripts/stills.mjs <outDir> <scene@seconds | seconds>...');
  process.exit(2);
}
const timeline = JSON.parse(readFileSync('src/timeline.json', 'utf8'));
const fps = 30;
const shots = items.map((item) => {
  const [scene, seconds] = item.includes('@') ? item.split('@') : [null, item];
  const base = scene ? timeline.scenes.find((s) => s.id === scene)?.start : 0;
  if (base === undefined) throw new Error(`no scene ${scene}`);
  return { name: item.replace('@', '_'), frame: Math.round((base + Number(seconds)) * fps) };
});

const browserExecutable =
  process.env.REMOTION_BROWSER ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const serveUrl = await bundle({
  entryPoint: path.resolve('src/index.ts'),
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@cardauction/engine': path.resolve('../packages/engine/src/index.ts'),
        react: path.resolve('node_modules/react'),
        'react-dom': path.resolve('node_modules/react-dom'),
      },
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    },
  }),
});
const browser = await openBrowser(
  'chrome',
  existsSync(browserExecutable) ? { browserExecutable } : {},
);
const id = process.env.COMPOSITION ?? 'TutorialSubtitled';
const composition = await selectComposition({
  serveUrl,
  id,
  puppeteerInstance: browser,
  browserExecutable,
});
mkdirSync(outDir, { recursive: true });
for (const shot of shots) {
  await renderStill({
    composition,
    serveUrl,
    output: path.join(outDir, `${shot.name}.png`),
    frame: Math.min(shot.frame, composition.durationInFrames - 1),
    scale: Number(process.env.SCALE ?? 0.5),
    puppeteerInstance: browser,
    browserExecutable,
  });
  console.log(`${shot.name} (frame ${shot.frame})`);
}
await browser.close({ silent: true });
