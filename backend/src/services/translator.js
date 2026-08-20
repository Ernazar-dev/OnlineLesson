// Makes teacher-authored rubric text multilingual.
//
// Criteria are typed by a teacher in one language, but every page that shows
// them must read in the *viewer's* language. So each criterion carries a small
// `{uz, ru, en}` map alongside the text as typed, and this module is what fills
// that map in:
//
//   1. text that matches a standard section title/hint is looked up in the
//      locale files — exact, free and offline;
//   2. anything else is translated once, when it is saved, by the same Gemini
//      client the grader uses;
//   3. if there is no API key (or the call fails) the original text is used for
//      all three languages, so saving a criterion never fails over translation.
//
// The canonical `name` column is deliberately left alone: it is the rubric key
// the submission form, the grader and SectionScore.sectionName agree on, and
// localising it would break the link between an answer and what it scored.

import { SUPPORTED, DEFAULT_LANG, SECTION_KEYS, t } from '../i18n/index.js';
import { generateJson, isConfigured } from './geminiClient.js';

const LANG_NAMES = { uz: 'Uzbek (Latin script)', ru: 'Russian', en: 'English' };

/** Longer than this is prose, not a rubric row — left untranslated. */
const MAX_LEN = 1200;

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** `{uz: text, ru: text, en: text}` — the no-translation fallback. */
export function sameForAll(text) {
  const v = String(text ?? '');
  return Object.fromEntries(SUPPORTED.map((l) => [l, v]));
}

// ---- Standard rubric lookup -------------------------------------------------
// Section titles and hints already exist in all three locale files, so a
// criterion copied from the standard rubric can be localised without any API
// call — in *whichever* language the teacher happened to load it in.

function buildStandardIndex() {
  const index = new Map();
  const add = (variants) => {
    for (const lang of SUPPORTED) {
      const key = norm(variants[lang]);
      if (key) index.set(key, variants);
    }
  };
  for (const [section, titleKey] of Object.entries(SECTION_KEYS)) {
    add(Object.fromEntries(SUPPORTED.map((l) => [l, t(l, titleKey)])));
    add(Object.fromEntries(SUPPORTED.map((l) => [l, t(l, `rubricHints.${section}`)])));
  }
  return index;
}

const STANDARD = buildStandardIndex();

/** The ready-made `{uz, ru, en}` for a standard section title/hint, or null. */
export function standardTranslation(text) {
  return STANDARD.get(norm(text)) || null;
}

// ---- AI translation ---------------------------------------------------------

// Teachers reuse the same wording across assignments, and re-saving a criterion
// must not cost another API call, so translations are memoised per process.
const cache = new Map();
const CACHE_LIMIT = 500;

function cacheGet(text) {
  return cache.get(norm(text)) || null;
}
function cacheSet(text, value) {
  if (cache.size >= CACHE_LIMIT) cache.clear(); // crude, but this is a hint cache
  cache.set(norm(text), value);
}

const LANG_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(SUPPORTED.map((l) => [l, { type: 'string' }])),
  required: [...SUPPORTED],
};

const PAIR_SCHEMA = {
  type: 'object',
  properties: { name: LANG_SCHEMA, description: LANG_SCHEMA },
  required: ['name'],
};

const SYSTEM = [
  'You translate university grading-rubric labels between Uzbek (Latin script), Russian and English.',
  'Detect the source language yourself; the caller only gives a hint.',
  'Return the SAME text in all three languages, keeping any leading numbering ("3. "),',
  'punctuation and capitalisation style. Translate terminology the way it is used in',
  'academic coursework assessment. Do not explain, expand or shorten the text.',
  'If a field is empty, return an empty string for every language.',
].join(' ');

/** Sound `{uz, ru, en}` out of whatever the model returned, or null. */
function readMap(raw, fallback) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const lang of SUPPORTED) {
    const value = typeof raw[lang] === 'string' ? raw[lang].trim() : '';
    out[lang] = value || fallback;
  }
  return out;
}

/**
 * Translates a criterion's name (and description) in one call.
 * Never throws: on any failure the original text is returned for all languages.
 */
async function translatePair(name, description, sourceLang) {
  if (!isConfigured()) return null;
  if (name.length > MAX_LEN || description.length > MAX_LEN) return null;

  const hint = LANG_NAMES[sourceLang] || LANG_NAMES[DEFAULT_LANG];
  try {
    const { data } = await generateJson({
      system: SYSTEM,
      input: [
        {
          type: 'text',
          text: [
            `Source language hint: ${hint}.`,
            `name: ${name}`,
            description ? `description: ${description}` : 'description: (empty)',
          ].join('\n'),
        },
      ],
      schema: PAIR_SCHEMA,
      temperature: 0,
    });
    return {
      name: readMap(data?.name, name),
      description: description ? readMap(data?.description, description) : null,
    };
  } catch (e) {
    console.warn('criterion translation failed:', e.message);
    return null;
  }
}

// ---- Public API -------------------------------------------------------------

/**
 * Builds the stored `{nameI18n, descriptionI18n}` JSON strings for a criterion.
 *
 * `overrides` lets a caller supply text a human already wrote for a given
 * language (the teacher's per-language tabs); only the gaps are filled in.
 */
export async function buildCriterionI18n(
  { name, description = '', nameI18n = null, descriptionI18n = null },
  sourceLang = DEFAULT_LANG
) {
  const cleanName = String(name || '').trim();
  const cleanDesc = String(description || '').trim();
  if (!cleanName) return { nameI18n: null, descriptionI18n: null };

  const overrideName = pruneMap(nameI18n);
  const overrideDesc = pruneMap(descriptionI18n);
  const complete = (map) => map && SUPPORTED.every((l) => map[l]);

  // 1. Anything the teacher filled in by hand wins outright.
  let nameMap = complete(overrideName) ? { ...overrideName } : null;
  let descMap = !cleanDesc ? null : complete(overrideDesc) ? { ...overrideDesc } : null;

  // 2. Standard rubric rows translate for free.
  nameMap = nameMap || standardTranslation(cleanName) || cacheGet(cleanName);
  if (cleanDesc && !descMap) descMap = standardTranslation(cleanDesc) || cacheGet(cleanDesc);

  // 3. Whatever is still missing goes to the model — one call for both fields.
  if (!nameMap || (cleanDesc && !descMap)) {
    const ai = await translatePair(cleanName, cleanDesc, sourceLang);
    if (ai?.name) {
      nameMap = nameMap || ai.name;
      cacheSet(cleanName, ai.name);
    }
    if (cleanDesc && ai?.description) {
      descMap = descMap || ai.description;
      cacheSet(cleanDesc, ai.description);
    }
  }

  // 4. Still nothing (no key, or the call failed) — keep the text as typed.
  nameMap = { ...sameForAll(cleanName), ...nameMap, ...(overrideName || {}) };
  descMap = cleanDesc
    ? { ...sameForAll(cleanDesc), ...descMap, ...(overrideDesc || {}) }
    : null;

  return {
    nameI18n: JSON.stringify(nameMap),
    descriptionI18n: descMap ? JSON.stringify(descMap) : null,
  };
}

/** Drops empty/unsupported entries so a half-filled override map is usable. */
function pruneMap(raw) {
  const parsed = parseI18n(raw);
  if (!parsed) return null;
  const out = {};
  for (const lang of SUPPORTED) {
    const v = typeof parsed[lang] === 'string' ? parsed[lang].trim() : '';
    if (v) out[lang] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Parses a stored i18n column; bad JSON must never break a page. */
export function parseI18n(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** The text for `lang`, falling back to Uzbek and then to the original. */
export function pickI18n(raw, lang, fallback = '') {
  const map = parseI18n(raw);
  if (!map) return fallback;
  const value = map[lang] || map[DEFAULT_LANG];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** The full `{uz, ru, en}` map for editing UIs, defaulting to the typed text. */
export function fullI18n(raw, fallback = '') {
  return { ...sameForAll(fallback), ...(pruneMap(raw) || {}) };
}
