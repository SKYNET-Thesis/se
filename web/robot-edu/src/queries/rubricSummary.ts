/** Client-side twin of the API's `summarizeRubric` for the LIVE instructor total while typing (the released/student numbers always come from the server summary). */
export type RubricRatingLabel = 'Excellent' | 'Good' | 'Satisfactory' | 'Needs Improvement' | 'Needs Review';
export function rubricRatingLabel(percentage: number): RubricRatingLabel {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Good';
  if (percentage >= 70) return 'Satisfactory';
  if (percentage >= 50) return 'Needs Improvement';
  return 'Needs Review';
}
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
/** Blank (or non-numeric) input = ungraded; an explicit 0 is a grade. The maximum always counts every criterion. */
export function liveRubricSummary(criteria: Array<{ id: string; maxPoints: number | string }>, points: Record<string, string>) {
  let awarded = 0; let max = 0; let graded = 0;
  for (const criterion of criteria) {
    max += Number(criterion.maxPoints);
    const raw = (points[criterion.id] ?? '').trim();
    if (raw === '' || !Number.isFinite(Number(raw))) continue;
    awarded += Number(raw); graded += 1;
  }
  const percentage = max > 0 ? (awarded / max) * 100 : 0;
  return { awarded: round2(awarded), max: round2(max), percentage: round2(percentage), scoreOutOf10: round2(percentage / 10), rating: rubricRatingLabel(percentage), graded, total: criteria.length, complete: criteria.length > 0 && graded === criteria.length };
}
