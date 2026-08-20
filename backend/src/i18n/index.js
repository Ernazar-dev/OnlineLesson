// Server-side translations. The client sends its chosen language in
// Accept-Language (see frontend/src/api/client.js); everything else falls back
// to Uzbek, which is the platform default.

import uz from './locales/uz.js';
import ru from './locales/ru.js';
import en from './locales/en.js';

export const SUPPORTED = ['uz', 'ru', 'en'];
export const DEFAULT_LANG = 'uz';

const DICTS = { uz, ru, en };

/** Maps the internal (English) section ids to their translation keys. */
export const SECTION_KEYS = {
  Requirements: 'sections.requirements',
  Correctness: 'sections.correctness',
  Evidence: 'sections.evidence',
  Clarity: 'sections.clarity',
};

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

/**
 * Translate `key` ("auth.loginSuccess") into `lang`, filling {{placeholders}}
 * from `params`. Unknown keys fall back to Uzbek, then to the key itself so a
 * typo shows up in the response instead of an empty string.
 */
export function t(lang, key, params) {
  const l = SUPPORTED.includes(lang) ? lang : DEFAULT_LANG;
  const str = lookup(DICTS[l], key) ?? lookup(DICTS[DEFAULT_LANG], key);
  if (typeof str !== 'string') return key;
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (m, name) => (params[name] ?? m));
}

/** Translate the section id ("Main part") into a display title. */
export function sectionTitle(lang, section) {
  return SECTION_KEYS[section] ? t(lang, SECTION_KEYS[section]) : section;
}

/** Picks a supported language out of an Accept-Language header ("ru-RU,ru;q=0.9"). */
export function pickLang(header) {
  if (!header) return DEFAULT_LANG;
  for (const part of String(header).split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().slice(0, 2);
    if (SUPPORTED.includes(tag)) return tag;
  }
  return DEFAULT_LANG;
}

/** Express middleware: exposes `req.lang` and a bound `req.t(key, params)`. */
export function languageMiddleware(req, res, next) {
  req.lang = pickLang(req.headers['accept-language']);
  req.t = (key, params) => t(req.lang, key, params);
  next();
}

export default t;
