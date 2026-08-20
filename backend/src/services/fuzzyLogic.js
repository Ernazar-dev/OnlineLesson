// Ported from services/fuzzy_logic.py
// Weighted final score + traditional 2-5 grade conversion.

// Subject-agnostic default rubric — see aiService.js's ORDERED_SECTIONS.
const WEIGHTS = {
  Requirements: 0.3,
  Correctness: 0.3,
  Evidence: 0.25,
  Clarity: 0.15,
};

export function calculateFinalScore(scoresDict) {
  let totalWeighted = 0;
  let totalWeight = 0;
  for (const [section, weight] of Object.entries(WEIGHTS)) {
    const score = scoresDict[section] ?? 0;
    totalWeighted += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((totalWeighted / totalWeight) * 100) / 100;
}

export function getTraditionalGrade(score) {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  return 2;
}

export const SECTION_WEIGHTS = WEIGHTS;
