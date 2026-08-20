// Originality check — "did this student hand in someone else's work?"
//
// Every submission that has ever been made is kept in the corpus as a
// fingerprint: the set of hashes of its overlapping 5-word shingles. A new
// submission is fingerprinted the same way and compared against that corpus,
// which finds literal copying (whole file, or a few pasted paragraphs) exactly
// and cheaply — no text of the earlier work needs to be re-read.
//
// Shingles alone cannot see a reworded copy, so the closest candidates are then
// handed to Gemini, which reads both works and rules on whether one was copied,
// paraphrased, or merely written from the same textbook. The AI's verdict is
// what separates real plagiarism from two students legitimately quoting the
// same lecture, so it decides the final figure whenever it runs.
//
// The result is a percentage, a status band, matched passages and a warning
// text; `gradingService` turns those into the score penalty and the message the
// student reads.

import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { extractFileContent } from './fileParser.js';
import { generateJson, isConfigured as geminiConfigured } from './geminiClient.js';
import { t, DEFAULT_LANG } from '../i18n/index.js';

/** Words per shingle. Five is long enough that ordinary phrases don't collide. */
const SHINGLE = 5;
/**
 * Only the first N words of a work are fingerprinted. A fixed cap keeps the
 * stored fingerprint bounded, and because it is the same cap for every
 * submission the comparison stays apples-to-apples.
 */
const MAX_WORDS = 20000;
/** How much of each work the AI pass reads, in characters. */
const AI_TEXT_CHARS = 14000;
/** Longest matched passages reported back per pair. */
const MAX_SNIPPETS = 3;

const LANG_NAME = { uz: 'Uzbek (latin script)', ru: 'Russian', en: 'English' };

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Splits text into comparable words, keeping the original spelling alongside so
 * a matched passage can be shown back the way the student wrote it.
 * Punctuation, case and the apostrophes of o' / g' are dropped, so formatting
 * differences alone can never hide a copy.
 */
function tokenize(text) {
  const norm = [];
  const orig = [];
  for (const raw of String(text || '').split(/\s+/)) {
    if (!raw) continue;
    const n = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (!n) continue;
    norm.push(n);
    orig.push(raw);
    if (norm.length >= MAX_WORDS) break;
  }
  return { norm, orig };
}

/** 32-bit hash of one shingle, rendered as the 8 hex chars we store. */
function shingleHash(words) {
  return crypto.createHash('sha1').update(words.join(' ')).digest('hex').slice(0, 8);
}

/**
 * Builds the fingerprint of a text: `{ hashes, positions, words, hash }`.
 * `positions` maps each hash to where it occurs, which is what lets a match be
 * turned back into a readable quote.
 */
export function fingerprintText(text) {
  const { norm, orig } = tokenize(text);
  const positions = new Map();
  for (let i = 0; i + SHINGLE <= norm.length; i += 1) {
    const h = shingleHash(norm.slice(i, i + SHINGLE));
    const at = positions.get(h);
    if (at) at.push(i);
    else positions.set(h, [i]);
  }
  return {
    hashes: new Set(positions.keys()),
    positions,
    words: norm.length,
    tokens: orig,
    // The whole-document hash: identical text means an identical hash, which is
    // the one case we can call a copy without any similarity maths at all.
    hash: norm.length ? crypto.createHash('sha256').update(norm.join(' ')).digest('hex') : null,
  };
}

/** Packs a hash set for the database: fixed-width, so parsing needs no separator. */
export const packFingerprint = (hashes) => [...hashes].join('');

/** Reads back a packed fingerprint. */
export function unpackFingerprint(packed) {
  const out = new Set();
  const s = String(packed || '');
  for (let i = 0; i + 8 <= s.length; i += 8) out.add(s.slice(i, i + 8));
  return out;
}

/**
 * The text a submission is compared on: the uploaded document plus everything
 * the student typed into the form. Both matter — copying is just as easily done
 * in the answer boxes as in the attached file.
 */
export function buildComparisonText({ fileText, sectionsData }) {
  const answers = Object.values(sectionsData || {})
    .map((v) => String(v || '').replace('[Image uploaded]', '').trim())
    .filter(Boolean);
  return [String(fileText || '').trim(), ...answers].filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * Two different questions, and they need two different numbers.
 *
 * `coverage` — how much of THIS student's work is not their own (shared ÷ their
 * own shingles). This is the only fair basis for a penalty: pasting one
 * paragraph into an otherwise original work is not a 100% copy, whatever the
 * length of the work it was taken from.
 *
 * `detection` — the share of the SHORTER work found in the longer one. Jaccard
 * would rate a whole short work pasted into a long one as barely similar, so
 * this is what ranks candidates and decides what the AI looks at.
 */
function overlapStats(suspect, other) {
  if (!suspect.size || !other.size) return { coverage: 0, detection: 0, shared: [] };
  const shared = [];
  for (const h of suspect) if (other.has(h)) shared.push(h);
  const smaller = Math.min(suspect.size, other.size);
  return {
    coverage: (shared.length / suspect.size) * 100,
    detection: (shared.length / smaller) * 100,
    shared,
  };
}

/**
 * Cosine similarity over word frequencies — a rough "do these two works talk
 * about the same thing in the same words" signal. Shingles miss a rewritten
 * copy entirely; this does not, so it is what nominates candidates for the AI
 * pass. Short words carry no topic information and are skipped.
 */
export function lexicalSimilarity(aWords, bWords) {
  const vec = (words) => {
    const tf = new Map();
    for (const w of words) if (w.length >= 4) tf.set(w, (tf.get(w) || 0) + 1);
    // Sub-linear scaling, so one word repeated 50 times cannot define the vector.
    for (const [w, n] of tf) tf.set(w, 1 + Math.log(n));
    return tf;
  };
  const a = vec(aWords);
  const b = vec(bWords);
  if (!a.size || !b.size) return 0;

  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [w, v] of small) {
    const other = big.get(w);
    if (other) dot += v * other;
  }
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  return (dot / (norm(a) * norm(b))) * 100;
}

/**
 * Turns shared shingles back into readable passages. Consecutive shingle
 * positions describe one continuous stretch of copied text, so runs are merged
 * (a one-shingle gap is tolerated — a single changed word) and only stretches
 * long enough to be meaningful are kept.
 */
function matchedPassages(fp, sharedHashes) {
  const starts = [];
  for (const h of sharedHashes) for (const pos of fp.positions.get(h) || []) starts.push(pos);
  if (!starts.length) return [];
  starts.sort((x, y) => x - y);

  const runs = [];
  let from = starts[0];
  let to = starts[0];
  for (const pos of starts.slice(1)) {
    if (pos - to <= 2) to = pos;
    else {
      runs.push([from, to]);
      from = pos;
      to = pos;
    }
  }
  runs.push([from, to]);

  return runs
    .map(([s, e]) => ({ start: s, length: e - s + SHINGLE }))
    // Three chained shingles ≈ 7+ words in a row: too long to be a coincidence.
    .filter((r) => r.length >= SHINGLE + 2)
    .sort((x, y) => y.length - x.length)
    .slice(0, MAX_SNIPPETS)
    .map((r) => fp.tokens.slice(r.start, r.start + r.length).join(' '));
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

const CANDIDATE_FIELDS = {
  id: true,
  studentId: true,
  assignmentId: true,
  submittedAt: true,
  filePath: true,
  contentHash: true,
  fingerprint: true,
  fingerprintWords: true,
  student: { select: { id: true, username: true, fullName: true } },
  assignment: { select: { id: true, title: true, course: true } },
};

/**
 * Everything this submission is checked against, closest context first: other
 * work handed in for the same assignment, then the same subject, then the rest
 * of the platform. Ordering matters because the pool is capped — the submission
 * a student is most likely to have copied is the one sitting next to theirs.
 */
async function loadCorpus(submission) {
  const seen = new Set([submission.id]);
  const pool = [];

  const push = (rows) => {
    for (const r of rows) {
      if (pool.length >= config.plagPoolSize) return;
      if (seen.has(r.id)) continue;
      // A student resubmitting their own work is not plagiarism; leaving them in
      // would flag every second attempt at 100%.
      if (r.studentId && submission.studentId && r.studentId === submission.studentId) continue;
      seen.add(r.id);
      pool.push(r);
    }
  };

  const base = { id: { not: submission.id } };
  const query = (where, take) =>
    prisma.submission.findMany({
      where: { ...base, ...where },
      select: CANDIDATE_FIELDS,
      orderBy: { submittedAt: 'desc' },
      take,
    });

  if (submission.assignmentId) push(await query({ assignmentId: submission.assignmentId }, config.plagPoolSize));

  if (pool.length < config.plagPoolSize) {
    const course = submission.assignment?.course;
    if (course) push(await query({ assignment: { course } }, config.plagPoolSize - pool.length));
  }
  if (pool.length < config.plagPoolSize) push(await query({}, config.plagPoolSize - pool.length));

  return pool;
}

/**
 * Gives a corpus entry a fingerprint if it has none. Submissions made before
 * this check existed are rebuilt from the file still on disk, so the archive
 * becomes comparable without a migration script — bounded per run so one
 * submission never pays for the whole backlog.
 */
async function backfillFingerprints(pool) {
  let budget = config.plagBackfill;
  for (const row of pool) {
    if (row.fingerprint || budget <= 0) continue;
    budget -= 1;
    try {
      const parts = [];
      if (row.filePath) {
        const parsed = await extractFileContent(row.filePath);
        if (parsed.text) parts.push(parsed.text);
      }
      const sections = await prisma.sectionScore.findMany({
        where: { submissionId: row.id },
        select: { content: true },
      });
      for (const s of sections) if (s.content) parts.push(String(s.content).replace('[Image uploaded]', '').trim());

      const fp = fingerprintText(parts.join('\n\n'));
      row.fingerprint = packFingerprint(fp.hashes);
      row.fingerprintWords = fp.words;
      row.contentHash = fp.hash;
      await prisma.submission.update({
        where: { id: row.id },
        data: { fingerprint: row.fingerprint, fingerprintWords: fp.words, contentHash: fp.hash },
      });
    } catch (e) {
      // A missing or unreadable old file just means that one stays uncomparable.
      console.error(`Plagiarism backfill failed for submission ${row.id}:`, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// The AI pass
// ---------------------------------------------------------------------------

const AI_SCHEMA = {
  type: 'object',
  required: ['reasoning', 'verdict', 'similarity', 'explanation', 'evidence'],
  properties: {
    // Reasoning first, deliberately: the model must weigh the two texts before
    // it commits to a verdict, which is what stops "they share a topic" being
    // reported as "one copied the other".
    reasoning: {
      type: 'string',
      description:
        'First state what the two works are each about. Then compare them: shared wording, shared ' +
        'specific claims, shared mistakes — and whether the overlap is fully explained by a shared ' +
        'report template, shared course material, or the task itself. Decide only after this.',
    },
    verdict: {
      type: 'string',
      enum: ['copy', 'paraphrase', 'common_material', 'independent'],
      description:
        'copy = substantially the same text; paraphrase = the same work reworded or reordered; ' +
        'common_material = overlap only where both quote the same textbook/definitions; ' +
        'independent = separate work that merely shares a subject.',
    },
    similarity: {
      type: 'number',
      description:
        'How much of work A is taken from work B, 0-100. Count only copied or reworded ' +
        'material — not shared terminology, standard definitions or the task wording itself.',
    },
    explanation: {
      type: 'string',
      description: 'Two or three sentences a teacher can act on, stating what specifically matches.',
    },
    evidence: {
      type: 'array',
      maxItems: 3,
      description: 'Passage pairs that match. Empty when the works are independent.',
      items: {
        type: 'object',
        required: ['suspect', 'source'],
        properties: {
          suspect: { type: 'string', description: 'Verbatim passage from work A.' },
          source: { type: 'string', description: 'The corresponding passage from work B.' },
        },
      },
    },
  },
};

function aiSystemInstruction(lang) {
  const language = LANG_NAME[lang] || LANG_NAME.uz;
  return [
    'You are an academic integrity examiner comparing two student submissions for the same course.',
    '',
    'Rules:',
    '1. Decide whether the CONTENT of work A was taken from work B — copied outright, or reworded',
    '   from it. You are judging the substance, not the packaging.',
    '2. Students study from the same textbook and answer the same task. NONE of the following is',
    '   plagiarism, and none of it may raise the similarity figure:',
    '   - shared report structure, the same headings, the same section order, the same template;',
    '   - the wording of the task, the title page, or standard formalities;',
    '   - standard definitions, terminology, formulas, protocol names and common citations;',
    '   - simply being written in the same language, style or register.',
    '   Rule "common_material" when that is all the two works share.',
    '3. If the two works are about DIFFERENT topics or answer different tasks, they cannot be a',
    '   copy of one another, however similar their layout and vocabulary look. Rule "independent".',
    '4. What does indicate copying: long identical or near-identical sentence sequences, the same',
    '   unusual phrasing, the same worked examples with the same numbers, the same specific claims',
    '   in the same order, and — most tellingly — the same mistakes.',
    '5. Never accuse without evidence. Every claim of copying must come with verbatim passage',
    '   pairs in "evidence", each long enough to be conclusive on its own. If you cannot produce',
    '   such pairs, the verdict is "independent" or "common_material" and similarity is near 0.',
    '6. The similarity figure must match your verdict: "independent" is 0-5, "common_material"',
    '   stays below 20, and "paraphrase"/"copy" state how much of work A came from work B.',
    `7. Write "explanation" in ${language}. Keep "evidence" passages verbatim in their original language.`,
  ].join('\n');
}

/**
 * Asks Gemini to rule on one pair. Returns null when the AI is unavailable, so
 * the caller simply keeps the fingerprint figure instead of failing the check.
 */
async function aiCompare({ suspect, candidate, lexical, overlap, snippets, lang }) {
  const input = [
    {
      type: 'text',
      text: [
        `TASK: ${suspect.assignmentTitle || '(untitled)'}`,
        suspect.course ? `SUBJECT: ${suspect.course}` : '',
        '',
        'AUTOMATED PRE-CHECK (for context, not a conclusion):',
        `- literal 5-word-sequence overlap: ${overlap.toFixed(1)}%`,
        `- vocabulary similarity: ${lexical.toFixed(1)}%`,
        snippets.length
          ? `- longest identical passages found:\n${snippets.map((s) => `  • "${s}"`).join('\n')}`
          : '- no identical passage of 7+ words was found',
        '',
        'WORK A — the submission being checked (handed in later):',
        '"""',
        suspect.text.slice(0, AI_TEXT_CHARS),
        '"""',
        '',
        'WORK B — the earlier submission it resembles:',
        '"""',
        candidate.text.slice(0, AI_TEXT_CHARS),
        '"""',
        '',
        'Rule on whether work A was taken from work B.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const { data } = await generateJson({
    system: aiSystemInstruction(lang),
    input,
    schema: AI_SCHEMA,
    temperature: 0,
  });

  const verdict = ['copy', 'paraphrase', 'common_material', 'independent'].includes(data?.verdict)
    ? data.verdict
    : 'independent';
  return {
    verdict,
    similarity: Math.max(0, Math.min(100, Number(data?.similarity) || 0)),
    explanation: String(data?.explanation || '').trim(),
    evidence: Array.isArray(data?.evidence)
      ? data.evidence
          .filter((e) => e && (e.suspect || e.source))
          .slice(0, MAX_SNIPPETS)
          .map((e) => ({ suspect: String(e.suspect || ''), source: String(e.source || '') }))
      : [],
  };
}

/**
 * Reads back the text of an earlier submission for the AI pass. Only the couple
 * of finalists are read, so re-parsing their file here costs far less than
 * storing every submission's full text forever.
 */
async function loadCandidateText(row) {
  const parts = [];
  if (row.filePath) {
    try {
      const parsed = await extractFileContent(row.filePath);
      if (parsed.text) parts.push(parsed.text);
    } catch {
      /* fall back to the stored answers */
    }
  }
  try {
    const sections = await prisma.sectionScore.findMany({
      where: { submissionId: row.id },
      select: { content: true },
    });
    for (const s of sections) if (s.content) parts.push(String(s.content).replace('[Image uploaded]', '').trim());
  } catch {
    /* ignore */
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Which band a similarity figure falls into. */
function bandFor(score, exactDuplicate) {
  if (exactDuplicate) return 'duplicate';
  if (score >= config.plagHighAt) return 'high';
  if (score >= config.plagPenaltyFrom) return 'moderate';
  if (score >= config.plagWarnAt) return 'low';
  return 'clean';
}

/**
 * Runs the whole check for one submission and stores its fingerprint, its
 * matches and its similarity figure.
 *
 * Returns `{ score, status, matches, report }` — never throws: an originality
 * check that fails must not cost the student their grade, so a failure is
 * reported as `status: 'skipped'` and grading carries on untouched.
 */
export async function checkPlagiarism({ submissionId, studentId, assignment, comparisonText, lang = DEFAULT_LANG }) {
  const empty = { score: 0, status: 'skipped', matches: [], report: null };
  if (!config.plagEnabled) return empty;

  try {
    const fp = fingerprintText(comparisonText);

    // Store the fingerprint whatever the outcome — a work too short to judge
    // still belongs in the corpus, because the next submission may be long.
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        fingerprint: packFingerprint(fp.hashes),
        fingerprintWords: fp.words,
        contentHash: fp.hash,
        plagiarismCheckedAt: new Date(),
      },
    });

    if (fp.words < config.plagMinWords) {
      return { score: 0, status: 'too_short', matches: [], report: null };
    }

    const submission = { id: submissionId, studentId, assignmentId: assignment?.id ?? null, assignment };
    const pool = await loadCorpus(submission);
    await backfillFingerprints(pool);

    // --- Stage 1: fingerprint comparison against the whole corpus ------------
    const scored = [];
    for (const row of pool) {
      if (!row.fingerprint) continue;
      // A candidate too short to judge is too short to accuse anyone with: a
      // two-paragraph work overlaps every other two-paragraph work on the
      // subject's standard phrases alone.
      if ((row.fingerprintWords ?? 0) < config.plagMinWords) continue;
      const other = unpackFingerprint(row.fingerprint);
      if (!other.size) continue;
      const { coverage, detection, shared } = overlapStats(fp.hashes, other);
      const exact = !!(fp.hash && row.contentHash && fp.hash === row.contentHash);
      scored.push({
        row,
        shared,
        exact,
        coverage: exact ? 100 : coverage,
        detection: exact ? 100 : detection,
      });
    }

    if (!scored.length) return { score: 0, status: 'clean', matches: [], report: null };

    // --- Stage 2: nominate candidates for the AI ----------------------------
    // Ranked by literal overlap. A reworded copy scores lower here than a
    // pasted one, but rewriting a whole work without leaving a single shared
    // five-word run is not something a student actually does — so the real
    // copies still surface into the shortlist, and the AI settles which of them
    // is a copy, a rewrite, or two people quoting the same textbook. Only the
    // shortlist is read from disk; the vocabulary figure needs the candidate's
    // own words, which a fingerprint deliberately does not carry.
    scored.sort((a, b) => b.detection - a.detection);
    const finalists = scored.slice(0, Math.max(config.plagAiCandidates, 1) + 2);

    const useAi = config.plagAi && config.plagAiCandidates > 0 && geminiConfigured();
    const suspectWords = tokenize(comparisonText).norm;
    const suspectMeta = {
      text: comparisonText,
      assignmentTitle: assignment?.title || '',
      course: assignment?.course || '',
    };

    const results = [];
    let aiBudget = config.plagAiCandidates;

    for (const cand of finalists) {
      const snippets = matchedPassages(fp, cand.shared);
      let lexical = 0;
      let ai = null;
      let text = '';

      // Reading a candidate means re-parsing its PDF from disk, so it is only
      // worth doing while there is still an AI call left to spend on it: the
      // vocabulary figure below exists to decide whether to make that call, and
      // with the budget gone it would be computed and thrown away.
      if (useAi && aiBudget > 0) {
        text = await loadCandidateText(cand.row);
        lexical = lexicalSimilarity(suspectWords, tokenize(text).norm);
      }

      // The AI is only worth a call when something actually resembles this work.
      const nominate =
        useAi &&
        aiBudget > 0 &&
        text &&
        Math.max(cand.detection, lexical) >= config.plagAiMinSimilarity;

      if (nominate) {
        aiBudget -= 1;
        try {
          ai = await aiCompare({
            suspect: suspectMeta,
            candidate: { text },
            lexical,
            overlap: cand.detection,
            snippets,
            lang,
          });
        } catch (e) {
          console.error('Plagiarism AI comparison failed, keeping the literal figure:', e.message);
        }
      }

      // The reported figure is always "how much of THIS work came from
      // elsewhere", never "how much of the other work turns up here" — the
      // second number would zero a mostly-original work for one pasted
      // paragraph. The AI decides whenever it ran: it is the only stage that
      // can separate a reworded copy (raise) from two students quoting the same
      // textbook (lower).
      let similarity = cand.coverage;
      if (ai) {
        similarity = ai.verdict === 'copy' || ai.verdict === 'paraphrase'
          ? Math.max(cand.coverage, ai.similarity)
          : Math.min(cand.coverage, ai.similarity);
      }
      if (cand.exact) similarity = 100;

      results.push({
        submissionId: cand.row.id,
        studentId: cand.row.studentId,
        studentName: cand.row.student?.fullName || cand.row.student?.username || null,
        assignmentTitle: cand.row.assignment?.title || null,
        submittedAt: cand.row.submittedAt,
        similarity: Math.round(similarity * 10) / 10,
        lexicalSimilarity: Math.round(cand.coverage * 10) / 10,
        aiSimilarity: ai ? ai.similarity : null,
        verdict: ai ? ai.verdict : cand.exact ? 'copy' : 'lexical',
        explanation: ai ? ai.explanation : null,
        exact: cand.exact,
        detection: Math.round(cand.detection * 10) / 10,
        // The AI's own passage pairs are the better evidence when it ran, since
        // they cover reworded matches that the literal search cannot see.
        snippets: ai?.evidence?.length
          ? ai.evidence
          : snippets.map((s) => ({ suspect: s, source: s })),
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    const top = results[0];
    const score = top ? top.similarity : 0;
    const status = bandFor(score, !!top?.exact);

    // Only findings that mean something are kept: a 4% overlap on two unrelated
    // works is noise, and storing it would bury the real matches. A short but
    // near-total lift from another work is kept even when it is a small share of
    // this one — it costs no marks, but the teacher should still see it.
    const keep = results.filter(
      (r) => r.similarity >= Math.min(config.plagWarnAt, 15) || r.detection >= 60
    );
    await prisma.plagiarismMatch.deleteMany({ where: { submissionId } });
    if (keep.length) {
      await prisma.plagiarismMatch.createMany({
        data: keep.map((r) => ({
          submissionId,
          matchedSubmissionId: r.submissionId,
          matchedStudentId: r.studentId,
          similarity: r.similarity,
          lexicalSimilarity: r.lexicalSimilarity,
          aiSimilarity: r.aiSimilarity,
          verdict: r.verdict,
          explanation: r.explanation,
          snippets: JSON.stringify(r.snippets || []),
        })),
      });
    }

    return { score: Math.round(score * 10) / 10, status, matches: keep, report: null };
  } catch (e) {
    console.error('Plagiarism check failed:', e.message);
    return empty;
  }
}

/**
 * The reduction a similarity figure costs. Below `plagPenaltyFrom` nothing is
 * taken off — students working from the same course material legitimately
 * overlap, and a warning is the right response to that. Above it the grade is
 * scaled by how much of the work is not the student's own, so a 60% match keeps
 * 40% of the marks and a wholesale copy keeps essentially none.
 */
export function plagiarismPenalty(score, similarity) {
  if (!Number.isFinite(similarity) || similarity < config.plagPenaltyFrom) {
    return { score, penalty: 0 };
  }
  const reduced = Math.round(score * Math.max(0, 1 - similarity / 100) * 10) / 10;
  return { score: reduced, penalty: Math.round((score - reduced) * 10) / 10 };
}

/**
 * The warning the student reads, in their own language. Other students are
 * never named here — a student is told their work matches an earlier
 * submission, and the teacher's view is where whose work it was is shown.
 */
export function plagiarismReport(result, penalty, lang) {
  if (!result || !['low', 'moderate', 'high', 'duplicate'].includes(result.status)) return null;

  const percent = Math.round(result.score);
  const lines = [`**${t(lang, 'plagiarism.heading')}**`];

  if (result.status === 'duplicate') lines.push(t(lang, 'plagiarism.duplicate'));
  else lines.push(t(lang, `plagiarism.${result.status}`, { percent }));

  const top = result.matches?.[0];
  if (top?.explanation) lines.push(top.explanation);
  if (penalty > 0) lines.push(t(lang, 'plagiarism.penaltyApplied', { penalty: penalty.toFixed(1) }));
  else lines.push(t(lang, 'plagiarism.noPenalty'));

  const quotes = (top?.snippets || []).slice(0, 2).map((s) => s.suspect).filter(Boolean);
  if (quotes.length) {
    lines.push('', t(lang, 'plagiarism.matchedPassages'));
    for (const q of quotes) lines.push(`• "${q.slice(0, 220)}"`);
  }

  return lines.join('\n');
}
