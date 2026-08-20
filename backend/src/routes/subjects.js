import { Router } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { recalcRating } from '../services/gradingService.js';
import { generateAcademicReportPdf } from '../services/pdfService.js';
import { getOrCreateSubject } from '../services/subjectService.js';
import { attemptsLeft, bestAttempts, finalScoreOf, MAX_ATTEMPTS } from '../utils/attempts.js';

const router = Router();

// Subject picture, set on /admin/subjects — served to <img> tags, which can't
// send the Authorization header, so this route stays public and sits before
// authRequired below (same reasoning as literature's /cover/:id).
router.get('/image/:id(\\d+)', async (req, res) => {
  const subject = await prisma.subject.findUnique({ where: { id: Number(req.params.id) } });
  if (!subject?.imageData) return res.status(404).json({ message: 'Not found' });
  res.setHeader('Content-Type', subject.imageMime || 'image/jpeg');
  res.send(subject.imageData);
});

router.use(authRequired);

// GET /api/subjects/  — subjects derived from assignment courses
router.get('/', async (req, res) => {
  const u = req.user;
  let assignments;
  if (u.role === 'student') {
    assignments = u.groupId ? await prisma.assignment.findMany({ where: { groupId: u.groupId } }) : [];
  } else {
    assignments = await prisma.assignment.findMany();
  }

  const courseNames = new Set(assignments.map((a) => a.course).filter(Boolean));

  // Teachers/admins also need subjects that exist in the catalogue but have no
  // assignment yet — otherwise the "create assignment" wizard would offer an
  // empty subject list until an assignment already exists (chicken and egg).
  if (u.role !== 'student') {
    const catalogue = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
    catalogue.forEach((s) => courseNames.add(s.name));
  }

  const list = [];
  for (const name of courseNames) {
    const subject = await getOrCreateSubject(name);
    const count =
      u.role === 'student'
        ? await prisma.assignment.count({ where: { course: name, groupId: u.groupId } })
        : await prisma.assignment.count({ where: { course: name } });
    list.push({
      id: subject.id,
      name: subject.name,
      code: subject.code,
      description: subject.description,
      image_url: subject.imageData ? `/api/subjects/image/${subject.id}` : null,
      assignment_count: count,
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  res.json(list);
});

// GET /api/subjects/:id/assignments
router.get('/:subjectId(\\d+)/assignments', async (req, res) => {
  const subject = await prisma.subject.findUnique({ where: { id: Number(req.params.subjectId) } });
  if (!subject) return res.status(404).json({ message: req.t('common.notFound') });
  const u = req.user;

  const assignments =
    u.role === 'student'
      ? await prisma.assignment.findMany({ where: { course: subject.name, groupId: u.groupId } })
      : await prisma.assignment.findMany({ where: { course: subject.name } });

  // Same attempt state the main assignment list carries: a student browsing by
  // subject must see the tries they have left, not just that they submitted
  // once. Grouped per assignment so the best try can be picked out.
  const subs = await prisma.submission.findMany({ where: { studentId: u.id } });
  const byAssignment = new Map();
  for (const s of subs) {
    const list = byAssignment.get(s.assignmentId) || [];
    list.push(s);
    byAssignment.set(s.assignmentId, list);
  }
  const now = new Date();

  // One query for every teacher named in the list, not one per assignment.
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.teacherId).filter(Boolean))] } },
    select: { id: true, username: true },
  });
  const teacherById = new Map(teachers.map((u) => [u.id, u]));

  const out = [];
  for (const a of assignments) {
    const teacher = a.teacherId ? teacherById.get(a.teacherId) : null;
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
      created_at: a.createdAt ? a.createdAt.toISOString() : null,
      is_expired: !!(a.deadline && a.deadline < now),
      is_upcoming: !!(a.startAt && now < a.startAt),
      is_submitted: mine.length > 0,
      // Points at the try that counts, not merely the first one on file.
      submission_id: best?.id ?? null,
      max_attempts: MAX_ATTEMPTS,
      attempts_used: mine.length,
      attempts_left: attemptsLeft(mine.length),
      best_submission_id: best?.id ?? null,
      best_score: best ? finalScoreOf(best) : null,
    });
  }
  res.json(out);
});

// GET /api/subjects/academic-ratings
router.get('/academic-ratings', async (req, res) => {
  if (req.user.role !== 'student')
    return res.status(403).json({ message: req.t('subject.onlyStudentsRatings') });

  const assignments = await prisma.assignment.findMany();
  const courseNames = [...new Set(assignments.map((a) => a.course).filter(Boolean))];

  const list = [];
  for (const name of courseNames) {
    const subject = await getOrCreateSubject(name);
    let rating = await prisma.academicRating.findUnique({
      where: { studentId_subjectId: { studentId: req.user.id, subjectId: subject.id } },
    });
    if (!rating) rating = await recalcRating(req.user.id, name);
    list.push({
      subject_id: subject.id,
      subject_name: subject.name,
      subject_code: subject.code,
      rating: rating.rating,
      total_assignments: rating.totalAssignments,
      completed_assignments: rating.completedAssignments,
      average_score: rating.averageScore,
      last_updated: rating.lastUpdated ? rating.lastUpdated.toISOString() : null,
    });
  }
  res.json(list);
});

// POST /api/subjects/:id/calculate-rating
router.post('/:subjectId(\\d+)/calculate-rating', async (req, res) => {
  if (req.user.role !== 'student')
    return res.status(403).json({ message: req.t('subject.onlyStudentsCalc') });
  const subject = await prisma.subject.findUnique({ where: { id: Number(req.params.subjectId) } });
  if (!subject) return res.status(404).json({ message: req.t('common.notFound') });
  const rating = await recalcRating(req.user.id, subject.name);
  res.json({
    subject_id: subject.id,
    subject_name: subject.name,
    rating: rating.rating,
    total_assignments: rating.totalAssignments,
    completed_assignments: rating.completedAssignments,
    average_score: rating.averageScore,
    last_updated: rating.lastUpdated ? rating.lastUpdated.toISOString() : null,
  });
});

// GET /api/subjects/academic-report/download
router.get('/academic-report/download', async (req, res) => {
  if (req.user.role !== 'student')
    return res.status(403).json({ message: req.t('subject.onlyStudentsReport') });

  const allAssignments = await prisma.assignment.findMany();
  const courseNames = [...new Set(allAssignments.map((a) => a.course).filter(Boolean))].sort();
  const allSubs = await prisma.submission.findMany({ where: { studentId: req.user.id } });

  const subjectsData = [];
  for (const name of courseNames) {
    const subject = await prisma.subject.findFirst({ where: { name } });
    if (!subject) continue;
    let rating = await prisma.academicRating.findUnique({
      where: { studentId_subjectId: { studentId: req.user.id, subjectId: subject.id } },
    });
    if (!rating) rating = await recalcRating(req.user.id, name);

    const subjectAssignments = allAssignments.filter((a) => a.course === name);
    const saIds = new Set(subjectAssignments.map((a) => a.id));
    // One line per assignment — the attempt that counts. An academic report
    // listing all three tries would read as three separate pieces of work.
    const submissions = bestAttempts(allSubs.filter((s) => saIds.has(s.assignmentId))).map((s) => ({
      title: subjectAssignments.find((a) => a.id === s.assignmentId)?.title || 'Unknown',
      submitted_at: s.submittedAt,
      score: finalScoreOf(s),
    }));

    subjectsData.push({
      name,
      rating: rating.rating,
      average_score: rating.averageScore,
      total_assignments: rating.totalAssignments,
      completed_assignments: rating.completedAssignments,
      submissions,
    });
  }

  const pdf = await generateAcademicReportPdf(
    { name: req.user.fullName || req.user.username, email: req.user.email },
    subjectsData
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Academic_Report_${req.user.username}.pdf"`);
  res.send(pdf);
});

export default router;
