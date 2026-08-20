// Is this text real writing, or did someone mash the keyboard?
//
// A student who types "vghbvjdjnd ahdsjcndfj" into every section used to score
// 65: the fallback grader measured length and nothing else, and even the AI
// grader had no instruction telling it that non-language is worth zero rather
// than partial credit for effort. This module answers that question before any
// model is called, so an obvious non-submission costs no API quota and cannot
// be talked into a passing mark.
//
// It is deliberately a blunt instrument. Judging *quality* is the grader's job;
// all this decides is whether there is language here at all. That distinction
// matters for the thresholds below: a false positive marks real work as
// nonsense, which is far worse than letting weak-but-real writing through to be
// graded on its merits. Everything here is therefore tuned to stay silent
// unless the text is indefensible.

// Vowels across the three scripts the platform serves. Uzbek's oʻ/gʻ are
// handled by the tokenizer, which keeps apostrophes inside words.
const VOWELS = new Set([
  ...'aeiouyàáâäãåèéêëìíîïòóôöõùúûüýÿ',
  ...'аеёиоуыэюяіїє',
]);

// Words that are all consonants are the strongest signal of mashing, but real
// technical prose is full of short acronyms — TCP, RSA, AES, DNS, HTTP, PDF.
// Anything short and fully upper-case is therefore taken at face value.
const ACRONYM_MAX = 6;

/** Splits text into word-like tokens, keeping intra-word apostrophes (oʻzbek). */
function tokenize(text) {
  return String(text || '')
    .replace(/[’ʻʼ`]/g, "'")
    .split(/[^\p{L}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length >= 2);
}

/** The longest run of consecutive consonants in a token. */
function longestConsonantRun(lower) {
  let run = 0;
  let best = 0;
  for (const ch of lower) {
    if (VOWELS.has(ch)) run = 0;
    else if (ch === "'") continue; // oʻ / gʻ are vowel-carrying, not a break
    else best = Math.max(best, ++run);
  }
  return best;
}

/**
 * Could a human language plausibly produce this token? Not "is it a real word" —
 * there is no dictionary here, and there could not be one that covers Uzbek,
 * Russian, English and the subject's technical vocabulary at once.
 */
function isWordLike(token) {
  if (token.length <= ACRONYM_MAX && token === token.toUpperCase()) return true;

  const lower = token.toLowerCase();
  const vowels = [...lower].filter((c) => VOWELS.has(c)).length;

  // No vowel at all, beyond acronym length: "vghbvjdjnd".
  if (vowels === 0) return false;
  // Consonant pile-ups no natural word sustains: "ahdsjcndfj".
  if (longestConsonantRun(lower) >= 5) return false;
  // A single letter held down.
  if (/(.)\1{3,}/.test(lower)) return false;
  // Vowel-only strings ("aaeeiiou") and absurd lengths.
  if (vowels === lower.length && lower.length > 3) return false;
  if (lower.length > 25) return false;

  return true;
}

/**
 * Analyses one block of text.
 *
 * Returns `{ tokens, gibberishRatio, diversity, verdict, sample }` where verdict is
 *   'empty'    — too little text to judge (NOT a reason to fail anyone)
 *   'nonsense' — overwhelmingly not language
 *   'suspect'  — enough non-words to warrant telling the grader
 *   'ok'       — ordinary text; grade it normally
 */
export function analyzeText(text) {
  const tokens = tokenize(text);
  const total = tokens.length;

  // Under this many words there is nothing to conclude. A one-line answer may be
  // lazy, but that is a grading judgement, not a nonsense verdict.
  if (total < 6) return { tokens: total, gibberishRatio: 0, diversity: 1, verdict: 'empty', sample: [] };

  const bad = tokens.filter((t) => !isWordLike(t));
  const gibberishRatio = bad.length / total;

  // "asdf asdf asdf asdf" passes the per-word test — every token is plausible in
  // isolation. What gives it away is that there is only one of them.
  const unique = new Set(tokens.map((t) => t.toLowerCase())).size;
  const diversity = unique / total;

  let verdict = 'ok';
  if (gibberishRatio >= 0.6 || (total >= 10 && diversity <= 0.15)) verdict = 'nonsense';
  else if (gibberishRatio >= 0.3) verdict = 'suspect';

  return {
    tokens: total,
    gibberishRatio: Math.round(gibberishRatio * 100) / 100,
    diversity: Math.round(diversity * 100) / 100,
    verdict,
    sample: bad.slice(0, 5),
  };
}

/**
 * Decides what to do with a whole submission: whatever text we managed to pull
 * out of the attached document — the only source of evidence there is, since
 * the student no longer writes a separate answer per section.
 *
 * `documentUnreadable` is the safety catch. When the student attached a PDF that
 * only the multimodal model can read, we know nothing about its contents — and
 * an empty extraction must never be read as "the document is nonsense". In that
 * case the worst this returns is 'suspect', which merely warns the grader.
 *
 * Returns `{ verdict, file }`, where a verdict of 'nonsense' means: score this
 * zero without calling a model.
 */
export function analyzeSubmission({ fileText, documentUnreadable = false }) {
  const file = analyzeText(fileText);

  let verdict = file.verdict === 'nonsense' || file.verdict === 'suspect' ? file.verdict : 'ok';

  // An unreadable attachment always downgrades a hard verdict to a warning: the
  // grader can see the PDF even when the text extractor could not, and an empty
  // extraction from a format we can't parse must never be read as "gibberish".
  if (verdict === 'nonsense' && documentUnreadable) verdict = 'suspect';

  return { verdict, file };
}

/**
 * A short note for the grader's prompt when the text looks doubtful but not
 * hopeless. Phrased as an observation, never as an instruction to fail the
 * student — the model still has the document and decides for itself.
 */
export function qualityNote(analysis) {
  if (!analysis || analysis.verdict === 'ok') return '';
  const parts = [];
  if (analysis.file.gibberishRatio >= 0.3)
    parts.push(
      `${Math.round(analysis.file.gibberishRatio * 100)}% of the words in the extracted document text are not recognisable words`
    );
  if (analysis.file.diversity <= 0.2 && analysis.file.tokens >= 10)
    parts.push('the document repeats the same few words over and over');
  if (!parts.length) return '';

  return [
    'AUTOMATED TEXT CHECK — a mechanical scan of this submission reports that ' +
      parts.join(', and ') +
      '.',
    'Verify this yourself against the attached work before acting on it: the scan cannot read',
    'the attached PDF or image, and it does not know the subject\'s technical vocabulary.',
    'If the work really is keyboard mashing, placeholder text or filler, score every criterion 0.',
  ].join('\n');
}
