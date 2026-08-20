import prisma from '../lib/prisma.js';

/**
 * Per-group activity used by the admin & teacher dashboards. "Activity" is the
 * number of submissions produced by a group's students; we also return the head
 * count and how many members were seen in the last 7 days for context.
 *
 * @param {number[]|null} groupIds  Restrict to these groups (teacher view); null = all groups (admin).
 */
export async function getGroupActivity(groupIds = null) {
  const groups = await prisma.group.findMany({
    where: groupIds ? { id: { in: groupIds } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (groups.length === 0) return [];

  const students = await prisma.user.findMany({
    where: { role: 'student', groupId: { in: groups.map((g) => g.id) } },
    select: { groupId: true, lastSeen: true, _count: { select: { submissions: true } } },
  });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = new Map(
    groups.map((g) => [g.id, { id: g.id, name: g.name, student_count: 0, active_students: 0, submission_count: 0 }])
  );
  for (const s of students) {
    const row = rows.get(s.groupId);
    if (!row) continue;
    row.student_count += 1;
    row.submission_count += s._count.submissions;
    if (s.lastSeen && s.lastSeen >= weekAgo) row.active_students += 1;
  }
  return [...rows.values()];
}
