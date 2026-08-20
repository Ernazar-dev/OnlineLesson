// Resolves the rubric a submission is graded against.
//
// A teacher can define criteria per assignment; when they haven't, we fall back
// to the 9 standard coursework sections with their original weights, so every
// assignment always has a rubric and grading never has to special-case "none".

import prisma from '../lib/prisma.js';
import { SECTION_WEIGHTS } from './fuzzyLogic.js';
import { ORDERED_SECTIONS } from './aiService.js';
import { sectionTitle, t, DEFAULT_LANG } from '../i18n/index.js';
import { pickI18n } from './translator.js';

/** The 9 standard sections expressed as rubric rows. */
export function standardRubric(lang = DEFAULT_LANG) {
  return ORDERED_SECTIONS.map((section, i) => ({
    id: null,
    key: section, // English id — also the form field name the student fills in
    name: sectionTitle(lang, section),
    description: t(lang, `rubricHints.${section}`),
    weight: SECTION_WEIGHTS[section] ?? 0,
    maxScore: 100,
    levels: null,
    position: i,
  }));
}

/**
 * Returns `{ rows, custom }` for an assignment — the teacher's criteria when
 * they exist, otherwise the standard 9. Weights are normalised so they always
 * sum to 1 regardless of what the teacher typed (5/3/2 works as well as 50/30/20).
 */
export async function resolveRubric(assignmentId, lang = DEFAULT_LANG) {
  const criteria = assignmentId
    ? await prisma.criterion.findMany({
        where: { assignmentId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      })
    : [];

  const custom = criteria.length > 0;
  // `key` stays the name as the teacher typed it — it is what the submission
  // form posts under and what SectionScore.sectionName stores, so it must not
  // move when the viewer switches language. Only what is shown is localised.
  const rows = custom
    ? criteria.map((c, i) => ({
        id: c.id,
        key: c.name,
        name: pickI18n(c.nameI18n, lang, c.name),
        description: pickI18n(c.descriptionI18n, lang, c.description || ''),
        weight: c.weight > 0 ? c.weight : 1,
        maxScore: c.maxScore || 100,
        levels: parseLevels(c.levels),
        position: c.position ?? i,
      }))
    : standardRubric(lang);

  const total = rows.reduce((sum, r) => sum + r.weight, 0);
  const normalised = rows.map((r) => ({
    ...r,
    weight: total > 0 ? r.weight / total : 1 / rows.length,
  }));

  return { rows: normalised, custom };
}

/** Level descriptors are stored as a JSON string; bad JSON must not break grading. */
export function parseLevels(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Weighted 0–100 total from `{ criterionKey: score }`, honouring each maxScore. */
export function weightedTotal(rows, scores) {
  let total = 0;
  for (const row of rows) {
    const raw = Number(scores[row.key] ?? 0) || 0;
    const pct = Math.max(0, Math.min(100, (raw / (row.maxScore || 100)) * 100));
    total += pct * row.weight;
  }
  return Math.round(total * 100) / 100;
}
