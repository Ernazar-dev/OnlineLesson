// Ported from services/ai_service.py
// Evaluates coursework sections via OpenRouter free models, with a deterministic
// mock fallback so the platform keeps working without an API key.

import config from '../config.js';
import { analyzeText } from './textQuality.js';
import { t, DEFAULT_LANG, sectionTitle } from '../i18n/index.js';

const FALLBACK_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
];

// Subject-agnostic on purpose: the platform grades coursework, networking labs,
// database exercises and everything else through the same fallback rubric, so
// it cannot assume a report structure (an intro/motivation section, a maths
// model, a references list) that only some assignments actually have. Each
// criterion is judged straight off whatever the student submitted.
export const ORDERED_SECTIONS = ['Requirements', 'Correctness', 'Evidence', 'Clarity'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOpenRouter(messages) {
  if (!config.openRouterApiKey) return 'MOCK_FALLBACK';

  const headers = {
    Authorization: `Bearer ${config.openRouterApiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': config.siteUrl,
    'X-Title': config.siteName,
  };

  for (const model of FALLBACK_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 200) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) return content;
      }
      // Only retry other models on rate-limit / server errors
      if (![429, 500, 502, 503, 504].includes(res.status)) return null;
      await sleep(1000);
    } catch (e) {
      // network/abort — try the next model
      continue;
    }
  }
  return 'MOCK_FALLBACK';
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * How much substance a piece of writing shows, from 0 to 1, judged without
 * understanding a word of it.
 *
 * This exists because the fallback scorer used to look only at length, so every
 * section over 300 characters came back with exactly 65 — nine identical marks
 * on a report that claims to grade nine different things. These signals are
 * crude, but they are signals a keyboard-masher and a padder do not produce,
 * and they differ from section to section, which is the point: the numbers
 * spread out according to something in the text rather than sitting on a step.
 */
function substanceOf(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length > 1);
  if (words.length < 5) return 0;

  // Real prose reuses words; filler reuses them far more. Around 0.6 unique is
  // ordinary for a paragraph of academic writing, so that is where this tops out.
  const diversity = clamp01(new Set(words).size / words.length / 0.6);
  // Complete sentences: an argument that is developed rather than a list of nouns.
  const sentences = String(text).split(/[.!?…\n]+/).filter((s) => s.trim().length > 15).length;
  const structure = clamp01(sentences / 6);
  // Long words stand in for subject terminology across all three languages.
  const technical = clamp01(words.filter((w) => w.length >= 8).length / words.length / 0.18);
  // Figures, dates, equations, reference numbers — the marks of specific content.
  const specifics = /\d/.test(text) ? 1 : 0;

  return clamp01(0.4 * diversity + 0.3 * structure + 0.2 * technical + 0.1 * specifics);
}

/**
 * Scores a section with no model available. It cannot judge whether an answer is
 * *correct* — only whether it is written work at all, and how much of it there
 * is — so it stays well below full marks however good the text looks.
 */
function mockEvaluate(content = '', lang = DEFAULT_LANG) {
  const clean = String(content || '').trim();
  const len = clean.length;

  // Before any credit for length: is this language? "vghbvjdjnd ahdsjcndfj"
  // repeated to 400 characters used to score 65 here, and the student learned
  // that filling the box was enough.
  const quality = analyzeText(clean);
  if (quality.verdict === 'nonsense')
    return { score: 0, feedback: `[System Fallback] ${t(lang, 'ai.nonsenseCriterion')}` };

  if (len < 10)
    return { score: 0, feedback: `[System Fallback] ${t(lang, 'ai.sectionEmpty')}` };

  // The band comes from length, the position within it from the signals above,
  // so two sections of the same length no longer score the same.
  let lo;
  let hi;
  let key;
  if (len < 100) {
    [lo, hi, key] = [20, 35, 'ai.tooShort'];
  } else if (len < 300) {
    [lo, hi, key] = [40, 55, 'ai.basicDescription'];
  } else {
    [lo, hi, key] = [50, 68, 'ai.contentNoAnalysis'];
  }

  let score = lo + (hi - lo) * substanceOf(clean);
  // Part-gibberish is graded on the part that is writing, not on the whole.
  if (quality.gibberishRatio > 0) score *= 1 - quality.gibberishRatio;

  return { score: Math.round(score), feedback: `[System Fallback] ${t(lang, key)}` };
}

function commentForScore(score, lang) {
  const s = Number(score) || 0;
  if (s >= 85) return t(lang, 'ai.strongSection');
  if (s >= 70) return t(lang, 'ai.goodSection');
  if (s >= 50) return t(lang, 'ai.satisfactory');
  return t(lang, 'ai.weakSection');
}

export function buildOverallFeedbackFallback(scoresDict, totalScore, isMock = false, lang = DEFAULT_LANG) {
  const safe = {};
  for (const k of ORDERED_SECTIONS) safe[k] = Number(scoresDict[k] || 0) || 0;

  const ranked = Object.entries(safe).sort((a, b) => a[1] - b[1]);
  const names = (entries) => entries.map(([n]) => sectionTitle(lang, n)).join(', ');
  const weakest = names(ranked.slice(0, 3));
  const strongest = names(ranked.slice(-3));
  const scoreInt = Math.round(Number(totalScore || 0));
  const prefix = isMock ? '[Mock AI] ' : '';

  const summary = prefix + t(lang, 'ai.summary', { score: scoreInt, strongest, weakest });
  const c1 = prefix + t(lang, 'ai.pros', { strongest });
  const c2 = prefix + t(lang, 'ai.growth', { weakest });

  const lines = [
    `Summary: ${summary}`,
    `Comment 1: ${c1}`,
    `Comment 2: ${c2}`,
    t(lang, 'ai.perPointHeader'),
  ];
  ORDERED_SECTIONS.forEach((sec, idx) => {
    const v = Math.round(safe[sec] || 0);
    lines.push(`${idx + 1}) ${sectionTitle(lang, sec)}: ${v}/100 — ${commentForScore(v, lang)}`);
  });
  return lines.join('\n');
}

/**
 * Legacy fallback grading for one rubric row, judged directly against the
 * whole submitted file — the student no longer writes a separate answer per
 * section, so the file is the only evidence there is. Only used when Gemini
 * is unavailable; Gemini reads the original document itself and grades every
 * criterion in one multimodal pass instead of calling this per row.
 */
export async function evaluateSectionFromFile(sectionName, description, fileText, lang = DEFAULT_LANG) {
  const clean = (fileText || '').trim();

  // Nothing to grade against at all — same verdict a written answer this
  // short would get, just phrased for a missing/near-empty file.
  if (clean.length < 20) return { score: 0, feedback: t(lang, 'ai.unreadableCriterion') };

  // Text that is not language costs no API call and earns no marks.
  const quality = analyzeText(clean);
  if (quality.verdict === 'nonsense') return { score: 0, feedback: t(lang, 'ai.nonsenseCriterion') };

  const prompt = t(lang, 'prompt.evaluateSectionFromFile', {
    sectionName,
    description: description || t(lang, 'ai.noFileContext'),
    fileText: clean.slice(0, 6000),
  });

  const responseText = await callOpenRouter([{ role: 'user', content: prompt }]);
  if (!responseText || responseText === 'MOCK_FALLBACK') return mockEvaluate(clean, lang);

  try {
    let text = responseText.trim();
    if (text.includes('```json')) text = text.split('```json')[1].split('```')[0];
    else if (text.includes('```')) text = text.split('```')[1].split('```')[0];
    else if (text.includes('{') && text.includes('}'))
      text = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);

    const result = JSON.parse(text);
    let score = Number(result.score || 0);
    score = Math.max(0, Math.min(100, score));
    if (quality.gibberishRatio > 0) score = Math.round(score * (1 - quality.gibberishRatio));
    return { score, feedback: result.feedback || t(lang, 'ai.noComment') };
  } catch (e) {
    return mockEvaluate(clean, lang);
  }
}

export async function generateOverallFeedback(scoresDict, totalScore, lang = DEFAULT_LANG) {
  const perPointHeader = t(lang, 'ai.perPointHeader');
  const prompt = t(lang, 'prompt.overallFeedback', {
    scores: JSON.stringify(scoresDict, null, 2),
    totalScore: totalScore.toFixed(1),
    perPointHeader,
  });

  const responseText = await callOpenRouter([{ role: 'user', content: prompt }]);
  if (!responseText || responseText === 'MOCK_FALLBACK')
    return buildOverallFeedbackFallback(scoresDict, totalScore, true, lang);

  try {
    let text = responseText.trim().replace(/^\s*```\s*/, '').replace(/\s*```\s*$/, '');
    if (!text.includes('Summary:') || !text.includes('Comment 1:') || !text.includes('Comment 2:'))
      return buildOverallFeedbackFallback(scoresDict, totalScore, false, lang);

    const scoreInt = Math.round(Number(totalScore || 0));
    let summaryPart = '';
    try {
      summaryPart = text.split('Summary:')[1].split('Comment 1:')[0].trim();
    } catch (e) {
      summaryPart = '';
    }
    if (!summaryPart.includes(String(scoreInt))) {
      const justification = t(lang, 'ai.scoreJustification', { score: scoreInt });
      text = text.replace('Summary:', `Summary: ${justification}`);
    }
    if (!text.includes(perPointHeader))
      return buildOverallFeedbackFallback(scoresDict, totalScore, false, lang);
    return text;
  } catch (e) {
    return buildOverallFeedbackFallback(scoresDict, totalScore, false, lang);
  }
}
