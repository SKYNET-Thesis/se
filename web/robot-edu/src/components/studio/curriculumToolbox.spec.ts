import { describe, expect, it } from 'vitest';
import { buildCurriculumToolbox, validateWorkspaceBlockTypes } from './curriculumToolbox';

describe('curriculum toolbox', () => {
  it('maps L2 canonical capabilities to the existing Blockly block types', () => {
    const result = buildCurriculumToolbox(['arm.select', 'home', 'preview.move_xyz', 'wait']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blockTypes).toEqual(['robot_start', 'robot_select_arm', 'robot_move_home', 'robot_move_to', 'robot_wait']);
  });

  it('adds gripper blocks only when the server permits them', () => {
    const l2 = buildCurriculumToolbox(['arm.select', 'home', 'preview.move_xyz', 'wait']);
    const l3 = buildCurriculumToolbox(['arm.select', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close']);
    expect(l2.ok && l2.blockTypes).not.toContain('robot_gripper_open');
    expect(l3.ok && l3.blockTypes).toEqual(expect.arrayContaining(['robot_gripper_open', 'robot_gripper_close']));
  });

  it('keeps L3/L4 limited to movement and gripper capabilities', () => {
    const result = buildCurriculumToolbox(['arm.select', 'home', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blockTypes).toEqual(expect.arrayContaining(['robot_move_to', 'robot_gripper_open', 'robot_gripper_close']));
      expect(result.blockTypes).not.toEqual(expect.arrayContaining(['robot_repeat', 'robot_if', 'robot_move_both', 'vision_ai_plan']));
    }
  });

  it('fails closed for an unknown server capability', () => {
    expect(buildCurriculumToolbox(['arm.select', 'course2.ai'])).toEqual({ ok: false, unknownIds: ['course2.ai'] });
  });

  it('reports disallowed saved blocks without rewriting the workspace', () => {
    const saved = { blocks: { blocks: [{ type: 'robot_start', next: { block: { type: 'robot_repeat', next: { block: { type: 'vision_ai_plan' } } } } }] } };
    const original = JSON.stringify(saved);
    expect(validateWorkspaceBlockTypes(saved, new Set(['robot_start', 'robot_wait']))).toEqual(['robot_repeat', 'vision_ai_plan']);
    expect(JSON.stringify(saved)).toBe(original);
  });
});
