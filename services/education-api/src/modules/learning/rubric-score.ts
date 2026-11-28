/**
 * Canonical rubric score contract (additive; nothing is persisted and no historical grade is rewritten).
 * Direct-point rubrics (today's contract): criterion points are stored as `awarded_points` against `max_points`.
 * Level-based rubrics (proposal, VISTA_Assessment_Rubrics v0.1): weight w = max_points / 4, level L in {0,1,2,3,4}, points = L × w, maximum = 4 × w,
 * which is expressible with the existing columns. `null` means ungraded and is never the same as an explicit 0.
 */
export type RubricRating = "Excellent" | "Good" | "Satisfactory" | "Needs Improvement" | "Needs Review";

export interface RubricCriterionInput { maxPoints: number | string; awardedPoints: number | string | null | undefined }
export interface RubricSummary {
  awarded: number; max: number; percentage: number; scoreOutOf10: number; rating: RubricRating;
  gradedCriteria: number; totalCriteria: number; complete: boolean;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Rating is independent of any configured PASS/FAIL threshold. */
export function rubricRating(percentage: number): RubricRating {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 80) return "Good";
  if (percentage >= 70) return "Satisfactory";
  if (percentage >= 50) return "Needs Improvement";
  return "Needs Review";
}

/** points = level × (max/4); level 0 is an explicit zero. */
export function pointsForLevel(level: number, maxPoints: number | string): number {
  if (![0, 1, 2, 3, 4].includes(level)) throw new RangeError("Achievement level must be 0, 1, 2, 3 or 4.");
  const max = Number(maxPoints);
  if (!(max > 0)) throw new RangeError("Maximum points must be positive.");
  return (level * max) / 4;
}

/**
 * The denominator is the maximum of EVERY criterion (an ungraded criterion contributes 0 awarded but its maximum still counts), so a partially graded
 * rubric can never look complete. `awardedPoints` must be within [0, maxPoints]; `null`/`undefined` = ungraded.
 */
export function summarizeRubric(criteria: RubricCriterionInput[]): RubricSummary {
  let awarded = 0; let max = 0; let graded = 0;
  for (const criterion of criteria) {
    const maxPoints = Number(criterion.maxPoints);
    if (!(maxPoints > 0)) throw new RangeError("Maximum points must be positive.");
    max += maxPoints;
    if (criterion.awardedPoints === null || criterion.awardedPoints === undefined) continue;
    const points = Number(criterion.awardedPoints);
    if (!Number.isFinite(points) || points < 0 || points > maxPoints) throw new RangeError("Awarded points must be between 0 and the criterion maximum.");
    awarded += points; graded += 1;
  }
  const percentage = max > 0 ? (awarded / max) * 100 : 0;
  return {
    awarded: round2(awarded), max: round2(max), percentage: round2(percentage), scoreOutOf10: round2(percentage / 10),
    rating: rubricRating(percentage), gradedCriteria: graded, totalCriteria: criteria.length, complete: criteria.length > 0 && graded === criteria.length,
  };
}
