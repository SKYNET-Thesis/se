import { pointsForLevel, rubricRating, summarizeRubric } from "./rubric-score";

describe("rubric score contract", () => {
  it("keeps the existing direct-point WF-04 example: 6/6 + 3/4 = 9/10 = 90 %", () => {
    expect(summarizeRubric([{ maxPoints: 6, awardedPoints: 6 }, { maxPoints: 4, awardedPoints: 3 }]))
      .toMatchObject({ awarded: 9, max: 10, percentage: 90, scoreOutOf10: 9, rating: "Excellent", complete: true });
  });
  it("matches the proposed Blockly template: levels 4,3,3,4,2 with weights 3,2,1,2,1 = 31/36 = 86.11 % = 8.61/10 (weights never applied twice)", () => {
    const weights = [3, 2, 1, 2, 1]; const levels = [4, 3, 3, 4, 2];
    const criteria = weights.map((w, i) => ({ maxPoints: 4 * w, awardedPoints: pointsForLevel(levels[i], 4 * w) }));
    expect(criteria.map((c) => c.awardedPoints)).toEqual([12, 6, 3, 8, 2]);
    expect(summarizeRubric(criteria)).toMatchObject({ awarded: 31, max: 36, percentage: 86.11, scoreOutOf10: 8.61, rating: "Good" });
  });
  it("template maxima: Blockly 36, Simulation 40, Physical 48, Final 40", () => {
    const max = (weights: number[]) => summarizeRubric(weights.map((w) => ({ maxPoints: 4 * w, awardedPoints: null }))).max;
    expect([max([3, 2, 1, 2, 1]), max([3, 2, 2, 2, 1]), max([3, 2, 2, 3, 2]), max([3, 3, 2, 2])]).toEqual([36, 40, 48, 40]);
  });
  it("all levels yield level × weight; an explicit zero is valid and differs from ungraded", () => {
    expect([0, 1, 2, 3, 4].map((level) => pointsForLevel(level, 12))).toEqual([0, 3, 6, 9, 12]);
    const zero = summarizeRubric([{ maxPoints: 8, awardedPoints: 0 }, { maxPoints: 8, awardedPoints: 8 }]);
    const ungraded = summarizeRubric([{ maxPoints: 8, awardedPoints: null }, { maxPoints: 8, awardedPoints: 8 }]);
    expect(zero).toMatchObject({ awarded: 8, max: 16, gradedCriteria: 2, complete: true });
    expect(ungraded).toMatchObject({ awarded: 8, max: 16, gradedCriteria: 1, complete: false });   // the denominator still counts the ungraded criterion
  });
  it("rejects invalid values", () => {
    expect(() => pointsForLevel(5, 4)).toThrow(RangeError);
    expect(() => pointsForLevel(2, 0)).toThrow(RangeError);
    expect(() => summarizeRubric([{ maxPoints: 4, awardedPoints: 5 }])).toThrow(RangeError);
    expect(() => summarizeRubric([{ maxPoints: 4, awardedPoints: -1 }])).toThrow(RangeError);
  });
  it("rating thresholds are independent of pass/fail", () => {
    expect([100, 90, 89.99, 80, 79.99, 70, 69.99, 50, 49.99, 0].map(rubricRating)).toEqual(
      ["Excellent", "Excellent", "Good", "Good", "Satisfactory", "Satisfactory", "Needs Improvement", "Needs Improvement", "Needs Review", "Needs Review"]);
  });
});
