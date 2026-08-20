import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uz from './locales/uz.json';
import ru from './locales/ru.json';
import en from './locales/en.json';

export const SUPPORTED = ['uz', 'ru', 'en'];
export const DEFAULT_LANG = 'uz';
const STORAGE_KEY = 'lang';

// The stored choice wins; everything else falls back to Uzbek — the browser
// language is deliberately ignored so a fresh visitor always lands on uz.
export function getLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
}

export function setLang(lng) {
  if (!SUPPORTED.includes(lng)) return;
  localStorage.setItem(STORAGE_KEY, lng);
  i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
}

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru }, en: { translation: en } },
  lng: getLang(),
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false }, // React already escapes
});

document.documentElement.lang = getLang();

export default i18n;
