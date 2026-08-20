// Live Classroom — in-app video lessons carried over Agora RTC. This route
// manages the schedule/roster/status wrapper around a session and issues the
// short-lived Agora join tokens; the media itself is routed by Agora's
// service and never proxied through this API. The call UI the user actually
// sees is entirely the app's own (frontend/src/components/AgoraVideoRoom.jsx)
// — Agora never appears in it.

import crypto from 'crypto';
import { Router } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { encodeDetails, logActivity } from '../utils/logger.js';
import { buildAgoraToken } from '../utils/agoraToken.js';

const router = Router();
router.use(authRequired);

// sessionId -> uid currently spotlighted by the teacher, or absent for "no
// spotlight" (the default stage shows the teacher). Purely a live-call UI
// hint, not something worth a DB column/migration for: it only matters while
// the call is running and every entry is cleared the moment that session
// ends or is cancelled. A single Render instance keeps this simple map
// authoritative for everyone polling it.
const spotlights = new Map();

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * A unique, unguessable Agora channel name. A student who is not in the
 * audience must not be able to reach the call by typing in the assignment
 * title, so the slug is only a readability aid — the random suffix is what
 * actually makes it safe to hand out, and it is what every join token is
 * scoped to.
 */
function makeRoomName(title) {
  const slug = slugify(title);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return slug ? `${slug}-${id}` : id;
}

/**
 * The students allowed to see and join a session:
 *  - a group session is for that group's members;
 *  - a subject session (no group) is for everyone enrolled in that subject;
 *  - a plain session (neither) is for every student in the teacher's own
 *    groups plus their directly-linked students — the same "teacher-wide"
 *    rule assignmentAudience uses in routes/assignments.js.
 */
async function sessionAudience(session) {
  const ids = new Set();
  if (session.groupId) {
    const members = await prisma.user.findMany({
      where: { groupId: session.groupId, role: 'student' },
      select: { id: true },
    });
    members.forEach((m) => ids.add(m.id));
  } else if (session.subjectId) {
    const enrolled = await prisma.studentSubject.findMany({
      where: { subjectId: session.subjectId },
      select: { studentId: true },
    });
    enrolled.forEach((e) => ids.add(e.studentId));
  } else {
    const groups = await prisma.group.findMany({
      where: { teacherId: session.teacherId },
      include: { members: true },
    });
    groups.forEach((g) => g.members.forEach((m) => m.role === 'student' && ids.add(m.id)));
    const ts = await prisma.teacherStudent.findMany({
      where: { teacherId: session.teacherId },
      select: { studentId: true },
    });
    ts.forEach((rel) => ids.add(rel.studentId));
  }
  if (!ids.size) return [];
  return prisma.user.findMany({ where: { id: { in: [...ids] }, role: 'student' } });
}

// sessionId -> full audience list, cached briefly. Every participant in a
// live call polls GET /:id/spotlight every couple of seconds (see
// SPOTLIGHT_POLL_MS on the frontend), and each of those requests used to
// recompute sessionAudience() from scratch — 2-3 DB queries per poll per
// student. With a class of any real size that's dozens of queries a second
// competing for the same small connection pool the whole app shares, which
// is exactly what made the site (not just the live call) lock up while a
// lesson was running, and also slowed down the initial join (POST
// .../token hits this same check). Audience membership essentially never
// changes mid-lesson, so a short TTL cache is safe and removes almost all of
// that load; also dedupes concurrent computations (e.g. a class of students
// all joining within the same second) behind a single in-flight promise.
const audienceCache = new Map();
const AUDIENCE_CACHE_MS = 60_000;

function cachedAudience(session) {
  const cached = audienceCache.get(session.id);
  if (cached) {
    if (cached instanceof Promise) return cached;
    if (cached.expiresAt > Date.now()) return Promise.resolve(cached.rows);
  }
  const promise = sessionAudience(session)
    .then((rows) => {
      audienceCache.set(session.id, { rows, expiresAt: Date.now() + AUDIENCE_CACHE_MS });
      return rows;
    })
    .catch((e) => {
      audienceCache.delete(session.id);
      throw e;
    });
  audienceCache.set(session.id, promise);
  return promise;
}

function invalidateAudience(sessionId) {
  audienceCache.delete(sessionId);
}

async function studentCanSee(session, studentId) {
  const audience = await cachedAudience(session);
  return audience.some((u) => u.id === studentId);
}

const INCLUDE = { subject: true, group: true, teacher: true };

const out = (s) => ({
  id: s.id,
  title: s.title,
  subject_id: s.subjectId,
  subject_name: s.subject?.name || null,
  group_id: s.groupId,
  group_name: s.group?.name || null,
  teacher_id: s.teacherId,
  teacher_name: s.teacher?.fullName || s.teacher?.username || null,
  scheduled_at: s.scheduledAt.toISOString(),
  status: s.status,
  started_at: s.startedAt ? s.startedAt.toISOString() : null,
  ended_at: s.endedAt ? s.endedAt.toISOString() : null,
  created_at: s.createdAt.toISOString(),
});

/** Best-effort notification to a session's audience; never blocks the response. */
async function notifyAudience(session, actorUsername, titleKey, messageKey) {
  try {
    const audience = await sessionAudience(session);
    if (!audience.length) return;
    await prisma.notification.createMany({
      data: audience.map((student) => ({
        studentId: student.id,
        title: encodeDetails(titleKey, { title: session.title }),
        message: encodeDetails(messageKey, { teacher: actorUsername }),
        type: 'live_session',
      })),
    });
  } catch (e) {
    console.warn('live session notify failed:', e.message);
  }
}

// POST /api/live-sessions — teacher/admin schedules a new live lesson
router.post('/', roleRequired('teacher', 'admin'), async (req, res) => {
  const d = req.body || {};
  const title = String(d.title || '').trim();
  if (!title) return res.status(400).json({ message: req.t('liveSession.titleRequired') });

  const scheduledAt = d.scheduled_at ? new Date(d.scheduled_at) : null;
  if (!scheduledAt || isNaN(scheduledAt.getTime()))
    return res.status(400).json({ message: req.t('liveSession.invalidSchedule') });

  const groupId = d.group_id ? Number(d.group_id) : null;
  const subjectId = d.subject_id ? Number(d.subject_id) : null;

  // A teacher may only schedule against their own group — the id in the
  // request body is whatever the browser sent.
  if (groupId && req.user.role === 'teacher') {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.teacherId !== req.user.id)
      return res.status(403).json({ message: req.t('common.unauthorized') });
  }

  const session = await prisma.liveSession.create({
    data: {
      title,
      roomName: makeRoomName(title),
      subjectId: subjectId || null,
      groupId: groupId || null,
      teacherId: req.user.id,
      scheduledAt,
    },
    include: INCLUDE,
  });

  await notifyAudience(
    session,
    req.user.username,
    'notify.liveSessionScheduledTitle',
    'notify.liveSessionScheduledMessage'
  );

  res.status(201).json(out(session));
});

// GET /api/live-sessions — role-scoped list
router.get('/', async (req, res) => {
  const u = req.user;
  let sessions;

  if (u.role === 'admin') {
    sessions = await prisma.liveSession.findMany({ include: INCLUDE, orderBy: { scheduledAt: 'desc' } });
  } else if (u.role === 'teacher') {
    sessions = await prisma.liveSession.findMany({
      where: { teacherId: u.id },
      include: INCLUDE,
      orderBy: { scheduledAt: 'desc' },
    });
  } else {
    // Student: sessions for their group, sessions for any subject they are
    // enrolled in (ungrouped), or a teacher-wide session from one of their
    // own teachers. Mirrors sessionAudience so a student never sees a session
    // they could not also join.
    const subjectIds = (
      await prisma.studentSubject.findMany({ where: { studentId: u.id }, select: { subjectId: true } })
    ).map((s) => s.subjectId);

    const teacherIds = new Set();
    if (u.groupId) {
      const g = await prisma.group.findUnique({ where: { id: u.groupId } });
      if (g?.teacherId) teacherIds.add(g.teacherId);
    }
    const ts = await prisma.teacherStudent.findMany({ where: { studentId: u.id }, select: { teacherId: true } });
    ts.forEach((rel) => teacherIds.add(rel.teacherId));

    const conditions = [];
    if (u.groupId) conditions.push({ groupId: u.groupId });
    if (subjectIds.length) conditions.push({ subjectId: { in: subjectIds }, groupId: null });
    if (teacherIds.size) conditions.push({ teacherId: { in: [...teacherIds] }, groupId: null, subjectId: null });

    sessions = conditions.length
      ? await prisma.liveSession.findMany({
          where: { OR: conditions },
          include: INCLUDE,
          orderBy: { scheduledAt: 'desc' },
        })
      : [];
  }

  res.json(sessions.map(out));
});

// GET /api/live-sessions/:id — detail
router.get('/:id(\\d+)', async (req, res) => {
  const session = await prisma.liveSession.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE,
  });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });

  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'student' && !(await studentCanSee(session, req.user.id)))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  res.json(out(session));
});

// POST /api/live-sessions/:id/token — the one endpoint that actually grants
// access to the call. Re-checks the same audience rule as GET /:id (the
// detail response alone grants nothing) and only issues a token once the
// session is live, so a token cannot be minted for a call that isn't running.
router.post('/:id(\\d+)/token', async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });

  const isOwningTeacher = req.user.role === 'teacher' && session.teacherId === req.user.id;
  if (req.user.role === 'teacher' && !isOwningTeacher)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'student' && !(await studentCanSee(session, req.user.id)))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  if (session.status !== 'live')
    return res.status(400).json({ message: req.t('liveSession.notLive') });

  let issued;
  try {
    // Agora requires an integer uid, which req.user.id already is — no extra
    // mapping needed, and it doubles as the id AgoraVideoRoom uses to label
    // each tile with the right name/role.
    issued = buildAgoraToken({ channelName: session.roomName, uid: req.user.id, role: 'publisher' });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }

  // Best-effort attendance trail — a failure here must never block the call
  // itself from starting.
  await prisma.liveParticipant
    .upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: req.user.id } },
      create: { sessionId: session.id, userId: req.user.id, isTeacher: req.user.id === session.teacherId },
      update: { joinedAt: new Date(), leftAt: null },
    })
    .catch((e) => console.warn('live participant upsert failed:', e.message));

  // A student joining the call — the other half of "teacher's actions +
  // students joining should all be in the log" (starting/ending the session
  // itself is logged where those happen, below). The teacher's own join isn't
  // logged again here: starting the session already is that event.
  if (req.user.role === 'student')
    await logActivity(req.user.id, 'LIVE_SESSION_JOIN', 'log.liveSessionJoin', { title: session.title }, req.ip);

  res.json({
    token: issued.token,
    app_id: issued.appId,
    channel: issued.channel,
    uid: issued.uid,
    expires_in: issued.expiresIn,
  });
});

// GET /api/live-sessions/:id/roster — id -> display name for everyone who can
// legally be in this call's channel. The uid Agora hands the client on
// user-joined/user-published IS the user's own id (see the comment in the
// /token handler below), so this map is what lets the call UI show a real
// name under a tile instead of a bare "#uid".
router.get('/:id(\\d+)/roster', async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) }, include: INCLUDE });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });

  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'student' && !(await studentCanSee(session, req.user.id)))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const audience = await cachedAudience(session);
  const roster = [
    { id: session.teacherId, name: session.teacher?.fullName || session.teacher?.username || null, is_teacher: true },
    ...audience.map((u) => ({ id: u.id, name: u.fullName || u.username || null, is_teacher: false })),
  ];
  res.json(roster);
});

// GET /api/live-sessions/:id/spotlight — the uid every client should show
// large on the stage right now, or null for the default (the teacher).
// Polled by AgoraVideoRoom every couple of seconds — the call has no other
// realtime channel to push this over, and a few seconds of lag is fine for
// "the teacher is about to call on someone".
router.get('/:id(\\d+)/spotlight', async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });

  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (req.user.role === 'student' && !(await studentCanSee(session, req.user.id)))
    return res.status(403).json({ message: req.t('common.unauthorized') });

  res.json({ uid: spotlights.has(session.id) ? spotlights.get(session.id) : null });
});

// POST /api/live-sessions/:id/spotlight — the owning teacher (or admin)
// picks who's on the big stage: a student's uid to call on them, or null to
// go back to showing the teacher.
router.post('/:id(\\d+)/spotlight', roleRequired('teacher', 'admin'), async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const raw = req.body?.uid;
  if (raw === null || raw === undefined) {
    spotlights.delete(session.id);
    return res.json({ uid: null });
  }
  const uid = Number(raw);
  // Only someone who could actually be a tile in this call — the teacher, or
  // a student in its audience — is a legal spotlight target.
  if (!Number.isInteger(uid) || (uid !== session.teacherId && !(await studentCanSee(session, uid))))
    return res.status(400).json({ message: req.t('common.notFound') });

  spotlights.set(session.id, uid);
  res.json({ uid });
});

// POST /api/live-sessions/:id/leave — best-effort attendance close-off, called
// by the client on leaving the call (button click or unmount). Never a hard
// requirement for anything else the app does with a session.
router.post('/:id(\\d+)/leave', async (req, res) => {
  await prisma.liveParticipant
    .updateMany({
      where: { sessionId: Number(req.params.id), userId: req.user.id, leftAt: null },
      data: { leftAt: new Date() },
    })
    .catch((e) => console.warn('live participant leave failed:', e.message));
  res.json({ ok: true });
});

// PATCH /api/live-sessions/:id/start — owning teacher (or admin) goes live
router.patch('/:id(\\d+)/start', roleRequired('teacher', 'admin'), async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });
  if (session.status === 'cancelled' || session.status === 'ended')
    return res.status(400).json({ message: req.t('liveSession.cannotStart') });

  const updated = await prisma.liveSession.update({
    where: { id: session.id },
    // startedAt is set once — restarting an already-live session (a second
    // "Start" click from a reloaded tab) must not push the recorded start time.
    data: { status: 'live', startedAt: session.startedAt || new Date() },
    include: INCLUDE,
  });

  await notifyAudience(updated, req.user.username, 'notify.liveSessionLiveTitle', 'notify.liveSessionLiveMessage');
  // Shows up on the admin's "teacher actions" feed (Bildirishnoma) and the
  // full audit log — "shu o'qituvchi efir ochti" is exactly what that page
  // is meant to surface.
  await logActivity(req.user.id, 'LIVE_SESSION_START', 'log.liveSessionStart', { title: updated.title }, req.ip);

  res.json(out(updated));
});

// PATCH /api/live-sessions/:id/end
router.patch('/:id(\\d+)/end', roleRequired('teacher', 'admin'), async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  const updated = await prisma.liveSession.update({
    where: { id: session.id },
    data: { status: 'ended', endedAt: new Date() },
    include: INCLUDE,
  });
  spotlights.delete(session.id);
  invalidateAudience(session.id);
  await logActivity(req.user.id, 'LIVE_SESSION_END', 'log.liveSessionEnd', { title: updated.title }, req.ip);
  res.json(out(updated));
});

// DELETE /api/live-sessions/:id — cancel, removing the row outright so it
// does not linger in the list under a "cancelled" tag.
router.delete('/:id(\\d+)', roleRequired('teacher', 'admin'), async (req, res) => {
  const session = await prisma.liveSession.findUnique({ where: { id: Number(req.params.id) } });
  if (!session) return res.status(404).json({ message: req.t('common.notFound') });
  if (req.user.role === 'teacher' && session.teacherId !== req.user.id)
    return res.status(403).json({ message: req.t('common.unauthorized') });

  await prisma.liveSession.delete({ where: { id: session.id } });
  spotlights.delete(session.id);
  invalidateAudience(session.id);
  res.json({ id: session.id });
});

export default router;
