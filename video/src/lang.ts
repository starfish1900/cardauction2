import fr from './fr/strings.json';

/** The language of this render: `REMOTION_LANG=fr` renders the French version. */
export const LANG: 'en' | 'fr' = process.env.REMOTION_LANG === 'fr' ? 'fr' : 'en';

const FR: Readonly<Record<string, string>> = fr;

/** A text shown on screen, in the render's language. The English text is the key. */
export function tr(english: string): string {
  if (LANG === 'en') return english;
  const french = FR[english];
  if (french === undefined) throw new Error(`no French for "${english}" in src/fr/strings.json`);
  return french;
}

/** A file under public/. The French version keeps its own narration and screenshots in fr/. */
export const langFile = (file: string): string => (LANG === 'fr' ? `fr/${file}` : file);
