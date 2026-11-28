import { describe, expect, it } from 'vitest';
import { RUBRIC_TEMPLATES, levelOf, pointsForLevel, templateRows } from './rubricTemplates';

describe('rubric templates (VISTA_Assessment_Rubrics.docx)', () => {
  it('four templates with the specified maxima 36 / 40 / 48 / 40 and exactly four descriptors per criterion', () => {
    expect(RUBRIC_TEMPLATES.map((t) => t.id)).toEqual(['blockly', 'simulation', 'robot_lab', 'manual_final']);
    expect(RUBRIC_TEMPLATES.map((t) => templateRows(t).reduce((s, r) => s + Number(r.maxPoints), 0))).toEqual([36, 40, 48, 40]);
    for (const template of RUBRIC_TEMPLATES) for (const c of template.criteria) { expect(c.descriptors).toHaveLength(4); expect(c.descriptors.every(Boolean)).toBe(true); }
    expect(RUBRIC_TEMPLATES[0].criteria.map((c) => c.weight)).toEqual([3, 2, 1, 2, 1]);
  });
  it('level scoring: Blockly example 4,3,3,4,2 = 31/36 and the level/points round trip', () => {
    const max = templateRows(RUBRIC_TEMPLATES[0]).map((r) => r.maxPoints);
    expect([4, 3, 3, 4, 2].map((l, i) => pointsForLevel(l, max[i])).reduce((a, b) => a + b, 0)).toBe(31);
    expect([0, 1, 2, 3, 4].map((l) => levelOf(pointsForLevel(l, 12), 12))).toEqual([0, 1, 2, 3, 4]);
    expect(levelOf(5, 12)).toBeNull(); expect(levelOf('', 12)).toBeNull();
  });
});
