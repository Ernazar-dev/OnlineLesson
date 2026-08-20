// Multiple attempts per assignment, and the one rule that follows from it.
//
// A student may hand in an assignment up to `config.maxAttempts` times. Only
// their BEST attempt counts — every average, rating, leaderboard and report has
// to agree on that, or the same student shows a different mark depending on
// which page you look at. So the rule lives here once and is imported, never
// re-implemented at the call site.

import config from '../config.js';

export const MAX_ATTEMPTS = config.maxAttempts;

/**
 * The grade a submission actually carries: a teacher's correction is
 * authoritative wherever one exists, otherwise the AI's score. `null` means the
 * work has not been graded yet (still processing) and cannot be compared.
 */
export function finalScoreOf(submission) {
  if (!submission) return null;
  const score = submission.teacherScore ?? submission.overallScore;
  return score === null || score === undefined ? null : score;
}

/**
 * Reduces a student's submissions to one per assignment: the best-scoring
 * attempt. Ungraded attempts lose to graded ones but still represent the
 * assignment when they are all there is, so an assignment being worked on does
 * not vanish from the roster.
 */
export function bestAttempts(submissions) {
  const best = new Map();
  for (const sub of submissions || []) {
    const key = sub.assignmentId ?? `s${sub.id}`; // an orphaned submission is its own group
    const current = best.get(key);
    if (!current) {
      best.set(key, sub);
      continue;
    }
    const a = finalScoreOf(sub);
    const b = finalScoreOf(current);
    if (b === null ? a !== null : a !== null && a > b) best.set(key, sub);
  }
  return [...best.values()];
}

/**
 * The scores that count for a student, one per assignment. Ungraded and
 * zero-scored attempts are left out: a zero is what the platform gives work the
 * grader rejected, and averaging that in would punish a student twice.
 */
export function countingScores(submissions) {
  return bestAttempts(submissions)
    .map(finalScoreOf)
    .filter((v) => v !== null && v > 0);
}

/** How many attempts the student has left on this assignment. */
export const attemptsLeft = (used) => Math.max(0, MAX_ATTEMPTS - used);
