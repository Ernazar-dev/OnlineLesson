// Grades a submission in the background and recalculates the student's rating.
// Executed fire-and-forget after a submission so the HTTP request returns fast.
//
// Two engines, tried in order:
//   1. Gemini  — reads the original document and the flowchart image, grades
//                against the assignment's rubric, and cites evidence per score.
//   2. Legacy  — an OpenRouter/mock path that grades each rubric row against
//                the extracted file text, used when no Gemini key is
//                configured or the call fails.
// Both produce the same shape, so everything downstream is engine-agnostic.

import prisma from '../lib/prisma.js';
import {
  evaluateSectionFromFile,
  generateOverallFeedback,
  buildOverallFeedbackFallback,
} from './aiService.js';
import { calculateFinalScore } from './fuzzyLogic.js';
import { getOrCreateSubject } from './subjectService.js';
import { resolveRubric, weightedTotal } from './rubric.js';
import { gradeWithGemini } from './geminiGrader.js';
import { isConfigured as geminiConfigured } from './geminiClient.js';
import { getSubjectReference } from './knowledgeBase.js';
import { extractFileContent } from './fileParser.js';
import { analyzeSubmission, qualityNote } from './textQuality.js';
import {
  buildComparisonText,
  checkPlagiarism,
  plagiarismPenalty,
  plagiarismReport,
} from './plagiarismService.js';
import { appendAdminLog, encodeDetails } from '../utils/logger.js';
import { bestAttempts, countingScores } from '../utils/attempts.js';
import { t, DEFAULT_LANG } from '../i18n/index.js';

/** How many past teacher corrections to send as calibration anchors. */
const CALIBRATION_LIMIT = 5;

export async function processSubmission({
  submissionId,
  assignmentId,
  studentId,
  filePath,
  flowchartPath,
  lang = DEFAULT_LANG,
}) {
  try {
    // Reading the document (pdf-parse / mammoth / zip decompression) is
    // synchronous CPU work — done here, in the background job, rather than in
    // the request handler that accepted the upload. Both places pay the same
    // parsing cost, but only this one no longer makes the student who just
    // clicked "submit" sit and watch a spinner for it, and near a deadline
    // (when many students submit within the same minute) it stops that cost
    // from stacking directly onto everyone's response time.
    const file = await extractFileContent(filePath);
    const fileText = file?.text || '';
    const fileExtracted = !!file?.extracted;
    // Screenshots, diagrams and command output the student pasted into the
    // .docx/.pptx itself, not attached as a separate file — a text extractor
    // would otherwise throw these away and the grader would never see them.
    const embeddedImages = file?.images || [];

    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!submission || !assignment || !student) return;

    const { rows, custom } = await resolveRubric(assignmentId, lang);

    // The originality check is independent of the grading, so it runs alongside
    // it rather than after — the student waits for the slower of the two, not
    // for both. It never rejects: a failed check resolves to "skipped".
    const plagiarismPromise = checkPlagiarism({
      submissionId: submission.id,
      studentId,
      assignment,
      comparisonText: buildComparisonText({ fileText }),
      lang,
    });

    // Is there any writing here to grade? A submission of keyboard mash used to
    // come back with a comfortable pass, because every engine downstream measures
    // how much text there is and not whether it means anything. When the scan is
    // certain, the zero is awarded here and no model is called at all.
    const documentUnreadable = !!(filePath || submission.filePath) && !fileExtracted;
    const quality = analyzeSubmission({ fileText, documentUnreadable });

    // The student no longer fills in a written answer per section — the file is
    // the only source of evidence. When the format defeats both the text
    // extractor AND Gemini's own reader (legacy .doc/.ppt, a scanned PDF) there
    // is nothing left for any engine to grade, and asking one anyway produces a
    // confidently-wrong near-zero ("evidence: NOT FOUND" on every criterion) that
    // reads to the student as a judgement on their work rather than what it
    // actually is: a format the grader cannot open.
    let result = null;
    if (quality.verdict === 'nonsense') {
      result = nonsenseGrade(rows, lang);
      console.log(
        `Submission ${submission.id} scored 0 without grading: file is not language ` +
          `(${Math.round(quality.file.gibberishRatio * 100)}% non-words)`
      );
    } else if (documentUnreadable) {
      result = unreadableGrade(rows, lang);
      console.log(`Submission ${submission.id} scored 0 without grading: file format unreadable, no written answers to fall back on`);
    }

    if (!result && geminiConfigured()) {
      try {
        const calibration = await loadCalibration(assignmentId);
        const reference = await loadReference({ assignment, fileText });
        const graded = await gradeWithGemini({
          assignment,
          rows,
          filePath: filePath || submission.filePath,
          flowchartPath,
          fileText,
          embeddedImages,
          calibration,
          reference,
          qualityNote: qualityNote(quality),
          lang,
        });
        result = {
          criteria: graded.criteria,
          score: graded.total,
          feedback: formatGeminiReport(graded, lang),
          engine: `gemini:${graded.model}`,
        };
      } catch (e) {
        console.error('Gemini grading failed, falling back:', e.message);
      }
    }

    if (!result) {
      result = await legacyGrade({
        rows,
        custom,
        fileText,
        fileExtracted,
        lang,
      });
    }

    // Persist one row per criterion, with the weight snapshotted so a later
    // edit to the rubric cannot silently rewrite an existing grade.
    for (const c of result.criteria) {
      await prisma.sectionScore.create({
        data: {
          submissionId: submission.id,
          criterionId: c.criterionId ?? null,
          sectionName: c.key,
          score: c.score,
          maxScore: c.maxScore ?? 100,
          weight: c.weight ?? null,
          content: '',
          feedback: c.feedback || t(lang, 'ai.noComment'),
          evidence: c.evidence || null,
        },
      });
    }

    const gradedScore = Math.round(Math.max(0, Math.min(100, result.score)) * 10) / 10;

    // Originality decides the grade last: the work is marked on its merits
    // first, and what was not the student's own is then taken back off, so the
    // report can show both figures and the teacher can see what was deducted.
    const plagiarism = await plagiarismPromise;
    const { score: finalScore, penalty } = plagiarismPenalty(gradedScore, plagiarism.score);
    const report = plagiarismReport(plagiarism, penalty, lang);
    const feedback = report ? `${result.feedback}\n\n${report}` : result.feedback;

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        overallScore: finalScore,
        aiFeedbackSummary: feedback,
        gradedBy: result.engine,
        plagiarismScore: plagiarism.status === 'skipped' ? null : plagiarism.score,
        plagiarismStatus: plagiarism.status,
        plagiarismPenalty: penalty || null,
        plagiarismReport: report,
      },
    });

    if (report) {
      await notifyPlagiarism({ studentId, assignmentId, assignment, plagiarism, penalty });
      appendAdminLog('PLAGIARISM', student.username, 'log.plagiarism', {
        title: assignment.title,
        percent: Math.round(plagiarism.score),
      });
    }

    if (assignment.course) {
      try {
        await recalcRating(studentId, assignment.course);
      } catch (e) {
        console.error('Error calculating rating in background:', e.message);
      }
    }

    appendAdminLog('SUBMISSION', student.username, 'log.submissionScored', {
      title: assignment.title,
      score: finalScore.toFixed(1),
    });
  } catch (e) {
    console.error('Critical error in processSubmission:', e);
    try {
      const sub = await prisma.submission.findUnique({ where: { id: submissionId } });
      if (sub && sub.overallScore === null) {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { overallScore: 0, aiFeedbackSummary: t(lang, 'ai.techError'), gradedBy: 'error' },
        });
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Closes out submissions whose grading was killed with the process that ran it.
 *
 * Grading is fire-and-forget (see `processSubmission`), so it lives exactly as
 * long as the Node process does. The catch above covers grading that *fails*;
 * nothing covers grading that is still running when the instance goes away —
 * and on Render's free plan the instance goes away routinely, fifteen idle
 * minutes after the student closed the tab. That submission keeps
 * `overallScore: null`, which the UI reads as "processing", and no code will
 * ever set it: the only code that would have died with the process.
 *
 * Re-grading it is not possible on that host. The uploaded file sat on an
 * ephemeral disk and went with the instance, so there is nothing left to grade.
 * The honest result is the one the in-process failure path already produces —
 * score 0, `gradedBy: 'error'`, and the message asking for a resubmission. The
 * attempt was counted when the work was handed in, and only the best attempt
 * counts towards the grade, so this zero cannot drag down a mark the student
 * earns on the retry.
 *
 * The grace window keeps the sweep off work an outgoing instance is still
 * legitimately grading while the replacement boots during a redeploy.
 */
export async function failStalledSubmissions({ graceMinutes = 15 } = {}) {
  const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);
  try {
    const { count } = await prisma.submission.updateMany({
      where: { overallScore: null, submittedAt: { lt: cutoff } },
      data: {
        overallScore: 0,
        aiFeedbackSummary: t(DEFAULT_LANG, 'ai.techError'),
        gradedBy: 'error',
      },
    });
    if (count)
      console.log(`Recovered ${count} submission(s) left mid-grading by a restart.`);
    return count;
  } catch (e) {
    // A database that is still waking up must not stop the server from booting.
    console.error('Could not sweep stalled submissions:', e.message);
    return 0;
  }
}

/**
 * Re-runs the originality check on a submission that has already been graded —
 * for work handed in before this check existed, and for when a later submission
 * turns out to be the source of an earlier one.
 *
 * Idempotent by construction: the previous deduction is added back before the
 * new one is worked out, so re-checking the same submission twice can never
 * punish a student twice for the same overlap. The rest of the grade — the
 * rubric scores, the teacher's correction — is left exactly as it was.
 */
export async function recheckPlagiarism(submissionId, lang = DEFAULT_LANG) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: true, sectionScores: { select: { sectionName: true, content: true } } },
  });
  if (!submission) return null;

  const file = submission.filePath ? await extractFileContent(submission.filePath) : { text: '' };
  const sectionsData = Object.fromEntries(
    submission.sectionScores.map((s) => [s.sectionName || '', s.content || ''])
  );

  const plagiarism = await checkPlagiarism({
    submissionId: submission.id,
    studentId: submission.studentId,
    assignment: submission.assignment,
    comparisonText: buildComparisonText({ fileText: file.text, sectionsData }),
    lang,
  });

  // Undo the previous deduction to recover the grade the work earned on merit.
  const previousPenalty = submission.plagiarismPenalty || 0;
  const base = Math.max(0, Math.min(100, (submission.overallScore ?? 0) + previousPenalty));
  const { score: finalScore, penalty } = plagiarismPenalty(base, plagiarism.score);
  const report = plagiarismReport(plagiarism, penalty, lang);

  // The previous warning was appended to the report text; drop it before the new
  // one goes on, or repeated checks would stack warnings on top of each other.
  let summary = submission.aiFeedbackSummary || '';
  if (submission.plagiarismReport && summary.endsWith(submission.plagiarismReport)) {
    summary = summary.slice(0, -submission.plagiarismReport.length).trimEnd();
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      overallScore: submission.overallScore === null ? null : finalScore,
      aiFeedbackSummary: report ? `${summary}\n\n${report}`.trim() : summary || null,
      plagiarismScore: plagiarism.status === 'skipped' ? null : plagiarism.score,
      plagiarismStatus: plagiarism.status,
      plagiarismPenalty: penalty || null,
      plagiarismReport: report,
    },
  });

  // The rating follows the grade, so a deduction has to reach it too.
  if (submission.assignment?.course && submission.studentId) {
    try {
      await recalcRating(submission.studentId, submission.assignment.course);
    } catch (e) {
      console.error('rating recalc after re-check failed:', e.message);
    }
  }

  return { ...plagiarism, penalty, score_before: base, score_after: finalScore };
}

/**
 * Tells the student their work matched an earlier submission. The message says
 * what was found and what it cost them, but never who the other student was —
 * that belongs in the teacher's view, not in an accusation sent to a classmate.
 */
async function notifyPlagiarism({ studentId, assignmentId, assignment, plagiarism, penalty }) {
  try {
    const params = {
      title: assignment?.title || '',
      percent: Math.round(plagiarism.score),
      penalty: penalty.toFixed(1),
    };
    await prisma.notification.create({
      data: {
        studentId,
        assignmentId: assignmentId ?? null,
        title: encodeDetails('notify.plagiarismTitle', params),
        message: encodeDetails(
          penalty > 0 ? 'notify.plagiarismMessage' : 'notify.plagiarismWarning',
          params
        ),
        type: 'plagiarism',
      },
    });
  } catch (e) {
    console.error('Error creating plagiarism notification:', e.message);
  }
}

/**
 * The pre-Gemini path: score each rubric row against the whole submitted file
 * with a text model, then apply the weighted average. It only ever sees
 * extracted text, never the original document or the diagram, so it is a
 * fallback for when Gemini is unavailable — not an equal. The flowchart image
 * itself is never judged here (a text-only fallback model cannot read it) —
 * only Gemini grading sees it.
 *
 * There is no longer a separate written answer per section to grade — the
 * student submits one file, and every criterion is checked against it.
 */
async function legacyGrade({ rows, custom, fileText, fileExtracted, lang }) {
  const scoreMap = {};

  const results = await Promise.all(
    rows.map(async (row) => {
      const ai = await evaluateSectionFromFile(row.key, row.description, fileText, lang);
      return { row, ai };
    })
  );

  const criteria = results.map(({ row, ai }) => {
    scoreMap[row.key] = ai.score ?? 0;
    return {
      key: row.key,
      name: row.name,
      criterionId: row.id ?? null,
      score: ai.score ?? 0,
      maxScore: row.maxScore ?? 100,
      weight: row.weight ?? null,
      evidence: null,
      feedback: String(ai.feedback ?? t(lang, 'ai.noComment')),
    };
  });

  // A custom rubric carries its own weights and maxScores, so score it through
  // the rubric helper rather than the coursework-specific weighted average.
  let avg = custom ? weightedTotal(rows, scoreMap) : calculateFinalScore(scoreMap);

  const penalties = [];
  // Only penalise a short document when we actually managed to read it. An
  // unreadable file (scanned PDF, legacy .doc) is a limitation on our side —
  // capping the student at 40 for it would be plainly unfair.
  if (fileExtracted && fileText.trim().length < 300) {
    avg = Math.min(avg, 40);
    penalties.push(t(lang, 'ai.penaltyShortFile'));
  }
  avg = Math.max(0, avg);

  const finalScore = Math.round(avg * 10) / 10;
  let feedback;
  if (custom) {
    // The standard summary builders are written around the fixed standard
    // criteria and would misreport a custom rubric. Summarise the real rows instead.
    feedback = buildCustomSummary(criteria, finalScore, lang);
  } else {
    try {
      feedback = await generateOverallFeedback(scoreMap, finalScore, lang);
    } catch {
      feedback = buildOverallFeedbackFallback(scoreMap, finalScore, false, lang);
    }
  }
  if (penalties.length)
    feedback += `\n\n**${t(lang, 'ai.penaltiesLabel')}** ${penalties.join(' ')}`;

  return { criteria, score: finalScore, feedback, engine: 'legacy' };
}

/** Report text for a teacher-defined rubric graded on the legacy path. */
function buildCustomSummary(criteria, finalScore, lang) {
  const ranked = [...criteria].sort(
    (a, b) => a.score / (a.maxScore || 100) - b.score / (b.maxScore || 100)
  );
  const names = (list) => list.map((c) => c.name).join(', ');
  // Naming a "strongest" and a "weakest" third only says something when the two
  // lists are disjoint. With four criteria or fewer they would overlap, which
  // reads as the same rubric row being both the best and the worst of the work.
  const pick = Math.min(3, Math.floor(criteria.length / 2));
  const params = { score: Math.round(finalScore), count: criteria.length };
  const summary = pick
    ? t(lang, 'ai.summaryRubric', {
        ...params,
        strongest: names(ranked.slice(-pick).reverse()),
        weakest: names(ranked.slice(0, pick)),
      })
    : t(lang, 'ai.summaryRubricShort', params);

  const lines = [`Summary: ${summary}`, '', t(lang, 'ai.perPointHeader')];
  criteria.forEach((c, i) => {
    lines.push(`${i + 1}) ${c.name}: ${Math.round(c.score)}/${c.maxScore} — ${c.feedback}`);
  });
  return lines.join('\n');
}

/**
 * The grade for a submission that contains no writing at all: zero on every
 * criterion, and a report that says plainly why and what to do about it.
 *
 * It reuses the ordinary criteria shape, so the teacher's review screen, the PDF
 * export and the rating all treat this like any other grade — the student can
 * still resubmit, and only their best attempt counts.
 */
function nonsenseGrade(rows, lang) {
  const criteria = rows.map((row) => ({
    key: row.key,
    name: row.name,
    criterionId: row.id ?? null,
    score: 0,
    maxScore: row.maxScore ?? 100,
    weight: row.weight ?? null,
    evidence: null,
    feedback: t(lang, 'ai.nonsenseCriterion'),
  }));

  const lines = [`Summary: ${t(lang, 'ai.nonsenseSummary')}`, '', t(lang, 'ai.nonsenseAdvice')];
  lines.push('', t(lang, 'ai.perPointHeader'));
  criteria.forEach((c, i) => {
    lines.push(`${i + 1}) ${c.name}: 0/${c.maxScore} — ${c.feedback}`);
  });

  return { criteria, score: 0, feedback: lines.join('\n'), engine: 'quality-check' };
}

/**
 * The grade for a submission whose file format no engine could read (legacy
 * .doc/.ppt, a scanned PDF) and which carries no written answer to fall back
 * on. Same shape as `nonsenseGrade`, but the message is honest about the
 * cause: not that the work is worthless, but that it could not be opened —
 * so the student knows to resubmit in a supported format rather than to
 * rewrite the work itself.
 */
function unreadableGrade(rows, lang) {
  const criteria = rows.map((row) => ({
    key: row.key,
    name: row.name,
    criterionId: row.id ?? null,
    score: 0,
    maxScore: row.maxScore ?? 100,
    weight: row.weight ?? null,
    evidence: null,
    feedback: t(lang, 'ai.unreadableCriterion'),
  }));

  const lines = [`Summary: ${t(lang, 'ai.unreadableSummary')}`, '', t(lang, 'ai.unreadableAdvice')];
  lines.push('', t(lang, 'ai.perPointHeader'));
  criteria.forEach((c, i) => {
    lines.push(`${i + 1}) ${c.name}: 0/${c.maxScore} — ${c.feedback}`);
  });

  return { criteria, score: 0, feedback: lines.join('\n'), engine: 'format-unreadable' };
}

/** Turns the structured Gemini result into the report text students read. */
function formatGeminiReport(graded, lang) {
  const lines = [];
  if (graded.summary) lines.push(`Summary: ${graded.summary}`);
  // The model wrote its own explanation above; this adds the one thing it has no
  // way to know — that resubmitting real work is worth the student's while.
  if (graded.meaningful === false) lines.push('', t(lang, 'ai.nonsenseAdvice'));
  if (graded.strengths.length)
    lines.push('', `**${t(lang, 'ai.strengthsLabel')}**`, ...graded.strengths.map((s) => `• ${s}`));
  if (graded.improvements.length)
    lines.push('', `**${t(lang, 'ai.improvementsLabel')}**`, ...graded.improvements.map((s) => `• ${s}`));

  lines.push('', t(lang, 'ai.perPointHeader'));
  graded.criteria.forEach((c, i) => {
    lines.push(`${i + 1}) ${c.name}: ${c.score}/${c.maxScore} — ${c.feedback}`);
  });
  return lines.join('\n');
}

/**
 * Retrieves the course-material passages most relevant to this submission, so
 * the grader can check the work against the actual textbook. The query is built
 * from the task and the student's own words, so retrieval keys on the topic the
 * submission is actually about. Never throws — a KB miss just means no reference.
 */
async function loadReference({ assignment, fileText }) {
  try {
    const query = [
      assignment?.title,
      assignment?.description,
      (fileText || '').slice(0, 8000),
    ]
      .filter(Boolean)
      .join('\n');
    const { text, sources, passageCount } = await getSubjectReference({
      subjectId: assignment?.subjectId ?? null,
      courseName: assignment?.course || '',
      queryText: query,
    });
    if (text) {
      console.log(
        `KB: attached ${passageCount} passage(s) from ${sources.length} source(s) for "${assignment?.course || 'subject'}"`
      );
    }
    return text;
  } catch (e) {
    console.error('Knowledge base lookup failed, grading without reference:', e.message);
    return '';
  }
}

/**
 * Past teacher corrections on this assignment. These travel in the prompt so
 * the grader matches the teacher's standard — calibration without fine-tuning.
 */
async function loadCalibration(assignmentId) {
  if (!assignmentId) return [];
  const reviewed = await prisma.submission.findMany({
    where: { assignmentId, teacherScore: { not: null }, overallScore: { not: null } },
    orderBy: { reviewedAt: 'desc' },
    take: CALIBRATION_LIMIT,
    select: { overallScore: true, teacherScore: true, teacherComment: true },
  });
  return reviewed.map((r) => ({
    aiScore: Math.round(r.overallScore),
    teacherScore: Math.round(r.teacherScore),
    comment: r.teacherComment || '',
  }));
}

/** Recomputes (or creates) the AcademicRating row for a student in a subject/course. */
export async function recalcRating(studentId, courseName) {
  const subject = await getOrCreateSubject(courseName);
  if (!subject) return null;

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  const where = { course: courseName };
  if (student?.groupId) where.groupId = student.groupId;
  const assignments = await prisma.assignment.findMany({ where });
  const assignmentIds = assignments.map((a) => a.id);

  const submissions = assignmentIds.length
    ? await prisma.submission.findMany({
        where: { studentId, assignmentId: { in: assignmentIds } },
      })
    : [];

  const totalAssignments = assignments.length;
  // Counted per assignment, not per submission: three attempts at one task is
  // still one assignment completed, and only the best of them is graded.
  const best = bestAttempts(submissions);
  const completedAssignments = best.filter((s) => s.overallScore !== null).length;
  const scores = countingScores(submissions);
  const averageScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  let rating = Math.round((averageScore / 100) * 5 * 100) / 100;
  rating = Math.min(5, Math.max(0, rating));

  const data = { rating, totalAssignments, completedAssignments, averageScore };

  return prisma.academicRating.upsert({
    where: { studentId_subjectId: { studentId, subjectId: subject.id } },
    update: data,
    create: { studentId, subjectId: subject.id, ...data },
  });
}
