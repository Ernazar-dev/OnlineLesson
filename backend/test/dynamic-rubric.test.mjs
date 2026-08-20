// Proves grading is dynamic against the rubric, not hardcoded: when a
// teacher's criteria change (weight, maxScore) — or don't exist at all — the
// SAME per-criterion scores must total to a DIFFERENT final grade.
//
// Exercises the real path grading uses: resolveRubric() + weightedTotal()
// from services/rubric.js. Writes a throwaway assignment+criteria to the
// database configured in .env and deletes it when done, pass or fail.
//
// Run: npm test  (needs a reachable DATABASE_URL and at least one teacher user)
import prisma from '../src/lib/prisma.js';
import { resolveRubric, weightedTotal } from '../src/services/rubric.js';

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
};

let assignmentId;
try {
  const teacher = await prisma.user.findFirst({ where: { role: 'teacher' } });
  if (!teacher) throw new Error('No teacher user in DB to own the test assignment');

  const assignment = await prisma.assignment.create({
    data: { title: '[TEST] Dynamic rubric check', teacherId: teacher.id, course: 'test-course' },
  });
  assignmentId = assignment.id;

  await prisma.criterion.createMany({
    data: [
      { assignmentId, name: 'Theory', description: 'Explains the theory', weight: 1, maxScore: 100, position: 0 },
      { assignmentId, name: 'Practice', description: 'Working implementation', weight: 1, maxScore: 100, position: 1 },
    ],
  });

  // --- 1. No criteria => falls back to the standard rubric.
  const noCriteria = await prisma.assignment.create({
    data: { title: '[TEST] No rubric', teacherId: teacher.id, course: 'test-course' },
  });
  const { rows: standardRows, custom: isCustom0 } = await resolveRubric(noCriteria.id);
  ok(isCustom0 === false, 'assignment with no Criterion rows falls back to standard rubric');
  ok(standardRows.length === 4, `standard rubric has 4 rows (got ${standardRows.length})`);
  await prisma.assignment.delete({ where: { id: noCriteria.id } });

  // --- 2. Equal weights (1/1): same simulated scores per criterion → total = their average.
  const { rows: rows1, custom } = await resolveRubric(assignmentId);
  ok(custom === true, 'assignment with Criterion rows resolves as custom rubric');
  ok(
    Math.abs(rows1[0].weight - 0.5) < 1e-9 && Math.abs(rows1[1].weight - 0.5) < 1e-9,
    `equal raw weights normalise to 0.5/0.5 (got ${rows1.map((r) => r.weight)})`
  );

  const scores = { Theory: 80, Practice: 40 };
  const total1 = weightedTotal(rows1, scores);
  ok(total1 === 60, `equal weights: (80+40)/2 = 60 (got ${total1})`);

  // --- 3. Teacher reweights Theory 3x heavier — grading of the SAME scores must move.
  await prisma.criterion.updateMany({ where: { assignmentId, name: 'Theory' }, data: { weight: 3 } });
  const { rows: rows2 } = await resolveRubric(assignmentId);
  const total2 = weightedTotal(rows2, scores);
  // 3/4 * 80 + 1/4 * 40 = 60 + 10 = 70
  ok(total2 === 70, `after reweighting Theory to 3x, same scores now total 70 (got ${total2})`);
  ok(total2 !== total1, 'grading changed after criteria changed, without touching the scores');

  // --- 4. Teacher lowers Practice's maxScore to 50 — a raw score of 40 is now
  // closer to "full marks" on that row, so its contribution should rise even
  // though nothing about the submission changed.
  await prisma.criterion.updateMany({ where: { assignmentId, name: 'Practice' }, data: { maxScore: 50 } });
  const { rows: rows3 } = await resolveRubric(assignmentId);
  const total3 = weightedTotal(rows3, scores);
  // Practice: 40/50 = 80%. 3/4*80 + 1/4*80 = 80
  ok(total3 === 80, `after halving Practice's maxScore, same raw scores now total 80 (got ${total3})`);
} catch (e) {
  console.error('ERROR:', e);
  failures++;
} finally {
  if (assignmentId) {
    await prisma.criterion.deleteMany({ where: { assignmentId } }).catch(() => {});
    await prisma.assignment.delete({ where: { id: assignmentId } }).catch(() => {});
  }
  await prisma.$disconnect();
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll dynamic-rubric checks passed.');
