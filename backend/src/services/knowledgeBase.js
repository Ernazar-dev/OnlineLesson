// Course knowledge base.
//
// Turns the teacher's reference material — the textbooks and lecture notes in
// the KB directory, plus any Books uploaded for the subject — into the specific
// passages most relevant to a given submission, which the grader then treats as
// the authoritative source. This is what lets the AI check a Network Security
// answer against the actual course text instead of its own general knowledge,
// and its accuracy grows as more material is added.
//
// Retrieval is deliberately dependency-free: reference text is split into
// passages and ranked against the submission by term overlap (a small TF-IDF).
// Good enough to surface the right pages of a textbook, with nothing to install
// or keep running.

import fs from 'fs/promises';
import path from 'path';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { extractFileContent } from './fileParser.js';
import { materializeBookFile } from './bookFileCache.js';

// Extensions we can pull text out of. Anything else in the folder is ignored
// (cover images, .doc/.ppt legacy binaries fileParser can't read, etc.).
const READABLE = new Set(['.pdf', '.docx', '.pptx', '.txt', '.md']);

const PASSAGE_CHARS = 1200; // ~300 words — about a section of a textbook page.

// Stop-words across the three languages the material and answers use, so
// ranking keys on real subject terms (TCP, marshrutlash, шифрование) rather than
// on "and/the/va/hám/что". Kept small on purpose.
const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have', 'has',
  'was', 'were', 'not', 'but', 'you', 'all', 'can', 'will', 'each', 'which',
  // Uzbek / Karakalpak (latin)
  'va', 'yoki', 'ham', 'hám', 'bilan', 'uchun', 'bul', 'bir', 'bolib', 'boladi',
  'edi', 'emas', 'ushbu', 'shu', 'ushın', 'menen', 'yani', 'yaʼni',
  // Russian
  'что', 'это', 'как', 'для', 'или', 'при', 'все', 'так', 'его', 'она',
  'который', 'быть', 'если', 'этом', 'также',
]);

/** Splits a word stream out of mixed-script text, dropping noise and stopwords. */
function terms(text) {
  return String(text || '')
    .toLowerCase()
    // Keep latin (incl. the textbook's ó/ú/ı/ń/ǵ/á letters) and cyrillic.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// ---- Extraction cache -----------------------------------------------------
// Extracting a 3 MB textbook takes ~1s; do it once per file per process and
// re-read only when the file changes on disk.
const cache = new Map(); // absPath -> { mtimeMs, passages }

/** Breaks text into passages on paragraph/sentence boundaries, near PASSAGE_CHARS. */
function toPassages(text) {
  const clean = String(text || '').replace(/\s+\n/g, '\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}|\n(?=\s*[A-ZА-ЯÓÚÍŃ0-9])/);
  const passages = [];
  let buf = '';
  for (const p of paras) {
    const chunk = p.trim();
    if (!chunk) continue;
    if ((buf + ' ' + chunk).length > PASSAGE_CHARS && buf) {
      passages.push(buf.trim());
      buf = chunk;
    } else {
      buf = buf ? `${buf}\n${chunk}` : chunk;
    }
    // A single very long paragraph still has to be broken up.
    while (buf.length > PASSAGE_CHARS * 1.6) {
      passages.push(buf.slice(0, PASSAGE_CHARS).trim());
      buf = buf.slice(PASSAGE_CHARS);
    }
  }
  if (buf.trim()) passages.push(buf.trim());
  return passages;
}

async function loadPassages(absPath, label) {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return [];
  }
  const hit = cache.get(absPath);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.passages;

  const { text, extracted } = await extractFileContent(absPath);
  const passages = extracted && text
    ? toPassages(text).map((body, i) => ({ body, source: label, ord: i, tf: termFreq(body) }))
    : [];
  cache.set(absPath, { mtimeMs: stat.mtimeMs, passages });
  return passages;
}

/** Term-frequency map for one passage, memoised so ranking is a cheap lookup. */
function termFreq(text) {
  const tf = new Map();
  for (const w of terms(text)) tf.set(w, (tf.get(w) || 0) + 1);
  return tf;
}

// ---- Source discovery -----------------------------------------------------

/** Absolute path of the KB directory, resolved against the backend root. */
function kbRoot() {
  return path.resolve(process.cwd(), config.kbDir);
}

/** Slugs a subject name so it can match a sub-folder name loosely. */
const slug = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Reference files that apply to this submission:
 *   - flat files in the KB dir (shared course library);
 *   - files in a KB sub-folder whose name matches the subject;
 *   - Books uploaded for this subject.
 * Each is returned as `{ absPath, label }`.
 */
async function discoverSources({ subjectId, courseName }) {
  const out = [];
  const seen = new Set();
  const add = (absPath, label) => {
    const key = path.resolve(absPath);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ absPath: key, label });
  };

  const root = kbRoot();
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    entries = []; // KB dir absent — books alone may still provide material.
  }

  const wanted = new Set([slug(courseName)].filter(Boolean));
  for (const e of entries) {
    if (e.isFile() && READABLE.has(path.extname(e.name).toLowerCase())) {
      add(path.join(root, e.name), e.name);
    } else if (e.isDirectory() && (wanted.has(slug(e.name)) || wanted.size === 0)) {
      // Subject-specific sub-folder (or, with no subject known, every folder).
      let sub = [];
      try {
        sub = await fs.readdir(path.join(root, e.name), { withFileTypes: true });
      } catch {
        sub = [];
      }
      for (const f of sub) {
        if (f.isFile() && READABLE.has(path.extname(f.name).toLowerCase())) {
          add(path.join(root, e.name, f.name), `${e.name}/${f.name}`);
        }
      }
    }
  }

  // Books the teacher uploaded for this subject. Assignments reference a subject
  // by id OR just by course name, so resolve the id from the name when needed —
  // otherwise a subject's uploaded books would be invisible to grading.
  try {
    let sid = subjectId;
    if (!sid && courseName) {
      const subject = await prisma.subject.findFirst({ where: { name: String(courseName).trim() } });
      sid = subject?.id ?? null;
    }
    if (sid) {
      const books = await prisma.book.findMany({ where: { subjectId: sid } });
      for (const b of books) {
        if (b.fileData && READABLE.has(path.extname(b.fileName || '').toLowerCase())) {
          const abs = await materializeBookFile(b);
          if (abs) add(abs, b.title || b.fileName);
        } else if (b.filePath && READABLE.has(path.extname(b.filePath).toLowerCase())) {
          // Legacy row uploaded before files moved into the database.
          add(path.resolve(b.filePath), b.title || path.basename(b.filePath));
        }
      }
    }
  } catch {
    /* DB unavailable — fall back to folder material only. */
  }

  return out;
}

// ---- Public API -----------------------------------------------------------

/**
 * Returns the reference passages most relevant to a submission, formatted for
 * the grading prompt, plus the list of sources drawn on.
 *
 * @returns {Promise<{ text: string, sources: string[], passageCount: number }>}
 */
export async function getSubjectReference({
  subjectId,
  courseName,
  queryText,
  maxChars = config.kbMaxChars,
}) {
  if (!config.kbEnabled) return { text: '', sources: [], passageCount: 0 };

  const sources = await discoverSources({ subjectId, courseName });
  if (!sources.length) return { text: '', sources: [], passageCount: 0 };

  // Gather every passage from every source.
  const all = [];
  for (const s of sources) {
    const passages = await loadPassages(s.absPath, s.label);
    for (const p of passages) all.push(p);
  }
  if (!all.length) return { text: '', sources: [], passageCount: 0 };

  const query = terms(queryText);
  if (!query.length) return { text: '', sources: [], passageCount: 0 };

  // IDF: a term shared by every passage tells us nothing; a rare one is gold.
  const df = new Map();
  for (const p of all) for (const w of p.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = all.length;
  const idf = (w) => Math.log(1 + N / (1 + (df.get(w) || 0)));

  const queryTerms = [...new Set(query)];
  const scored = all.map((p) => {
    let score = 0;
    for (const w of queryTerms) {
      const tf = p.tf.get(w);
      if (tf) score += (1 + Math.log(tf)) * idf(w);
    }
    // Normalise by passage length so a long passage isn't favoured just for size.
    return { p, score: score / Math.sqrt(p.body.length || 1) };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const usedSources = new Set();
  let total = 0;
  for (const { p, score } of scored) {
    if (score <= 0) break;
    if (total + p.body.length > maxChars && picked.length) break;
    picked.push(p);
    usedSources.add(p.source);
    total += p.body.length;
    if (total >= maxChars) break;
  }
  if (!picked.length) return { text: '', sources: [], passageCount: 0 };

  // Group the chosen passages under their source so the model can attribute them.
  const bySource = new Map();
  for (const p of picked) {
    if (!bySource.has(p.source)) bySource.set(p.source, []);
    bySource.get(p.source).push(p);
  }
  const blocks = [];
  for (const [source, list] of bySource) {
    list.sort((a, b) => a.ord - b.ord);
    blocks.push(`### Source: ${source}\n${list.map((p) => p.body).join('\n…\n')}`);
  }

  return {
    text: blocks.join('\n\n'),
    sources: [...usedSources],
    passageCount: picked.length,
  };
}

/** Clears the extraction cache (e.g. after new material is uploaded). */
export function clearKnowledgeBaseCache() {
  cache.clear();
}

export default getSubjectReference;
