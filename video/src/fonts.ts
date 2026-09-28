import { continueRender, delayRender } from 'remotion';
import gelasio400 from '@fontsource/gelasio/files/gelasio-latin-400-normal.woff2';
import gelasio700 from '@fontsource/gelasio/files/gelasio-latin-700-normal.woff2';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2';

/**
 * Inter for words, Gelasio for numbers. The card faces ask for Georgia: Gelasio is drawn to
 * Georgia's measurements, so it stands in under that name too. Rendering waits for all of them.
 */
const faces: [string, string, string][] = [
  ['Inter', inter400, '400'],
  ['Inter', inter500, '500'],
  ['Inter', inter600, '600'],
  ['Inter', inter700, '700'],
  ['Gelasio', gelasio400, '400'],
  ['Gelasio', gelasio700, '700'],
  ['Georgia', gelasio400, '400'],
  ['Georgia', gelasio700, '700'],
];

if (typeof document !== 'undefined') {
  const handle = delayRender('fonts');
  Promise.all(
    faces.map(([family, url, weight]) =>
      new FontFace(family, `url(${url}) format('woff2')`, { weight }).load().then((face) => {
        document.fonts.add(face);
      }),
    ),
  ).then(
    () => continueRender(handle),
    (error: unknown) => {
      console.error(error);
      continueRender(handle);
    },
  );
}
