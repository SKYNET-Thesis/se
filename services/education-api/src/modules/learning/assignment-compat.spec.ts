import { BadRequestException } from '@nestjs/common';
import { assertAssignmentMatchesActivityType, assignmentKind, PROGRAMMING_BLOCKS, validProgrammingAssignment } from './assignment-compat';
import { SYMBOLIC_ACTIONS } from './symbolic-rules/symbolic-rule-compiler.service';

const quiz = { kind: 'knowledge_check', passPercent: 80 };
const program = { kind: 'symbolic_program' };

describe('assignment/activity type compatibility', () => {
  it('requires a quiz assignment for knowledge_check', () => {
    expect(() => assertAssignmentMatchesActivityType('knowledge_check', quiz)).not.toThrow();
    for (const bad of [program, {}, null, undefined, [], { kind: 'physical_lab' }]) expect(() => assertAssignmentMatchesActivityType('knowledge_check', bad)).toThrow(BadRequestException);
  });
  it('rejects quiz and physical-lab assignments for the symbolic-program activity types', () => {
    for (const type of ['guided_practice', 'simulation', 'challenge']) {
      expect(() => assertAssignmentMatchesActivityType(type, program)).not.toThrow();
      expect(() => assertAssignmentMatchesActivityType(type, {})).not.toThrow(); // teacher-created assignments have no kind
      expect(() => assertAssignmentMatchesActivityType(type, quiz)).toThrow(BadRequestException);
      expect(() => assertAssignmentMatchesActivityType(type, { kind: 'physical_lab' })).toThrow(BadRequestException);
    }
  });
  it('does not constrain other activity types', () => {
    for (const type of ['reading', 'video', 'demonstration', 'physical_lab', 'result', 'reflection']) expect(() => assertAssignmentMatchesActivityType(type, quiz)).not.toThrow();
  });
  it('reads the kind defensively', () => {
    expect(assignmentKind(quiz)).toBe('knowledge_check');
    expect(assignmentKind('x')).toBeNull();
    expect(assignmentKind({ kind: 3 })).toBeNull();
  });
});

describe('validProgrammingAssignment', () => {
  const ok = { title: ' Reach Target A ', instructions: ' text ', allowedBlocks: ['home', 'wait'] };
  it('trims and accepts a valid configuration; challenge is not part of it', () => {
    expect(validProgrammingAssignment(ok)).toEqual({ title: 'Reach Target A', instructions: 'text', allowedBlocks: ['home', 'wait'] });
    expect(validProgrammingAssignment({ ...ok, instructions: '' }).instructions).toBe('');
  });
  it.each([
    ['blank title', { title: '  ' }], ['long title', { title: 'x'.repeat(201) }], ['no blocks', { allowedBlocks: [] }],
    ['duplicate blocks', { allowedBlocks: ['home', 'home'] }], ['unsupported block', { allowedBlocks: ['course2.ai'] }],
    ['long instructions', { instructions: 'x'.repeat(10_001) }], ['non-array blocks', { allowedBlocks: 'home' as never }],
  ])('rejects %s', (_name, patch) => { expect(() => validProgrammingAssignment({ ...ok, ...patch })).toThrow(BadRequestException); });
});

describe('programming block allowlist', () => {
  it('is exactly the runtime symbolic action registry, so no unsupported Blockly operation can be authored', () => {
    expect([...PROGRAMMING_BLOCKS].sort()).toEqual([...SYMBOLIC_ACTIONS].sort());
    expect([...PROGRAMMING_BLOCKS].sort()).toEqual(['arm.select', 'gripper.close', 'gripper.open', 'home', 'preview.move_xyz', 'wait']);
    for (const block of PROGRAMMING_BLOCKS) expect(validProgrammingAssignment({ title: 't', instructions: '', allowedBlocks: [block] }).allowedBlocks).toEqual([block]);
  });
});
