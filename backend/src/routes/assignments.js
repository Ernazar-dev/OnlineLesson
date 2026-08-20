import { Router } from '../lib/asyncRouter.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { appendAdminLog, logActivity, encodeDetails } from '../utils/logger.js';
import { getMaxFileSizeBytes } from '../utils/settings.js';
import { processSubmission, recalcRating, recheckPlagiarism } from '../services/gradingService.js';
import { getOrCreateSubject } from '../services/subjectService.js';
import { resolveRubric, parseLevels } from '../services/rubric.js';
import { buildCriterionI18n, pickI18n, fullI18n } from '../services/translator.js';
import { generateSubmissionPdf } from '../services/pdfService.js';
import { sectionTitle, t, DEFAULT_LANG } from '../i18n/index.js';
import { MAX_ATTEMPTS, attemptsLeft, bestAttempts, finalScoreOf } from '../utils/attempts.js';

const router = Router();

// ---- Multer storage --------------------------------------------------------
// Submissions live in their own sub-directory that is never served statically —
// they are only reachable through the authorised /download and /export routes.
const uploadsDir = path.resolve(process.cwd(), config.uploadsDir, 'submissions');
fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    // The random suffix keeps a re-submission from overwriting the earlier file
    // and stops filenames from being guessable.
    const nonce = crypto.randomBytes(8).toString('hex');
    cb(null, `${req.user.id}_${req.params.id}_${file.fieldname}_${nonce}_${safe}`);
  },
});
/**
 * Same as `multer({ storage }).fields([...])`, but the size cap is read fresh from the
 * admin's "Maks. fayl hajmi (MB)" setting on every request instead of being
 * frozen at `config.maxFileSize` (50MB) since server start. Multer's own
 * `limits` only accepts a static number at construction time, so this builds
 * a fresh (cheap — no I/O) multer instance per request with whatever the
 * setting currently says; getMaxFileSizeBytes() itself is cached, so this
 * costs a DB round trip at most once every 30s, not once per upload.
 */
function dynamicSubmissionUpload(fields) {
  return async (req, res, next) => {
    let limitBytes;
    try { limitBytes = await getMaxFileSizeBytes(); } catch { limitBytes = config.maxFileSize; }
    multer({ storage, limits: { fileSize: limitBytes } }).fields(fields)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE')
          return res.status(400).json({ message: req.t('assignment.fileTooLarge', { mb: Math.round(limitBytes / (1024 * 1024)) }) });
        return next(err);
      }
      next();
    });
  };
}

/**
 * Deletes whatever the upload middleware already wrote to disk.
 *
 * Multer saves the files before the route runs a single one of its own checks,
 * so a submission turned away for the wrong file type, a passed deadline or an
 * exhausted attempt budget has already cost the uploads volume its 50 MB — and
 * nothing in the database will ever refer to those files again. On a host with
 * a persistent disk they accumulate for the life of the deployment.
 */
function discardUploads(req) {
  for (const list of Object.values(req.files || {}))
    for (const f of list || []) fs.unlink(f.path, () => {});
}

router.use(authRequired);

/**
 * The students expected to submit a given assignment: a group assignment is for
 * that group's members; a teacher-wide assignment (no group) is for every
 * student in the teacher's groups plus their directly-linked students. Mirrors
 * exactly who is notified when the assignment is created, so the "who hasn't
 * submitted" roster and the notify list can never drift apart.
 */
async function assignmentAudience(assignment) {
  const ids = new Set();
  if (assignment.groupId) {
    const members = await prisma.user.findMany({
      where: { groupId: assignment.groupId, role: 'student' },
      select: { id: true },
    });
    members.forEach((m) => ids.add(m.id));
  } else {
    const groups = await prisma.group.findMany({
      where: { teacherId: assignment.teacherId },
      include: { members: true },
    });
    groups.forEach((g) => g.members.forEach((m) => m.role === 'student' && ids.add(m.id)));
    const ts = await prisma.teacherStudent.findMany({
      where: { teacherId: assignment.teacherId },
      select: { studentId: true },
    });
    ts.forEach((rel) => ids.add(rel.studentId));
  }
  if (!ids.size) return [];
  return prisma.user.findMany({
    where: { id: { in: [...ids] }, role: 'student' },
    orderBy: { fullName: 'asc' },
  });
}

/**
 * Sorts the assignment list so a teacher's groups never interleave: every row
 * of one group sits together, groups in alphabetical order, and inside a group
 * the nearest deadline comes first. Ungrouped (teacher-wide) rows go last —
 * they belong to no group, so they cannot sit inside one.
 */
function byGroupThenDeadline(a, b) {
  const ga = a.group_name || '';
  const gb = b.group_name || '';
  if (!ga !== !gb) return ga ? -1 : 1; // ungrouped last
  if (ga !== gb) return ga.localeCompare(gb, undefined, { numeric: true });
  // No deadline sorts after dated rows rather than to the top.
  const da = a.deadline ? Date.parse(a.deadline) : Infinity;
  const db = b.deadline ? Date.parse(b.deadline) : Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title, undefined, { numeric: true });
}

// GET /assignments/  — role-scoped list
router.get('/', async (req, res) => {
  const u = req.user;
  let assignments;
  if (u.role === 'student') {
    if (u.groupId) {
      assignments = await prisma.assignment.findMany({ where: { groupId: u.groupId } });
    } else {
      const ts = await prisma.teacherStudent.findMany({ where: { studentId: u.id } });
      const teacherIds = ts.map((rel) => rel.teacherId);
      assignments = await prisma.assignment.findMany({
        where: { teacherId: { in: teacherIds }, groupId: null },
      });
    }
  } else if (u.role === 'teacher') {
    assignments = await prisma.assignment.findMany({ where: { teacherId: u.id } });
  } else {
    assignments = await prisma.assignment.findMany();
  }

  // A student needs to know how many tries they have left before they open the
  // wizard, so the attempt state travels with the assignment list itself.
  const mySubmissions =
    u.role === 'student'
      ? await prisma.submission.findMany({
          where: { studentId: u.id, assignmentId: { in: assignments.map((a) => a.id) } },
          select: {
            id: true, assignmentId: true, attempt: true, overallScore: true, teacherScore: true,
          },
        })
      : [];
  const byAssignment = new Map();
  for (const s of mySubmissions) {
    const list = byAssignment.get(s.assignmentId) || [];
    list.push(s);
    byAssignment.set(s.assignmentId, list);
  }

  // Teachers and groups in two queries rather than two per assignment: the
  // per-row lookups made this list scale with the number of assignments, which
  // on a cold free-tier instance is the difference between a page that opens
  // and one that appears to hang.
  const [teachers, groups] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.teacherId).filter(Boolean))] } },
      select: { id: true, username: true },
    }),
    prisma.group.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.groupId).filter(Boolean))] } },
      select: { id: true, name: true },
    }),
  ]);
  const teacherById = new Map(teachers.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const now = new Date();
  const out = [];
  for (const a of assignments) {
    const teacher = a.teacherId ? teacherById.get(a.teacherId) : null;
    const group = a.groupId ? groupById.get(a.groupId) : null;
    const mine = byAssignment.get(a.id) || [];
    const best = mine.length ? bestAttempts(mine)[0] : null;
    out.push({
      id: a.id,
      title: a.title,
      description: a.description,
      course: a.course,
      assignment_type: a.assignmentType,
      start_at: a.startAt ? a.startAt.toISOString() : null,
      deadline: a.deadline ? a.deadline.toISOString() : null,
      teacher_id: a.teacherId,
      teacher_name: teacher ? teacher.username : 'Unknown',
      group_id: a.groupId,
      group_name: group ? group.name : null,
      created_at: a.createdAt ? a.createdAt.toISOString() : null,
      is_expired: !!(a.deadline && now > a.deadline),
      // Set but not yet open: the student can see it coming and cannot submit.
      is_upcoming: !!(a.startAt && now < a.startAt),
      // Attempt state — the student's own; meaningless for staff, so omitted.
      max_attempts: MAX_ATTEMPTS,
      attempts_used: mine.length,
      attempts_left: attemptsLeft(mine.length),
      // Their best try so far: what the grade will be if they stop here.
      best_submission_id: best?.id ?? null,
      best_score: best ? finalScoreOf(best) : null,
    });
  }
  out.sort(byGroupThenDeadline);
  res.json(out);
});

// GET /assignments/my_submissions
router.get('/my_submissions', async (req, res) => {
  const subs = await prisma.submission.findMany({
    where: { studentId: req.user.id },
    orderBy: { submittedAt: 'desc' },
    include: { assignment: true },
  });
  // Which attempt counts, so the student sees at a glance which of their tries
  // is the one being graded.
  const bestIds = new Set(bestAttempts(subs).map((s) => s.id));

  res.json(
    subs.map((s) => ({
      id: s.id,
      assignment_id: s.assignmentId,
      assignment_title: s.assignment ? s.assignment.title : 'Unknown',
      overall_score: s.overallScore,
      teacher_score: s.teacherScore,
      final_score: finalScoreOf(s),
      // Graded means graded, including a hard-earned zero. Testing for `> 0`
      // left work the grader rejected — an empty file, keyboard mash — showing
      // "analyzing…" for ever, because the mark it was given was 0 and no
      // further grading was ever going to change that.
      is_graded: s.overallScore !== null,
      submitted_at: s.submittedAt ? s.submittedAt.toISOString() : null,
      attempt: s.attempt,
      max_attempts: MAX_ATTEMPTS,
      is_best: bestIds.has(s.id),
      plagiarism_score: s.plagiarismScore,
      plagiarism_status: s.plagiarismStatus,
    }))
  );
});

// GET /assignments/:id
router.get('/:id(\\d+)', async (req, res) => {
  const a = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a) return res.status(404).json({ message: req.t('common.notFound') });

  // The submit wizard opens from here, so it must be able to tell the student
  // which try this is before they start filling it in.
  const mine =
    req.user.role === 'student'
      ? await prisma.submission.findMany({
          where: { assignmentId: a.id, studentId: req.user.id },
          select: { id: true, attempt: true, assignmentId: true, overallScore: true, teacherScore: true },
        })
      : [];
  const best = mine.length ? bestAttempts(mine)[0] : null;

  res.json({
    id: a.id,
    title: a.title,
    description: a.description,
    course: a.course,
    assignment_type: a.assignmentType,
    start_at: a.startAt ? a.startAt.toISOString() : null,
    deadline: a.deadline ? a.deadline.toISOString() : null,
    teacher: a.teacherId,
    created_at: a.createdAt ? a.createdAt.toISOString() : null,
    max_attempts: MAX_ATTEMPTS,
    attempts_used: mine.length,
    attempts_left: attemptsLeft(mine.length),
    best_score: best ? finalScoreOf(best) : null,
  });
});

// POST /assignments/  — create (teacher/admin)
router.post('/', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const data = req.body || {};
  let deadline = null;
  if (data.deadline) {
    const d = new Date(data.deadline);
    if (isNaN(d.getTime())) return res.status(400).json({ message: req.t('assignment.invalidDeadline') });
    deadline = d;
  }
  // The window opens at `start_at`. Left out, the assignment is open from the
  // moment it is created — the behaviour every existing assignment has.
  let startAt = null;
  if (data.start_at) {
    const s = new Date(data.start_at);
    if (isNaN(s.getTime())) return res.status(400).json({ message: req.t('assignment.invalidStart') });
    startAt = s;
  }
  if (startAt && deadline && startAt >= deadline)
    return res.status(400).json({ message: req.t('assignment.startAfterDeadline') });

  if (!data.title || !String(data.title).trim())
    return res.status(400).json({ message: req.t('assignment.titleRequired') });

  // One assignment can now be posted to several groups at once. Accept a list
  // (`group_ids`); fall back to the legacy single `group_id`. Each group gets its
  // own assignment row — that keeps submissions, rosters and rubrics per-group,
  // exactly as a single-group assignment has always worked.
  let groupIds = Array.isArray(data.group_ids)
    ? data.group_ids.map(Number).filter(Number.isInteger)
    : [];
  if (!groupIds.length && data.group_id) groupIds = [Number(data.group_id)];
  groupIds = [...new Set(groupIds)];

  // A teacher may only target their own groups; an admin may target any. Filter
  // the request against what the caller actually owns so a tampered payload
  // can't post into someone else's group.
  if (groupIds.length) {
    const owned = await prisma.group.findMany({
      where:
        req.user.role === 'admin'
          ? { id: { in: groupIds } }
          : { id: { in: groupIds }, teacherId: req.user.id },
      select: { id: true },
    });
    groupIds = owned.map((g) => g.id);
    if (!groupIds.length) return res.status(400).json({ message: req.t('assignment.groupRequired') });
  }

  // Resolve the course name to a real Subject row so ratings, criteria and the
  // subject pages all hang off the same record instead of matching on a string.
  const subject = data.course ? await getOrCreateSubject(String(data.course).trim()) : null;

  // An empty group list keeps the old teacher-wide behaviour: a single row with
  // no group, aimed at every student the teacher curates.
  const targets = groupIds.length ? groupIds : [null];
  const createdIds = [];

  for (const gid of targets) {
    const assignment = await prisma.assignment.create({
      data: {
        title: data.title,
        description: data.description || '',
        course: data.course || '',
        assignmentType: data.type || 'theoretical',
        startAt,
        deadline,
        teacherId: req.user.id,
        groupId: gid,
        subjectId: subject ? subject.id : null,
      },
    });
    createdIds.push(assignment.id);

    // Notify that assignment's audience. `assignmentAudience` already encodes
    // exactly who a group (or teacher-wide) assignment is for, so notifications
    // and the "who hasn't submitted" roster can never drift apart.
    try {
      const audience = await assignmentAudience(assignment);
      if (audience.length) {
        await prisma.notification.createMany({
          data: audience.map((student) => ({
            studentId: student.id,
            assignmentId: assignment.id,
            // Stored as translation keys — rendered in each student's own language.
            title: encodeDetails('notify.newAssignmentTitle', { title: data.title }),
            message: encodeDetails('notify.newAssignmentMessage', {
              teacher: req.user.username,
              course: data.course || t(DEFAULT_LANG, 'common.general'),
            }),
            type: 'assignment',
          })),
        });
      }
    } catch (e) {
      console.error('Error creating notifications:', e.message);
    }
  }

  appendAdminLog('CREATE_ASSIGNMENT', req.user.username, 'log.createAssignment', {
    title: data.title,
    count: createdIds.length,
  });
  // Persisted (unlike appendAdminLog's admin.txt, wiped on every Render
  // deploy — see that function's comment) — this is what makes the action
  // show up on the admin's "teacher actions" feed and the full audit log.
  await logActivity(req.user.id, 'CREATE_ASSIGNMENT', 'log.createAssignment', {
    title: data.title,
    count: createdIds.length,
  }, req.ip);
  res.status(201).json({
    message: req.t('assignment.created'),
    assignment_id: createdIds[0], // legacy: first created id
    assignment_ids: createdIds,
  });
});

// PUT /assignments/:id — edit an assignment's core fields (teacher/admin).
// For fixing a mistyped title, a wrong deadline, group, subject, etc. after it
// was created. Only the fields sent are touched; the rubric is edited separately
// via PUT /:id/criteria.
router.put('/:id(\\d+)', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const a = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a) return res.status(404).json({ message: req.t('common.notFound') });
  if (a.teacherId !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const data = req.body || {};
  const patch = {};

  if (data.title !== undefined) {
    if (!String(data.title).trim())
      return res.status(400).json({ message: req.t('assignment.titleRequired') });
    patch.title = String(data.title).trim();
  }
  if (data.description !== undefined) patch.description = data.description || '';
  if (data.type !== undefined) patch.assignmentType = data.type || 'theoretical';
  // Moving an assignment into a group follows the same ownership rule creating
  // one does: a teacher may only target groups they curate. Without this a
  // tampered payload could post an assignment into another teacher's group —
  // and with it, notifications to that group's students.
  if (data.group_id !== undefined) {
    const gid = data.group_id ? Number(data.group_id) : null;
    if (gid !== null) {
      if (!Number.isInteger(gid))
        return res.status(400).json({ message: req.t('assignment.groupRequired') });
      const group = await prisma.group.findUnique({ where: { id: gid } });
      if (!group || (req.user.role === 'teacher' && group.teacherId !== req.user.id))
        return res.status(400).json({ message: req.t('assignment.groupRequired') });
    }
    patch.groupId = gid;
  }

  if (data.deadline !== undefined) {
    if (data.deadline === null || data.deadline === '') {
      patch.deadline = null;
    } else {
      const d = new Date(data.deadline);
      if (isNaN(d.getTime()))
        return res.status(400).json({ message: req.t('assignment.invalidDeadline') });
      patch.deadline = d;
    }
  }

  if (data.start_at !== undefined) {
    if (data.start_at === null || data.start_at === '') {
      patch.startAt = null;
    } else {
      const s = new Date(data.start_at);
      if (isNaN(s.getTime()))
        return res.status(400).json({ message: req.t('assignment.invalidStart') });
      patch.startAt = s;
    }
  }

  // Check the window against whatever the row will actually hold after the
  // patch — an edit may move only one of the two ends.
  const nextStart = patch.startAt !== undefined ? patch.startAt : a.startAt;
  const nextDeadline = patch.deadline !== undefined ? patch.deadline : a.deadline;
  if (nextStart && nextDeadline && nextStart >= nextDeadline)
    return res.status(400).json({ message: req.t('assignment.startAfterDeadline') });

  // Changing the subject must re-point the assignment at a real Subject row, the
  // same way creating one does, so ratings and criteria stay attached correctly.
  if (data.course !== undefined) {
    patch.course = data.course || '';
    const subject = data.course ? await getOrCreateSubject(String(data.course).trim()) : null;
    patch.subjectId = subject ? subject.id : null;
  }

  const updated = await prisma.assignment.update({ where: { id: a.id }, data: patch });

  appendAdminLog('UPDATE_ASSIGNMENT', req.user.username, 'log.updateAssignment', { title: updated.title });
  await logActivity(req.user.id, 'UPDATE_ASSIGNMENT', 'log.updateAssignment', { title: updated.title }, req.ip);
  res.json({ message: req.t('assignment.updated'), assignment_id: updated.id });
});

// DELETE /assignments/:id
router.delete('/:id(\\d+)', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });
  const a = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a) return res.status(404).json({ message: req.t('common.notFound') });
  if (a.teacherId !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: req.t('common.unauthorized') });
  await prisma.assignment.delete({ where: { id: a.id } });
  res.json({ message: req.t('assignment.deleted') });
});

// ---- Rubric (criteria) -----------------------------------------------------

/** Loads the assignment and checks the caller may edit its rubric. */
async function assignmentForEdit(req, res) {
  const a = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a) {
    res.status(404).json({ message: req.t('common.notFound') });
    return null;
  }
  if (!['teacher', 'admin'].includes(req.user.role) || (req.user.role === 'teacher' && a.teacherId !== req.user.id)) {
    res.status(403).json({ message: req.t('common.unauthorized') });
    return null;
  }
  return a;
}

const criterionOut = (c, lang) => ({
  id: c.id,
  name: pickI18n(c.nameI18n, lang, c.name),
  description: pickI18n(c.descriptionI18n, lang, c.description || ''),
  name_i18n: fullI18n(c.nameI18n, c.name),
  description_i18n: fullI18n(c.descriptionI18n, c.description || ''),
  weight: c.weight,
  max_score: c.maxScore,
  levels: parseLevels(c.levels),
  position: c.position,
});

// GET /assignments/:id/criteria — the rubric this assignment is graded against.
// Readable by anyone who can see the assignment: students should know exactly
// what they are being marked on before they submit.
router.get('/:id(\\d+)/criteria', async (req, res) => {
  const id = Number(req.params.id);
  const assignment = await prisma.assignment.findUnique({ where: { id } });
  if (!assignment) return res.status(404).json({ message: req.t('common.notFound') });

  const { rows, custom } = await resolveRubric(id, req.lang);
  res.json({
    custom, // false => the platform's 9 standard sections
    criteria: rows.map((r, i) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      weight: Math.round(r.weight * 1000) / 10, // percent
      max_score: r.maxScore,
      levels: r.levels,
      position: r.position ?? i,
    })),
  });
  if (custom) backfillCriteria(id, req.lang);
});

/**
 * Rubrics saved before criteria became multilingual have no `{uz,ru,en}` map,
 * so they read in whatever language they were written in. Fill them in behind
 * the response: the reader still gets an answer immediately, and by their next
 * visit the rubric follows the language switcher like everything else.
 */
const backfilled = new Set();
function backfillCriteria(assignmentId, lang) {
  if (backfilled.has(assignmentId)) return;
  backfilled.add(assignmentId);
  (async () => {
    const pending = await prisma.criterion.findMany({
      where: { assignmentId, nameI18n: null },
    });
    for (const c of pending) {
      try {
        const i18n = await buildCriterionI18n(
          { name: c.name, description: c.description || '' },
          lang
        );
        await prisma.criterion.update({ where: { id: c.id }, data: i18n });
      } catch (e) {
        console.warn('criterion backfill failed:', c.id, e.message);
      }
    }
  })().catch((e) => {
    backfilled.delete(assignmentId); // let a later request try again
    console.warn('criterion backfill failed:', assignmentId, e.message);
  });
}

// PUT /assignments/:id/criteria — replace the rubric (teacher/admin)
router.put('/:id(\\d+)/criteria', async (req, res) => {
  const assignment = await assignmentForEdit(req, res);
  if (!assignment) return;

  const incoming = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
  const base = incoming
    .map((c, i) => ({
      name: String(c.name || '').trim(),
      description: String(c.description || '').trim() || null,
      nameI18n: c.name_i18n,
      descriptionI18n: c.description_i18n,
      weight: Number(c.weight) > 0 ? Number(c.weight) : 1,
      maxScore: Number.isFinite(Number(c.max_score)) && Number(c.max_score) > 0 ? Math.round(Number(c.max_score)) : 100,
      levels: c.levels ? JSON.stringify(c.levels) : null,
      position: Number.isFinite(Number(c.position)) ? Number(c.position) : i,
    }))
    .filter((c) => c.name);

  if (incoming.length && !base.length)
    return res.status(400).json({ message: req.t('criteria.nameRequired') });

  // Criteria picked from the teacher's library arrive already translated, so
  // this normally just re-serialises what was sent; text typed straight into
  // the rubric is translated here instead.
  const rows = await Promise.all(
    base.map(async (c) => {
      const { nameI18n, descriptionI18n, ...rest } = c;
      return {
        ...rest,
        ...(await buildCriterionI18n(
          { name: c.name, description: c.description || '', nameI18n, descriptionI18n },
          req.lang
        )),
      };
    })
  );

  // Replace wholesale so the rubric always matches exactly what was sent.
  await prisma.$transaction([
    prisma.criterion.deleteMany({ where: { assignmentId: assignment.id } }),
    ...(rows.length
      ? [prisma.criterion.createMany({ data: rows.map((r) => ({ ...r, assignmentId: assignment.id })) })]
      : []),
  ]);

  const saved = await prisma.criterion.findMany({
    where: { assignmentId: assignment.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  appendAdminLog('UPDATE_CRITERIA', req.user.username, 'log.updateCriteria', {
    title: assignment.title,
    count: saved.length,
  });
  res.json({
    message: req.t('criteria.saved'),
    criteria: saved.map((c) => criterionOut(c, req.lang)),
  });
});

// POST /assignments/:id/submit  — student submission: main file + optional
// flowchart image. There are no per-criterion text fields any more, custom
// rubric or not — every criterion is graded straight off the file (and the
// flowchart, and any images embedded in the file itself).
router.post(
  '/:id(\\d+)/submit',
  dynamicSubmissionUpload([
    { name: 'file', maxCount: 1 },
    { name: 'flowchart_image', maxCount: 1 },
    { name: 'presentation_file', maxCount: 1 },
  ]),
  async (req, res) => {
    // Every refusal below happens after the files are already on disk, so each
    // one has to take them back off again.
    const reject = (status, message) => {
      discardUploads(req);
      return res.status(status).json({ message });
    };

    if (req.user.role !== 'student')
      return reject(403, req.t('assignment.onlyStudents'));

    const id = Number(req.params.id);
    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment) return reject(404, req.t('common.notFound'));

    // Before the window opens the door isn't open yet. A deadline extension
    // cannot help here — that moves the closing end, not the opening one.
    if (assignment.startAt && new Date() < assignment.startAt)
      return reject(400, req.t('assignment.notStarted'));

    // Past the deadline the door is closed — unless the teacher reopened the
    // assignment for this specific student with a per-student override that is
    // still in the future.
    if (assignment.deadline && new Date() > assignment.deadline) {
      const ext = await prisma.deadlineExtension.findUnique({
        where: { assignmentId_studentId: { assignmentId: id, studentId: req.user.id } },
      });
      if (!ext || new Date() > ext.newDeadline)
        return reject(400, req.t('assignment.deadlinePassed'));
    }

    // A student gets a fixed number of tries. The limit is enforced here rather
    // than in the browser, because the browser is not what stops a determined
    // student from posting a fourth attempt.
    const used = await prisma.submission.count({
      where: { assignmentId: id, studentId: req.user.id },
    });
    if (used >= MAX_ATTEMPTS)
      return reject(400, req.t('assignment.attemptsExhausted', { max: MAX_ATTEMPTS }));

    const mainFile = req.files?.file?.[0];
    if (!mainFile) return reject(400, req.t('assignment.noFile'));

    const allowed = new Set(['.py', '.java', '.cpp', '.txt', '.pdf', '.js', '.doc', '.docx', '.ppt', '.pptx']);
    const ext = path.extname(mainFile.originalname).toLowerCase();
    if (!allowed.has(ext))
      return reject(400, req.t('assignment.invalidFileType', { allowed: [...allowed].join(', ') }));

    const flowchartPath = req.files?.flowchart_image?.[0]?.path || null;
    const presentationPath = req.files?.presentation_file?.[0]?.path || null;

    // Reading the file (pdf-parse/mammoth/zip) is CPU work that used to run
    // here, making every student wait out their own upload's parsing before
    // seeing "submitted". It now happens inside processSubmission instead, so
    // the response below comes back as soon as the row is written — the part
    // students actually feel, especially in the last minutes before a
    // deadline when many submit within the same minute.
    //
    // The raw bytes, though, are worth reading right now: buffered into
    // `fileData` (see the schema note on Submission.fileData) so the "view
    // student's work" button still has something to serve after a redeploy
    // wipes `filePath`. Grading itself keeps reading from disk below — that
    // happens in this same process, before any deploy could intervene.
    let mainFileBuffer = null;
    try {
      mainFileBuffer = await fs.promises.readFile(mainFile.path);
    } catch (e) {
      console.error('failed to buffer submission file for durable storage', e);
    }

    let submission;
    try {
      submission = await prisma.submission.create({
        data: {
          studentId: req.user.id,
          assignmentId: id,
          attempt: used + 1,
          filePath: mainFile.path,
          flowchartPath,
          presentationPath,
          fileData: mainFileBuffer,
          fileName: mainFile.originalname,
          fileMime: mainFile.mimetype,
          overallScore: null, // null => processing
        },
      });
    } catch (e) {
      // Two submissions sent at once both counted the same number of earlier
      // attempts; the unique index rejects the second. Report it as the attempt
      // limit rather than as a server fault, which is what it amounts to.
      if (e.code === 'P2002')
        return reject(409, req.t('assignment.attemptsExhausted', { max: MAX_ATTEMPTS }));
      discardUploads(req);
      throw e;
    }

    await logActivity(req.user.id, 'SUBMISSION', 'log.submission', { title: assignment.title }, req.ip);

    // Fire-and-forget grading so the request returns immediately. There is no
    // per-criterion written answer any more — the file (and the flowchart
    // image, sent straight to the grader) is the only evidence there is.
    processSubmission({
      submissionId: submission.id,
      assignmentId: id,
      studentId: req.user.id,
      filePath: mainFile.path, // extracted (and read by Gemini) inside processSubmission
      flowchartPath,
      lang: req.lang, // AI feedback is written in the language the student submitted in
    }).catch((e) => console.error('grading error', e));

    res.status(202).json({
      message: req.t('assignment.submitted'),
      submission_id: submission.id,
      attempt: submission.attempt,
      attempts_left: MAX_ATTEMPTS - submission.attempt,
      max_attempts: MAX_ATTEMPTS,
    });
  }
);

// GET /assignments/:id/submissions  — teacher/admin
router.get('/:id(\\d+)/submissions', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  // A teacher may only see submissions for their own assignments.
  if (req.user.role === 'teacher') {
    const a = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: req.t('common.notFound') });
    if (a.teacherId !== req.user.id)
      return res.status(403).json({ message: req.t('common.unauthorized') });
  }

  const subs = await prisma.submission.findMany({
    where: { assignmentId: Number(req.params.id) },
    include: { student: true, assignment: true },
    omit: { fileData: true }, // list view — the durable file bytes aren't needed here
  });
  res.json(
    subs.map((s) => ({
      id: s.id,
      student_name: s.student ? s.student.username : 'Unknown',
      student_id: s.studentId,
      assignment_title: s.assignment ? s.assignment.title : 'Unknown',
      submitted_at: s.submittedAt ? s.submittedAt.toISOString() : null,
      overall_score: s.overallScore,
      ai_feedback_summary: s.aiFeedbackSummary,
      plagiarism_score: s.plagiarismScore,
      plagiarism_status: s.plagiarismStatus,
    }))
  );
});

// GET /assignments/:id/roster — teacher/admin: everyone the assignment was set
// for, split into who submitted and who is still missing. Each missing student
// carries their reopened deadline (if the teacher granted one) so the UI can
// show at a glance who has been given a second chance.
router.get('/:id(\\d+)/roster', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const id = Number(req.params.id);
  const assignment = await prisma.assignment.findUnique({ where: { id } });
  if (!assignment) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && assignment.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const [audience, submissions, extensions] = await Promise.all([
    assignmentAudience(assignment),
    prisma.submission.findMany({ where: { assignmentId: id }, include: { student: true }, omit: { fileData: true } }),
    prisma.deadlineExtension.findMany({ where: { assignmentId: id } }),
  ]);

  const submittedIds = new Set(submissions.map((s) => s.studentId));
  const extByStudent = new Map(extensions.map((e) => [e.studentId, e]));
  const now = new Date();

  // One row per student, not per submission: with several attempts allowed, a
  // roster listing every try would say the same student submitted three times
  // and leave the teacher to work out which mark counts. The row IS the
  // counting attempt; the others hang off it so they stay reachable.
  const byStudent = new Map();
  for (const s of submissions) {
    const list = byStudent.get(s.studentId) || [];
    list.push(s);
    byStudent.set(s.studentId, list);
  }

  res.json({
    assignment: {
      id: assignment.id,
      title: assignment.title,
      deadline: assignment.deadline ? assignment.deadline.toISOString() : null,
      max_attempts: MAX_ATTEMPTS,
    },
    submitted: [...byStudent.values()].map((tries) => {
      const best = bestAttempts(tries)[0];
      const ordered = [...tries].sort((a, b) => (a.attempt || 1) - (b.attempt || 1));
      return {
        id: best.id,
        student_id: best.studentId,
        student_name: best.student?.fullName || best.student?.username || 'Unknown',
        submitted_at: best.submittedAt ? best.submittedAt.toISOString() : null,
        overall_score: best.overallScore,
        teacher_score: best.teacherScore,
        final_score: finalScoreOf(best),
        attempt: best.attempt,
        attempts_used: tries.length,
        max_attempts: MAX_ATTEMPTS,
        // Every try, so a teacher can open an earlier one if they want to see
        // what changed between attempts.
        attempts: ordered.map((s) => ({
          id: s.id,
          attempt: s.attempt,
          score: finalScoreOf(s),
          is_best: s.id === best.id,
          submitted_at: s.submittedAt ? s.submittedAt.toISOString() : null,
        })),
        // Lets the roster flag copied work without opening every submission.
        plagiarism_score: best.plagiarismScore,
        plagiarism_status: best.plagiarismStatus,
      };
    }),
    not_submitted: audience
      .filter((u) => !submittedIds.has(u.id))
      .map((u) => {
        const ext = extByStudent.get(u.id);
        return {
          student_id: u.id,
          student_name: u.fullName || u.username,
          username: u.username,
          // The reopened deadline, and whether the student let it lapse too.
          new_deadline: ext ? ext.newDeadline.toISOString() : null,
          extension_expired: !!(ext && now > ext.newDeadline),
        };
      }),
  });
});

// POST /assignments/:id/extend — teacher/admin reopens the assignment for the
// students who missed it. Writes one per-student deadline override (upserting so
// a second extension just moves the same row) and notifies each student.
// Body: { student_ids: number[], deadline: ISO string }
router.post('/:id(\\d+)/extend', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const id = Number(req.params.id);
  const assignment = await prisma.assignment.findUnique({ where: { id } });
  if (!assignment) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && assignment.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const newDeadline = req.body?.deadline ? new Date(req.body.deadline) : null;
  if (!newDeadline || isNaN(newDeadline.getTime()))
    return res.status(400).json({ message: req.t('assignment.invalidDeadline') });
  if (newDeadline <= new Date())
    return res.status(400).json({ message: req.t('assignment.extendPast') });

  const requested = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  const studentIds = [...new Set(requested.map(Number).filter(Number.isInteger))];
  if (!studentIds.length)
    return res.status(400).json({ message: req.t('assignment.noStudents') });

  // Never grant an extension to someone outside the assignment's audience or to
  // someone who has already submitted — the request comes from the browser.
  const audienceIds = new Set((await assignmentAudience(assignment)).map((u) => u.id));
  const alreadySubmitted = new Set(
    (
      await prisma.submission.findMany({
        where: { assignmentId: id, studentId: { in: studentIds } },
        select: { studentId: true },
      })
    ).map((s) => s.studentId)
  );
  const targets = studentIds.filter((sid) => audienceIds.has(sid) && !alreadySubmitted.has(sid));
  if (!targets.length)
    return res.status(400).json({ message: req.t('assignment.noStudents') });

  await prisma.$transaction(
    targets.map((sid) =>
      prisma.deadlineExtension.upsert({
        where: { assignmentId_studentId: { assignmentId: id, studentId: sid } },
        update: { newDeadline },
        create: { assignmentId: id, studentId: sid, newDeadline },
      })
    )
  );

  // A plain day is the unit deadlines are shown in; store that so the message
  // reads the same in either language without a live date formatter.
  const shownDeadline = `${String(newDeadline.getDate()).padStart(2, '0')}.${String(
    newDeadline.getMonth() + 1
  ).padStart(2, '0')}.${newDeadline.getFullYear()}`;
  try {
    await prisma.notification.createMany({
      data: targets.map((sid) => ({
        studentId: sid,
        assignmentId: id,
        title: encodeDetails('notify.deadlineExtendedTitle', { title: assignment.title }),
        message: encodeDetails('notify.deadlineExtendedMessage', { deadline: shownDeadline }),
        type: 'assignment',
      })),
    });
  } catch (e) {
    console.error('Error creating extension notifications:', e.message);
  }

  appendAdminLog('EXTEND_DEADLINE', req.user.username, 'log.extendDeadline', {
    title: assignment.title,
    count: targets.length,
  });
  res.json({
    message: req.t('assignment.deadlineExtended', { count: targets.length }),
    count: targets.length,
  });
});

/**
 * The originality findings for one submission, shaped for who is asking.
 * A student is told how much of their work matched and which of THEIR OWN
 * passages did — never who the other student was, nor what that student wrote.
 * Naming a classmate in an automated accusation is the teacher's call to make,
 * so staff get the full picture and students get the warning.
 */
async function plagiarismPayload(submission, forStaff) {
  if (submission.plagiarismScore === null || submission.plagiarismScore === undefined) {
    return submission.plagiarismStatus ? { status: submission.plagiarismStatus, score: null } : null;
  }

  const matches = await prisma.plagiarismMatch.findMany({
    where: { submissionId: submission.id },
    orderBy: { similarity: 'desc' },
    include: {
      matchedStudent: { select: { username: true, fullName: true } },
      matchedSubmission: { select: { id: true, submittedAt: true, assignment: { select: { title: true } } } },
    },
  });

  const parseSnippets = (raw) => {
    try {
      const list = JSON.parse(raw || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  return {
    score: submission.plagiarismScore,
    status: submission.plagiarismStatus,
    penalty: submission.plagiarismPenalty,
    report: submission.plagiarismReport,
    checked_at: submission.plagiarismCheckedAt ? submission.plagiarismCheckedAt.toISOString() : null,
    matches: matches.map((m) => ({
      id: m.id,
      similarity: m.similarity,
      verdict: m.verdict,
      explanation: m.explanation,
      // The literal-overlap and AI figures are how a teacher tells "pasted" from
      // "reworded"; a student only needs the single number.
      lexical_similarity: forStaff ? m.lexicalSimilarity : undefined,
      ai_similarity: forStaff ? m.aiSimilarity : undefined,
      student_name: forStaff
        ? m.matchedStudent?.fullName || m.matchedStudent?.username || null
        : undefined,
      submission_id: forStaff ? m.matchedSubmissionId : undefined,
      assignment_title: forStaff ? m.matchedSubmission?.assignment?.title || null : undefined,
      matched_at: forStaff && m.matchedSubmission?.submittedAt
        ? m.matchedSubmission.submittedAt.toISOString()
        : undefined,
      snippets: parseSnippets(m.snippets).map((s) =>
        forStaff ? { suspect: s.suspect || '', source: s.source || '' } : { suspect: s.suspect || '' }
      ),
    })),
  };
}

// GET /assignments/submissions/:id  — detail with sections
router.get('/submissions/:id(\\d+)', async (req, res) => {
  const submission = await prisma.submission.findUnique({
    where: { id: Number(req.params.id) },
    include: { sectionScores: true, assignment: true, student: true },
    // fileData isn't sent in the response (res.json below only reports
    // has_file, a boolean), but it does need to be fetched to know that.
  });
  if (!submission) return res.status(404).json({ message: req.t('common.notFound') });

  if (req.user.role === 'student' && submission.studentId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'teacher') {
    if (submission.assignment && submission.assignment.teacherId !== req.user.id)
      return res.status(403).json({ message: req.t('common.unauthorized') });
  }

  // Order the rows the way the rubric does; a custom rubric is stored by name,
  // the standard one by its English section id.
  const { rows } = await resolveRubric(submission.assignmentId, req.lang);
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const sections = submission.sectionScores
    .slice()
    .sort((a, b) => (order.get(a.sectionName) ?? 99) - (order.get(b.sectionName) ?? 99))
    .map((ss) => ({
      section_name: rows.find((r) => r.key === ss.sectionName)?.name
        ?? sectionTitle(req.lang, ss.sectionName),
      score: ss.score,
      max_score: ss.maxScore ?? 100,
      weight: ss.weight != null ? Math.round(ss.weight * 1000) / 10 : null,
      feedback: ss.feedback,
      // What the student actually wrote for this section, shown (collapsed) so a
      // teacher can read the answer next to the mark and the evidence.
      content: ss.content || '',
      // The quote the grader based this score on — lets a teacher verify it.
      evidence: ss.evidence,
    }));

  // Where this attempt sits among the student's tries at the assignment, and
  // which one is actually being graded. A student looking at attempt 2 of 3 has
  // to be told plainly that their best attempt is the one that counts.
  const siblings = submission.assignmentId && submission.studentId
    ? await prisma.submission.findMany({
        where: { assignmentId: submission.assignmentId, studentId: submission.studentId },
        select: {
          id: true, attempt: true, overallScore: true, teacherScore: true,
          assignmentId: true, submittedAt: true,
        },
        orderBy: { attempt: 'asc' },
      })
    : [];
  const bestAttempt = siblings.length ? bestAttempts(siblings)[0] : null;

  res.json({
    id: submission.id,
    assignment_id: submission.assignmentId,
    assignment_title: submission.assignment ? submission.assignment.title : 'Unknown',
    student_id: submission.studentId,
    student_name: submission.student ? submission.student.username : 'Unknown',
    submitted_at: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    attempt: submission.attempt,
    max_attempts: MAX_ATTEMPTS,
    attempts_used: siblings.length,
    attempts_left: attemptsLeft(siblings.length),
    is_best: !bestAttempt || bestAttempt.id === submission.id,
    best_submission_id: bestAttempt?.id ?? null,
    best_score: bestAttempt ? finalScoreOf(bestAttempt) : null,
    attempts: siblings.map((s) => ({
      id: s.id,
      attempt: s.attempt,
      score: finalScoreOf(s),
      is_best: s.id === bestAttempt?.id,
      submitted_at: s.submittedAt ? s.submittedAt.toISOString() : null,
    })),
    overall_score: submission.overallScore,
    teacher_score: submission.teacherScore,
    teacher_comment: submission.teacherComment,
    // What the student's grade actually is, once a teacher has had their say.
    final_score: submission.teacherScore ?? submission.overallScore,
    reviewed_at: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
    graded_by: submission.gradedBy,
    ai_feedback_summary: submission.aiFeedbackSummary,
    // Whether the "student's work" button has anything to open (see
    // GET /assignments/download/:submission_id).
    has_file: !!(submission.filePath || submission.fileData),
    presentation_path: !!submission.presentationPath,
    plagiarism: await plagiarismPayload(submission, req.user.role !== 'student'),
    sections,
  });
});

// POST /assignments/submissions/:id/review — teacher corrects the AI's grade.
// Stored corrections are fed back into later gradings for the same assignment
// as calibration anchors, so the grader converges on this teacher's standard.
router.post('/submissions/:id(\\d+)/review', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const submission = await prisma.submission.findUnique({
    where: { id: Number(req.params.id) },
    include: { assignment: true },
  });
  if (!submission) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && submission.assignment?.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const raw = req.body?.score;
  const score = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100))
    return res.status(400).json({ message: req.t('review.invalidScore') });

  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      teacherScore: score,
      teacherComment: String(req.body?.comment || '').trim() || null,
      reviewedAt: score === null ? null : new Date(),
      reviewedById: score === null ? null : req.user.id,
    },
  });

  // The rating must follow the corrected grade, not the AI's original.
  if (submission.assignment?.course && submission.studentId) {
    try {
      await recalcRating(submission.studentId, submission.assignment.course);
    } catch (e) {
      console.error('rating recalc after review failed:', e.message);
    }
  }

  await logActivity(req.user.id, 'REVIEW', 'log.review', {
    title: submission.assignment?.title || '',
    score: score === null ? '—' : String(score),
  }, req.ip);

  res.json({
    message: req.t('review.saved'),
    teacher_score: updated.teacherScore,
    final_score: updated.teacherScore ?? updated.overallScore,
  });
});

// POST /assignments/submissions/:id/plagiarism-check — teacher/admin re-runs the
// originality check. Needed because every submission handed in before this
// feature existed has never been compared, and because a work only becomes
// provably copied once the submission it was taken from is also in the corpus.
router.post('/submissions/:id(\\d+)/plagiarism-check', async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const submission = await prisma.submission.findUnique({
    where: { id: Number(req.params.id) },
    include: { assignment: true },
  });
  if (!submission) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && submission.assignment?.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const result = await recheckPlagiarism(submission.id, req.lang);
  if (!result) return res.status(404).json({ message: req.t('common.notFound') });

  const updated = await prisma.submission.findUnique({ where: { id: submission.id } });
  res.json({
    message: req.t('plagiarism.rechecked'),
    plagiarism: await plagiarismPayload(updated, true),
    overall_score: updated.overallScore,
  });
});

// GET /assignments/download/:submission_id  — original file
router.get('/download/:submission_id(\\d+)', async (req, res) => {
  const s = await prisma.submission.findUnique({
    where: { id: Number(req.params.submission_id) },
    include: { assignment: true },
  });
  if (!s) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'student' && s.studentId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'teacher' && s.assignment?.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (s.filePath && fs.existsSync(s.filePath)) return res.download(s.filePath, s.fileName || undefined);
  // Disk copy didn't survive a redeploy — fall back to the durable one.
  if (s.fileData) {
    res.setHeader('Content-Type', s.fileMime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(s.fileName || `submission_${s.id}`)}"`
    );
    return res.send(s.fileData);
  }
  res.status(404).json({ message: req.t('common.fileNotFound') });
});

// GET /assignments/export/:submission_id  — PDF report
router.get('/export/:submission_id(\\d+)', async (req, res) => {
  const submission = await prisma.submission.findUnique({
    where: { id: Number(req.params.submission_id) },
    include: { sectionScores: true, assignment: true, student: true },
  });
  if (!submission) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'student' && submission.studentId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'teacher' && submission.assignment?.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const data = {
    assignment_title: submission.assignment?.title || 'Unknown',
    student_name: submission.student?.fullName || submission.student?.username || 'Unknown',
    submitted_at: submission.submittedAt ? submission.submittedAt.toISOString() : 'N/A',
    overall_score: submission.overallScore || 0,
    // `null` is pending; 0 is a grade, and reporting it as pending would tell a
    // student their rejected work was never marked.
    status: submission.overallScore === null ? 'Pending' : 'Graded',
    ai_comment: submission.aiFeedbackSummary || 'No summary available.',
    plagiarism: {
      score: submission.plagiarismScore,
      status: submission.plagiarismStatus,
      penalty: submission.plagiarismPenalty,
      report: submission.plagiarismReport,
    },
    criteria_scores: submission.sectionScores.map((ss) => ({
      criterion: ss.sectionName,
      score: ss.score,
      comment: ss.feedback,
    })),
  };
  const pdf = await generateSubmissionPdf(submission.id, data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Report_${submission.id}.pdf"`);
  res.send(pdf);
});

export default router;
