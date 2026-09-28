import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { fr } from './fr';
import { readSetting, writeSetting } from '../state/storage';

const saved = readSetting('lang');
const browser = typeof navigator !== 'undefined' ? navigator.language : 'en';
const language =
  saved === 'fr' || saved === 'en' ? saved : browser.toLowerCase().startsWith('fr') ? 'fr' : 'en';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

document.documentElement.lang = language;

export function toggleLanguage(): void {
  const next = i18n.language === 'fr' ? 'en' : 'fr';
  void i18n.changeLanguage(next);
  document.documentElement.lang = next;
  writeSetting('lang', next);
}

export default i18n;
