import { describe, expect, it } from 'vitest';
import { liveRubricSummary, rubricRatingLabel } from './rubricSummary';

describe('live rubric summary (mirrors the API contract)', () => {
  it('9/10 legacy example and the 31/36 Blockly template example', () => {
    expect(liveRubricSummary([{ id: 'a', maxPoints: 6 }, { id: 'b', maxPoints: 4 }], { a: '6', b: '3' })).toMatchObject({ awarded: 9, max: 10, percentage: 90, scoreOutOf10: 9, rating: 'Excellent', complete: true });
    const criteria = [12, 8, 4, 8, 4].map((maxPoints, i) => ({ id: String(i), maxPoints }));
    expect(liveRubricSummary(criteria, { 0: '12', 1: '6', 2: '3', 3: '8', 4: '2' })).toMatchObject({ awarded: 31, max: 36, percentage: 86.11, scoreOutOf10: 8.61, rating: 'Good' });
  });
  it('blank is ungraded and still counts in the maximum; 0 is a grade', () => {
    const criteria = [{ id: 'a', maxPoints: 8 }, { id: 'b', maxPoints: 8 }];
    expect(liveRubricSummary(criteria, { a: '0', b: '8' })).toMatchObject({ awarded: 8, max: 16, graded: 2, complete: true });
    expect(liveRubricSummary(criteria, { a: '', b: '8' })).toMatchObject({ awarded: 8, max: 16, graded: 1, complete: false });
  });
  it('rating thresholds', () => {
    expect([90, 89.9, 80, 70, 50, 49.9].map(rubricRatingLabel)).toEqual(['Excellent', 'Good', 'Good', 'Satisfactory', 'Needs Improvement', 'Needs Review']);
  });
});
