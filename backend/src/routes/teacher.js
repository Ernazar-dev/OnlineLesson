import { Router } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { getGroupActivity } from '../utils/groupActivity.js';
import { standardRubric } from '../services/rubric.js';
import {
  buildCriterionI18n, pickI18n, fullI18n, standardTranslation,
} from '../services/translator.js';
import { bestAttempts, countingScores, finalScoreOf, MAX_ATTEMPTS } from '../utils/attempts.js';
import { avatarUrlOf } from '../lib/avatar.js';

const router = Router();

router.use(authRequired, roleRequired('teacher', 'admin'));

/** Activity of this teacher's groups — feeds the teacher dashboard chart. */
router.get('/group-activity', async (req, res) => {
  const groups = await prisma.group.findMany({ where: { teacherId: req.user.id }, select: { id: true } });
  res.json(await getGroupActivity(groups.map((g) => g.id)));
});

/** Groups this teacher curates, with member and assignment counts. */
router.get('/groups', async (req, res) => {
  const groups = await prisma.group.findMany({
    where: { teacherId: req.user.id },
    include: { _count: { select: { members: true, assignments: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      student_count: g._count.members,
      assignment_count: g._count.assignments,
      created_at: g.createdAt.toISOString(),
    }))
  );
});

router.get('/groups/:id(\\d+)/students', async (req, res) => {
  const groupId = Number(req.params.id);
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { assignments: { orderBy: { deadline: 'asc' } } },
  });
  if (!group) return res.status(404).json({ message: req.t('common.notFound') });
  // A teacher sees the roster of the groups they curate, not of every group on
  // the platform — the id in the URL is whatever the caller chose to send.
  if (req.user.role === 'teacher' && group.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const students = await prisma.user.findMany({
    where: { groupId, role: 'student' },
    include: { submissions: true, profile: { select: { avatarMime: true } } },
    orderBy: { fullName: 'asc' },
  });

  res.json({
    group: { id: group.id, name: group.name, student_count: students.length },
    students: students.map((s) => ({
      id: s.id,
      username: s.username,
      full_name: s.fullName,
      avatar_url: avatarUrlOf(s),
      email: s.email,
      is_active: s.isActive,
      submission_count: s.submissions.length,
    })),
    assignments: group.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      deadline: a.deadline ? a.deadline.toISOString() : null,
      submitted: students.filter((s) => s.submissions.some((sub) => sub.assignmentId === a.id)).length,
    })),
  });
});

/** Flat roster across every group this teacher curates, with score totals. */
router.get('/students', async (req, res) => {
  const where =
    req.user.role === 'admin'
      ? { role: 'student' }
      : { role: 'student', group: { teacherId: req.user.id } };

  const students = await prisma.user.findMany({
    where,
    include: { group: true, submissions: true, profile: { select: { avatarMime: true } } },
  });

  const rows = students.map((s) => {
    // Best attempt per assignment: retrying a task must be able to raise a
    // student's standing, never dilute it with the earlier tries.
    const scores = countingScores(s.submissions);
    const total = scores.reduce((a, b) => a + b, 0);
    return {
      id: s.id,
      username: s.username,
      full_name: s.fullName,
      avatar_url: avatarUrlOf(s),
      group_id: s.groupId,
      group_name: s.group?.name || null,
      // Assignments handed in, not files uploaded.
      submitted_count: bestAttempts(s.submissions).length,
      total_points: Math.round(total),
      average_score: scores.length ? Math.round((total / scores.length) * 10) / 10 : 0,
    };
  });
  rows.sort((a, b) => b.total_points - a.total_points);
  res.json(rows);
});

/** One student's results, for the teacher's detail drawer. */
router.get('/student/:id(\\d+)', async (req, res) => {
  const student = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      group: true,
      submissions: { include: { assignment: true }, orderBy: { submittedAt: 'desc' } },
      profile: { select: { avatarMime: true } },
    },
  });
  if (!student || student.role !== 'student')
    return res.status(404).json({ message: req.t('common.notFound') });

  // Same rule as the roster this drawer opens from: a teacher may read the
  // results of their own students — those in a group they curate, or linked to
  // them directly — and no one else's. An admin sees everyone.
  if (req.user.role === 'teacher') {
    const mine =
      student.group?.teacherId === req.user.id ||
      (await prisma.teacherStudent.count({
        where: { teacherId: req.user.id, studentId: student.id },
      })) > 0;
    if (!mine) return res.status(403).json({ message: req.t('common.unauthorized') });
  }

  const scores = countingScores(student.submissions);
  const total = scores.reduce((a, b) => a + b, 0);
  const bestIds = new Set(bestAttempts(student.submissions).map((s) => s.id));

  res.json({
    id: student.id,
    username: student.username,
    full_name: student.fullName,
    avatar_url: avatarUrlOf(student),
    group_name: student.group?.name || null,
    completed: bestIds.size,
    average_score: scores.length ? Math.round((total / scores.length) * 10) / 10 : 0,
    total_points: Math.round(total),
    // Every attempt is listed — a teacher should be able to see the earlier
    // tries — but each one says whether it is the attempt that counts.
    submissions: student.submissions.map((s) => ({
      id: s.id,
      assignment_title: s.assignment?.title || '-',
      submitted_at: s.submittedAt.toISOString(),
      overall_score: s.overallScore,
      final_score: finalScoreOf(s),
      attempt: s.attempt,
      max_attempts: MAX_ATTEMPTS,
      is_best: bestIds.has(s.id),
    })),
  });
});

// ---- Criteria library ------------------------------------------------------
// A teacher's reusable rubric rows. Managed on the "Criteria" page and picked
// from when creating an assignment. Admins act on their own library too.

// Rows are stored with the text as typed plus a {uz,ru,en} map, and handed out
// in the caller's language — that is what makes the Criteria page follow the
// language switcher instead of staying in whatever language it was written in.
// The full maps ride along so the edit dialog can show and correct every one.
const templateOut = (c, lang) => ({
  id: c.id,
  name: pickI18n(c.nameI18n, lang, c.name),
  description: pickI18n(c.descriptionI18n, lang, c.description || ''),
  name_i18n: fullI18n(c.nameI18n, c.name),
  description_i18n: fullI18n(c.descriptionI18n, c.description || ''),
  weight: c.weight,
  max_score: c.maxScore,
  position: c.position,
});

/** GET /api/teacher/criteria — this teacher's saved criteria, ordered. */
router.get('/criteria', async (req, res) => {
  const rows = await prisma.criterionTemplate.findMany({
    where: { teacherId: req.user.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  res.json(rows.map((c) => templateOut(c, req.lang)));
  // Rows saved before this feature existed carry no translations. Fill them in
  // after answering so the page stays fast; the next load reads in every
  // language. (See also `npm run translate:criteria` for a one-shot backfill.)
  backfillTemplates(rows, req.lang);
});

/** POST /api/teacher/criteria — add one criterion to the library. */
router.post('/criteria', async (req, res) => {
  const d = req.body || {};
  const name = String(d.name || '').trim();
  if (!name) return res.status(400).json({ message: req.t('criteria.nameRequired') });
  const description = String(d.description || '').trim();
  const last = await prisma.criterionTemplate.findFirst({
    where: { teacherId: req.user.id },
    orderBy: { position: 'desc' },
  });
  const i18n = await buildCriterionI18n(
    { name, description, nameI18n: d.name_i18n, descriptionI18n: d.description_i18n },
    req.lang
  );
  const created = await prisma.criterionTemplate.create({
    data: {
      teacherId: req.user.id,
      name,
      description: description || null,
      ...i18n,
      weight: Number(d.weight) > 0 ? Number(d.weight) : 10,
      maxScore: Number(d.max_score) > 0 ? Math.round(Number(d.max_score)) : 100,
      position: (last?.position ?? -1) + 1,
    },
  });
  res.status(201).json(templateOut(created, req.lang));
});

/** PUT /api/teacher/criteria/:id — edit one of the teacher's criteria. */
router.put('/criteria/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.criterionTemplate.findUnique({ where: { id } });
  if (!existing || existing.teacherId !== req.user.id)
    return res.status(404).json({ message: req.t('common.notFound') });

  const d = req.body || {};
  const patch = {};
  if (d.name !== undefined) {
    const name = String(d.name).trim();
    if (!name) return res.status(400).json({ message: req.t('criteria.nameRequired') });
    patch.name = name;
  }
  if (d.description !== undefined) patch.description = String(d.description || '').trim() || null;
  if (d.weight !== undefined) patch.weight = Number(d.weight) > 0 ? Number(d.weight) : 10;
  if (d.max_score !== undefined) patch.maxScore = Number(d.max_score) > 0 ? Math.round(Number(d.max_score)) : 100;
  if (d.position !== undefined && Number.isFinite(Number(d.position))) patch.position = Number(d.position);

  // Re-translate whenever the wording changed (or the caller sent explicit
  // per-language text); a weight-only edit must not spend an API call.
  const textChanged =
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && (patch.description || '') !== (existing.description || '')) ||
    d.name_i18n !== undefined ||
    d.description_i18n !== undefined;
  if (textChanged) {
    Object.assign(
      patch,
      await buildCriterionI18n(
        {
          name: patch.name ?? existing.name,
          description: patch.description ?? existing.description ?? '',
          nameI18n: d.name_i18n,
          descriptionI18n: d.description_i18n,
        },
        req.lang
      )
    );
  }

  const updated = await prisma.criterionTemplate.update({ where: { id }, data: patch });
  res.json(templateOut(updated, req.lang));
});

/** DELETE /api/teacher/criteria/:id */
router.delete('/criteria/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.criterionTemplate.findUnique({ where: { id } });
  if (!existing || existing.teacherId !== req.user.id)
    return res.status(404).json({ message: req.t('common.notFound') });
  await prisma.criterionTemplate.delete({ where: { id } });
  res.json({ message: req.t('common.deleted') });
});

/**
 * POST /api/teacher/criteria/load-standard — seed the library with the 9 standard
 * sections (in the caller's language) so a teacher can start from them and edit.
 * Appends after whatever they already have.
 */
router.post('/criteria/load-standard', async (req, res) => {
  const last = await prisma.criterionTemplate.findFirst({
    where: { teacherId: req.user.id },
    orderBy: { position: 'desc' },
  });
  let pos = (last?.position ?? -1) + 1;
  // standardRubric weights are fractions of 1; store as readable percentages.
  // The three locale files already hold every section title and hint, so these
  // rows get their translations for free — no API call, no drift.
  const rows = standardRubric(req.lang).map((r) => {
    const nameMap = standardTranslation(r.name);
    const descMap = r.description ? standardTranslation(r.description) : null;
    return {
      teacherId: req.user.id,
      name: r.name,
      description: r.description || null,
      nameI18n: nameMap ? JSON.stringify(nameMap) : null,
      descriptionI18n: descMap ? JSON.stringify(descMap) : null,
      weight: Math.round((r.weight || 0) * 100) || 10,
      maxScore: r.maxScore || 100,
      position: pos++,
    };
  });
  await prisma.criterionTemplate.createMany({ data: rows });
  const all = await prisma.criterionTemplate.findMany({
    where: { teacherId: req.user.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  res.status(201).json(all.map((c) => templateOut(c, req.lang)));
});

/**
 * Adds the missing `{uz,ru,en}` maps to library rows created before criteria
 * became multilingual. Runs detached from the request and swallows everything:
 * a failed translation must leave the row exactly as it was, showing the text
 * as typed, which is what it did before.
 */
let backfilling = false;
function backfillTemplates(rows, lang) {
  const pending = rows.filter((c) => !c.nameI18n);
  if (!pending.length || backfilling) return;
  backfilling = true;
  (async () => {
    for (const c of pending) {
      try {
        const i18n = await buildCriterionI18n(
          { name: c.name, description: c.description || '' },
          lang
        );
        await prisma.criterionTemplate.update({ where: { id: c.id }, data: i18n });
      } catch (e) {
        console.warn('criterion backfill failed:', c.id, e.message);
      }
    }
  })().finally(() => { backfilling = false; });
}

export default router;
