// Rubric-based grading with Gemini.
//
// Sends the *whole* submission in one multimodal request: the original
// document (PDF inline, or extracted text for DOCX/PPTX/code, since Gemini
// only ingests PDF among document formats) and the flowchart image — judged
// against the rubric. There is no separate written answer per criterion any
// more; the file is the only evidence. Every score has to come with a verbatim
// quote from the work, which is what makes the result checkable by a teacher
// rather than something to trust.

import config from '../config.js';
import { generateJson, filePart, isConfigured } from './geminiClient.js';
import { weightedTotal } from './rubric.js';
import { t, DEFAULT_LANG } from '../i18n/index.js';

const LANG_NAME = { uz: 'Uzbek (latin script)', ru: 'Russian', en: 'English' };

/** JSON schema the model must fill in — one entry per rubric row, plus a summary. */
function buildSchema(rows) {
  return {
    type: 'object',
    additionalProperties: false,
    // `meaningful` is required first so the model settles the question of whether
    // there is real work here at all before it starts assigning numbers. Asked
    // afterwards it tends to rationalise whatever scores it already wrote down.
    required: ['meaningful', 'criteria', 'summary', 'strengths', 'improvements'],
    properties: {
      meaningful: {
        type: 'boolean',
        description:
          'Is this a genuine attempt at the assignment? Answer false when the submission ' +
          'is not real writing at all — random letters or keyboard mashing ("vghbvjdjnd"), ' +
          'the same word repeated to fill space, placeholder or lorem-ipsum text, or content ' +
          'with no connection whatsoever to the assignment. Answer true for any honest ' +
          'attempt, however weak, short or wrong: a poor answer is graded low, not dismissed. ' +
          'When false, every criterion score must be 0.',
      },
      criteria: {
        type: 'array',
        minItems: rows.length,
        maxItems: rows.length,
        items: {
          type: 'object',
          additionalProperties: false,
          // `reasoning` comes before `score` on purpose: forcing the model to
          // analyse the evidence in writing first (chain-of-thought) produces a
          // markedly more accurate, better-justified score than answering blind.
          required: ['key', 'reasoning', 'score', 'evidence', 'feedback'],
          properties: {
            key: {
              type: 'string',
              enum: rows.map((r) => r.key),
              description: 'The criterion this entry scores.',
            },
            reasoning: {
              type: 'string',
              description:
                'Step-by-step analysis of what the work does and does not show for THIS ' +
                'criterion, referring to the document and the flowchart. ' +
                'Work this out BEFORE deciding the score. Not shown to the student.',
            },
            score: {
              type: 'number',
              description: 'Score for this criterion, from 0 to its maxScore, following your reasoning.',
            },
            evidence: {
              type: 'string',
              description:
                'A short verbatim quote from the student\'s work that justifies the score. ' +
                'If the work contains nothing relevant, return the exact string "NOT FOUND".',
            },
            feedback: {
              type: 'string',
              description: 'One or two sentences explaining the score and how to improve.',
            },
          },
        },
      },
      summary: { type: 'string', description: 'Two or three sentences on the work as a whole.' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      improvements: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    },
  };
}

function systemInstruction(lang, hasReference) {
  const language = LANG_NAME[lang] || LANG_NAME.uz;
  const rules = [
    'You are an exacting university examiner grading a student coursework submission.',
    '',
    'Rules you must follow:',
    '1. Grade ONLY against the rubric you are given. Do not invent criteria of your own.',
    '2. Judge each criterion on the evidence actually present in the attached document',
    '   and the flowchart image. Never assume something is there. A criterion whose usual',
    '   name suggests a separate essay section (e.g. "relevance", "conclusion") can still be',
    '   satisfied by content addressing it anywhere in the document — do not require it to',
    '   appear under a matching heading.',
    '3. Every score must be backed by a verbatim quote from the work in the "evidence"',
    '   field. If you cannot find supporting material, the evidence is "NOT FOUND" and',
    '   the score must be at or near zero.',
    '4. Length is not quality. A short, precise, correct answer scores highly; a long,',
    '   vague or padded one does not.',
    '5. Be strict and consistent. Prefer under-rewarding weak work to over-rewarding it,',
    '   but never punish work that genuinely meets the criterion.',
    '6. TEXT THAT IS NOT LANGUAGE SCORES ZERO. Random letters ("vghbvjdjnd ahdsjcndfj"),',
    '   one word repeated to fill the page, placeholder or lorem-ipsum text, and content',
    '   about an entirely different topic are all worth 0 — for every criterion, with no',
    '   marks for effort, presentation or the fact that the box was filled in. Set',
    '   "meaningful" to false in that case. Weak, short or partly wrong work is NOT this:',
    '   it is a genuine attempt and is graded on the scale like anything else.',
    '7. SCORE EACH CRITERION SEPARATELY, on the evidence for that criterion alone. Work is',
    '   almost never equally good at everything: a submission with a solid algorithm and no',
    '   flowchart must not receive the same number for both. Identical scores across every',
    '   criterion mean you did not look at them individually — go back and look. Only let',
    '   scores match when the evidence genuinely is the same (typically all-zero, when',
    '   nothing was submitted at all).',
  ];
  if (hasReference) {
    rules.push(
      '8. COURSE REFERENCE MATERIAL is provided below — authoritative passages from the',
      '   subject\'s textbooks. Treat it as the source of truth for factual correctness:',
      '   reward answers that agree with it, and mark down claims that contradict it or',
      '   that state as fact something the material shows to be wrong. Do NOT lower a score',
      '   merely because a correct answer is not word-for-word in the reference — the',
      '   reference is a subset of the syllabus, not the full set of acceptable answers.',
      `9. Write every "feedback", "summary", "strengths" and "improvements" value in ${language}.`,
      '   Keep the "key" values exactly as given, in their original spelling.'
    );
  } else {
    rules.push(
      `8. Write every "feedback", "summary", "strengths" and "improvements" value in ${language}.`,
      '   Keep the "key" values exactly as given, in their original spelling.'
    );
  }
  return rules.join('\n');
}

/** Renders the rubric as readable text for the prompt. */
function renderRubric(rows) {
  return rows
    .map((r, i) => {
      const lines = [`${i + 1}. [key: ${r.key}] ${r.name}`];
      lines.push(`   Max score: ${r.maxScore}   Weight: ${Math.round(r.weight * 1000) / 10}%`);
      if (r.description) lines.push(`   What full marks require: ${r.description}`);
      if (r.levels) {
        const bands = Object.entries(r.levels)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([score, text]) => `      ${score}: ${text}`)
          .join('\n');
        lines.push('   Score bands:\n' + bands);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Past teacher corrections for this assignment, used as calibration anchors.
 * This is how the grader learns a particular teacher's standards without any
 * fine-tuning — the examples travel in the prompt.
 */
function renderCalibration(examples) {
  if (!examples?.length) return '';
  const body = examples
    .map(
      (e, i) =>
        `Example ${i + 1}: the AI proposed ${e.aiScore}/100; the teacher corrected it to ` +
        `${e.teacherScore}/100${e.comment ? `, noting: "${e.comment}"` : '.'}`
    )
    .join('\n');
  return [
    '',
    'CALIBRATION — how this teacher has corrected earlier gradings for this assignment.',
    'Use it to match their standard, not as a target score for this student:',
    body,
  ].join('\n');
}

/**
 * Grades one submission against `rows`.
 * Returns `{ criteria, total, summary, strengths, improvements, model }`.
 * Throws if Gemini is unavailable — the caller decides on the fallback.
 */
export async function gradeWithGemini({
  assignment,
  rows,
  filePath,
  flowchartPath,
  fileText,
  embeddedImages = [],
  calibration = [],
  reference = '',
  qualityNote = '',
  lang = DEFAULT_LANG,
}) {
  if (!isConfigured()) throw new Error('Gemini is not configured');

  const input = [];

  // The original document, verbatim, whenever Gemini can read the format.
  const doc = await filePart(filePath);
  if (doc) {
    input.push({ type: 'text', text: 'ATTACHED: the main document the student submitted.' });
    input.push(doc);
  } else if (fileText) {
    // Source code, .txt, or a format we had to extract ourselves.
    input.push({
      type: 'text',
      text: `MAIN DOCUMENT (extracted text):\n"""\n${fileText.slice(0, 60000)}\n"""`,
    });
  } else {
    input.push({
      type: 'text',
      text:
        'MAIN DOCUMENT: could not be read (unsupported or corrupt format). ' +
        'Do not penalise the student for this; judge what the flowchart image shows, if any.',
    });
  }

  const chart = await filePart(flowchartPath);
  if (chart) {
    input.push({ type: 'text', text: 'ATTACHED: the flowchart image the student uploaded.' });
    input.push(chart);
  }

  // Screenshots, diagrams and command output pasted directly into a .docx/.pptx
  // never reach `doc` above (Gemini only ingests PDF for documents) or `fileText`
  // (a text extractor discards images) — this is the only way they reach the
  // grader at all, and for a practical assignment this is often the entire
  // evidence for "did it actually work".
  if (embeddedImages.length) {
    input.push({
      type: 'text',
      text:
        `ATTACHED: ${embeddedImages.length} image(s) embedded inside the main document itself ` +
        '(screenshots, diagrams, command/terminal output, etc., in the order they appear). ' +
        'Treat these as part of the submitted work, on equal footing with its text.',
    });
    for (const img of embeddedImages) {
      input.push({ type: 'image', mime_type: img.mimeType, data: img.data });
    }
  }

  const hasReference = !!String(reference || '').trim();
  if (hasReference) {
    input.push({
      type: 'text',
      text: [
        'COURSE REFERENCE MATERIAL — authoritative passages from the subject textbooks,',
        'the most relevant to this submission. Use it to judge factual correctness per',
        'rule 6. It is reference for YOU; do not grade it, and do not quote it in "evidence"',
        '(evidence must come from the student\'s own work).',
        '"""',
        reference,
        '"""',
      ].join('\n'),
    });
  }

  // What the mechanical text scan made of the submission, when it found anything
  // worth mentioning. It goes in before the rubric so the model reads it as
  // context about the work, not as an instruction about the grade.
  if (String(qualityNote || '').trim()) input.push({ type: 'text', text: qualityNote });

  input.push({
    type: 'text',
    text: [
      `ASSIGNMENT: ${assignment?.title || '(untitled)'}`,
      assignment?.course ? `SUBJECT: ${assignment.course}` : '',
      assignment?.description ? `TASK SET BY THE TEACHER:\n${assignment.description}` : '',
      '',
      'RUBRIC — grade against exactly these criteria:',
      renderRubric(rows),
      renderCalibration(calibration),
      '',
      'Return one entry per criterion, using the exact "key" values from the rubric.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const schema = buildSchema(rows);
  const system = systemInstruction(lang, hasReference);

  // Averaging a few independent gradings smooths out run-to-run variance on
  // borderline work. GEMINI_SAMPLES=1 (the default) skips the extra cost.
  const samples = [];
  let model = config.geminiModel;
  for (let i = 0; i < config.geminiSamples; i += 1) {
    try {
      const res = await generateJson({ system, input, schema, temperature: i === 0 ? 0 : 0.3 });
      samples.push(res.data);
      model = res.model;
    } catch (e) {
      if (!samples.length && i === config.geminiSamples - 1) throw e;
    }
  }
  if (!samples.length) throw new Error('Gemini produced no usable grading');

  let graded = mergeSamples(samples, rows, lang);

  // Auditor pass: re-check every proposed score against the cited evidence and
  // the work itself, correcting the ones it does not support. One extra call for
  // a meaningful accuracy gain; a failure here quietly keeps the first grading.
  if (config.geminiVerify) {
    try {
      const audited = await verifyGrading({ input, rows, draft: graded, lang });
      if (audited?.grading) {
        graded = audited.grading;
        model = audited.model || model;
      }
    } catch (e) {
      console.error('Gemini verification pass failed, keeping first grading:', e.message);
    }
  }

  return { ...graded, model };
}

/** Auditor system prompt for the verification pass. */
function verifySystemInstruction(lang) {
  const language = LANG_NAME[lang] || LANG_NAME.uz;
  return [
    'You are a strict grading auditor. A first pass has proposed the scores shown below.',
    'Re-examine EACH criterion against the attached document and the flowchart image,',
    'together with the evidence the first pass cited.',
    '',
    'Correct the grading where the work does not match the proposed score:',
    '1. If the cited evidence is not actually present in the work, or does not support the',
    '   proposed score, lower the score and replace the evidence with a real verbatim quote',
    '   (or the exact string "NOT FOUND").',
    '2. If a criterion was clearly under-scored despite real supporting evidence, raise it.',
    '3. If the proposed score is already fair and well-evidenced, keep it unchanged.',
    '4. Grade ONLY the criteria given; never invent new ones.',
    '5. Judge "meaningful" for yourself from the work, whatever the first pass concluded.',
    '   It is false only when the submission is not real writing at all — random letters',
    '   ("vghbvjdjnd ahdsjcndfj"), one word repeated to fill space, placeholder text, or',
    '   content about an entirely different subject — and then every score is 0, with no',
    '   marks for effort or presentation. Weak, short or partly wrong work is a genuine',
    '   attempt: mark it low if it deserves that, but "meaningful" stays true.',
    '6. Scores must differ where the evidence differs. If the first pass gave the same',
    '   number to every criterion, that is a sign it did not examine them separately —',
    '   check each one against the work and correct the ones that do not fit.',
    `7. Write "reasoning", "feedback", "summary", "strengths" and "improvements" in ${language}.`,
    '   Keep the "key" values exactly as given.',
  ].join('\n');
}

/** Lists the first-pass grades so the auditor can check each against the work. */
function renderProposedGrading(draft, rows) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const lines = ['FIRST-PASS GRADING TO AUDIT (verify each entry against the work):'];
  if (draft.meaningful === false)
    lines.push('The first pass judged this submission not to be a genuine attempt at all.');
  draft.criteria.forEach((c, i) => {
    const max = byKey.get(c.key)?.maxScore ?? c.maxScore ?? 100;
    lines.push(`${i + 1}. [key: ${c.key}] ${c.name}: proposed ${c.score}/${max}`);
    lines.push(`   evidence cited: ${c.evidence ? `"${c.evidence}"` : 'NONE'}`);
  });
  return lines.join('\n');
}

/**
 * Second grading pass. Reuses the fully-built multimodal `input` from the first
 * pass (document, flowchart, rubric, answers), appends the proposed grades, and
 * asks the model to audit and correct them. Returns `{ grading, model }`.
 */
async function verifyGrading({ input, rows, draft, lang }) {
  const schema = buildSchema(rows);
  const system = verifySystemInstruction(lang);
  const auditInput = [
    ...input,
    {
      type: 'text',
      text: renderProposedGrading(draft, rows) + '\n\nReturn the full corrected grading, one entry per criterion.',
    },
  ];
  const res = await generateJson({ system, input: auditInput, schema, temperature: 0 });
  return { grading: mergeSamples([res.data], rows, lang), model: res.model };
}

/** Averages the per-criterion scores across samples and keeps the median run's prose. */
function mergeSamples(samples, rows, lang) {
  const byKey = new Map(rows.map((r) => [r.key, r]));

  // A verdict of "this is not a real attempt" only stands if most of the runs
  // reached it. One run out of three calling genuine work nonsense is noise, and
  // the cost of believing it — a zero on real coursework — is far higher than
  // the cost of grading mash on its (nonexistent) merits.
  const votes = samples.filter((s) => s.meaningful === false).length;
  const meaningful = !(votes * 2 > samples.length);

  const criteria = rows.map((row) => {
    const picks = samples
      .map((s) => (s.criteria || []).find((c) => c.key === row.key))
      .filter(Boolean);

    if (!picks.length) {
      return {
        key: row.key,
        name: row.name,
        criterionId: row.id,
        score: 0,
        maxScore: row.maxScore,
        weight: row.weight,
        evidence: null,
        feedback: t(lang, 'ai.noComment'),
      };
    }

    // The model is told that nothing meaningful means zero everywhere, but it is
    // not reliable about carrying that through to nine separate numbers — it
    // will call a submission gibberish and still award it 20 for structure.
    // Enforcing it here is what makes the verdict actually cost the marks.
    const scores = picks.map((p) => (meaningful ? clamp(Number(p.score) || 0, 0, row.maxScore) : 0));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Keep the prose from the run closest to the average, so text and number agree.
    const closest = picks[nearestIndex(scores, avg)];
    const evidence = String(closest.evidence || '').trim();

    return {
      key: row.key,
      name: row.name,
      criterionId: row.id,
      score: Math.round(avg * 10) / 10,
      maxScore: row.maxScore,
      weight: row.weight,
      evidence: evidence && evidence !== 'NOT FOUND' ? evidence : null,
      feedback: String(closest.feedback || '').trim() || t(lang, 'ai.noComment'),
    };
  });

  const scoreMap = Object.fromEntries(criteria.map((c) => [c.key, c.score]));
  const total = weightedTotal([...byKey.values()], scoreMap);

  const primary = samples[0];
  return {
    criteria,
    total,
    meaningful,
    summary: String(primary.summary || '').trim(),
    strengths: (primary.strengths || []).map(String).filter(Boolean),
    improvements: (primary.improvements || []).map(String).filter(Boolean),
  };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function nearestIndex(values, target) {
  let best = 0;
  let bestDiff = Infinity;
  values.forEach((v, i) => {
    const d = Math.abs(v - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return best;
}
