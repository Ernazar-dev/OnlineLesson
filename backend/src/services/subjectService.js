// Subjects are referenced by name in several places (assignment.course, rating
// recalculation, the subjects page). This resolves a name to a single canonical
// Subject row so those places all point at the same record.

import prisma from '../lib/prisma.js';

/** Finds the Subject with this name, creating it if it does not exist yet. */
export async function getOrCreateSubject(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  const existing = await prisma.subject.findFirst({ where: { name: clean } });
  if (existing) return existing;

  // `code` is unique, so a code derived from the name can collide with a
  // subject an admin created earlier. Try the plain code, then a suffixed one,
  // then fall back to no code — never let this throw into a caller (it also
  // runs inside background grading).
  const base = clean.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || 'SUBJECT';
  const candidates = [base, `${base}_${Date.now().toString(36).toUpperCase()}`, null];

  for (const code of candidates) {
    try {
      return await prisma.subject.create({ data: { name: clean, code } });
    } catch {
      // Another request may have created it in the meantime.
      const raced = await prisma.subject.findFirst({ where: { name: clean } });
      if (raced) return raced;
    }
  }
  return null;
}

export default getOrCreateSubject;
