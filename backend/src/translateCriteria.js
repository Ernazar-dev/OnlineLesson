// One-shot backfill: gives every criterion written before the platform stored
// translations its `{uz, ru, en}` map, so existing rubrics start following the
// language switcher immediately instead of on their next page load.
//
//   npm --prefix backend run translate:criteria
//
// Safe to re-run: rows that already carry translations are skipped, and a row
// whose translation fails is left untouched (it keeps showing the text as
// typed, exactly as before).

import prisma from './lib/prisma.js';
import { buildCriterionI18n } from './services/translator.js';
import { isConfigured } from './services/geminiClient.js';
import { DEFAULT_LANG } from './i18n/index.js';

// The language existing rows were most likely written in; only a hint for the
// translator, which detects the real one itself.
const SOURCE_LANG = process.argv[2] || DEFAULT_LANG;

async function backfill(label, model) {
  const rows = await model.findMany({ where: { nameI18n: null } });
  if (!rows.length) {
    console.log(`${label}: nothing to do`);
    return;
  }
  console.log(`${label}: ${rows.length} row(s) to translate`);

  let done = 0;
  for (const row of rows) {
    try {
      const i18n = await buildCriterionI18n(
        { name: row.name, description: row.description || '' },
        SOURCE_LANG
      );
      await model.update({ where: { id: row.id }, data: i18n });
      done += 1;
      console.log(`  ✓ ${row.name}`);
    } catch (e) {
      console.warn(`  ✗ ${row.name} — ${e.message}`);
    }
  }
  console.log(`${label}: ${done}/${rows.length} translated`);
}

async function main() {
  if (!isConfigured()) {
    console.warn(
      'GEMINI_API_KEY is not set — criteria matching the standard rubric will still\n' +
      'be translated from the locale files, but teacher-written text cannot be.'
    );
  }
  await backfill('Criteria library', prisma.criterionTemplate);
  await backfill('Assignment rubrics', prisma.criterion);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
