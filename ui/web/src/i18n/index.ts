import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Lang } from '../contracts/types';
import en from './en.json';
import hi from './hi.json';
import mr from './mr.json';

export const LANGUAGES: ReadonlyArray<{ code: Lang; native: string }> = [
  { code: 'en', native: 'English' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'mr', native: 'मराठी' },
];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'hi', 'mr'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
