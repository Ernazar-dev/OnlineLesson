import { Router } from '../lib/asyncRouter.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { countingScores } from '../utils/attempts.js';
import { avatarUrlOf } from '../lib/avatar.js';

const router = Router();

// Avatar upload — kept in memory like Subject/Book pictures, never written to
// disk (Render's free web service has no persistent disk across deploys).
const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileSize } });

// GET /api/users/avatar/:id — a user's profile photo, served to <img> tags,
// which can't send the Authorization header, so this route stays public and
// sits before authRequired below (same reasoning as subjects' /image/:id).
router.get('/avatar/:id(\\d+)', async (req, res) => {
  const profile = await prisma.userProfile.findUnique({ where: { userId: Number(req.params.id) } });
  if (!profile?.avatarData) return res.status(404).json({ message: 'Not found' });
  res.setHeader('Content-Type', profile.avatarMime || 'image/jpeg');
  // The URL is the same before and after a user replaces their photo — force a
  // revalidation each time rather than letting the browser serve last week's
  // picture straight from disk cache.
  res.setHeader('Cache-Control', 'no-cache');
  res.send(profile.avatarData);
});

router.use(authRequired);

// GET /api/users/profile — everything the profile page shows: the account
// fields, plus whatever role-specific numbers make it feel complete rather
// than a bare form (a student's group and results, a teacher's groups).
router.get('/profile', async (req, res) => {
  const u = req.user;
  const profile = u.profile;

  const department = u.departmentId
    ? await prisma.department.findUnique({ where: { id: u.departmentId } })
    : null;

  let stats = null;
  if (u.role === 'student') {
    const submissions = await prisma.submission.findMany({ where: { studentId: u.id } });
    const scores = countingScores(submissions);
    stats = {
      completed_assignments: scores.length,
      average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    };
  } else if (u.role === 'teacher') {
    const groups = await prisma.group.findMany({
      where: { teacherId: u.id },
      include: { _count: { select: { members: true } } },
    });
    stats = {
      groups_count: groups.length,
      students_count: groups.reduce((sum, g) => sum + g._count.members, 0),
    };
  }

  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    phone: u.phone,
    full_name: u.fullName,
    role: u.role,
    display_name: profile?.displayName || u.fullName || u.username,
    avatar_url: avatarUrlOf(u),
    group_name: u.group ? u.group.name : null,
    department_name: department?.name || null,
    created_at: u.createdAt.toISOString(),
    last_seen: u.lastSeen ? u.lastSeen.toISOString() : null,
    stats,
  });
});

// GET /api/users/my-group — the student's own group: curator, peers, assignments
router.get('/my-group', async (req, res) => {
  if (!req.user.groupId) return res.json(null);

  const group = await prisma.group.findUnique({
    where: { id: req.user.groupId },
    include: {
      teacher: { include: { profile: { select: { avatarMime: true } } } },
      members: {
        where: { role: 'student' },
        orderBy: { fullName: 'asc' },
        include: { submissions: true, profile: { select: { avatarMime: true } } },
      },
      assignments: { orderBy: { deadline: 'asc' } },
    },
  });
  if (!group) return res.json(null);

  // One score per member — their best attempt across every assignment — so the
  // ranking matches the rating shown everywhere else on the platform.
  const ranking = group.members
    .map((m) => {
      const scores = countingScores(m.submissions);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return {
        id: m.id,
        username: m.username,
        full_name: m.fullName,
        avatar_url: avatarUrlOf(m),
        average_score: Math.round(avg * 10) / 10,
        submission_count: scores.length,
      };
    })
    .sort((a, b) => b.average_score - a.average_score);

  res.json({
    id: group.id,
    name: group.name,
    curator: group.teacher?.fullName || group.teacher?.username || null,
    curator_avatar: avatarUrlOf(group.teacher),
    student_count: group.members.length,
    students: group.members.map((m) => ({
      id: m.id,
      username: m.username,
      full_name: m.fullName,
      avatar_url: avatarUrlOf(m),
    })),
    assignments: group.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      start_at: a.startAt ? a.startAt.toISOString() : null,
      deadline: a.deadline ? a.deadline.toISOString() : null,
      is_expired: !!(a.deadline && new Date() > a.deadline),
      is_upcoming: !!(a.startAt && new Date() < a.startAt),
    })),
    ranking,
  });
});

// PUT /api/users/profile
router.put('/profile', async (req, res) => {
  const { phone, full_name, display_name, email } = req.body || {};
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      phone: phone ?? req.user.phone,
      fullName: full_name ?? req.user.fullName,
      email: email !== undefined ? (String(email).trim() || null) : req.user.email,
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: req.user.id },
    update: { displayName: display_name ?? full_name ?? null },
    create: { userId: req.user.id, displayName: display_name ?? full_name ?? null },
  });
  res.json({ message: req.t('user.profileUpdated') });
});

// PUT /api/users/password
router.put('/password', async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password) return res.status(400).json({ error: req.t('user.newPasswordRequired') });
  if (String(new_password).length < 4)
    return res.status(400).json({ error: req.t('user.passwordTooShort') });
  // The current password is required, not optional: a token left behind on a
  // shared computer must not be enough to take the account over. An admin who
  // needs to reset a forgotten password does it from the Users page.
  if (!old_password) return res.status(400).json({ error: req.t('user.oldPasswordRequired') });
  const fresh = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(old_password, fresh.passwordHash)))
    return res.status(400).json({ error: req.t('user.oldPasswordWrong') });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await bcrypt.hash(new_password, 10) },
  });
  res.json({ message: req.t('user.passwordUpdated') });
});

// POST /api/users/avatar — the profile photo, replacing whatever was there.
router.post('/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: req.t('user.avatarRequired') });
  await prisma.userProfile.upsert({
    where: { userId: req.user.id },
    update: { avatarData: req.file.buffer, avatarMime: req.file.mimetype },
    create: { userId: req.user.id, avatarData: req.file.buffer, avatarMime: req.file.mimetype },
  });
  res.json({ message: req.t('user.avatarUpdated'), avatar_url: `/api/users/avatar/${req.user.id}` });
});

// DELETE /api/users/avatar — back to the initials fallback.
router.delete('/avatar', async (req, res) => {
  await prisma.userProfile.upsert({
    where: { userId: req.user.id },
    update: { avatarData: null, avatarMime: null },
    create: { userId: req.user.id },
  });
  res.json({ message: req.t('user.avatarRemoved') });
});

export default router;
