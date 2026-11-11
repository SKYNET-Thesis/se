import { describe, expect, it } from 'vitest';
import { LESSON_ONE_RULES } from '../home/content/lessonOne';
import { toCanonicalNestRobotProgram } from '../../utils/robotProgram/toCanonicalNest';
import { BLOCKS, checkRules, LESSON_ONE_PROGRAM, simulate } from './lessonProgram';

describe('home lab lesson model', () => {
  it('uses the same rule names as the Homepage and the seeded lesson', () => {
    expect(checkRules(LESSON_ONE_PROGRAM).map((r) => r.rule)).toEqual([...LESSON_ONE_RULES]);
  });

  it('passes lesson one and keeps the gripper open until the last block', () => {
    expect(checkRules(LESSON_ONE_PROGRAM).every((r) => r.passed)).toBe(true);
    expect(simulate(LESSON_ONE_PROGRAM).map((s) => s.jaw)).toEqual(['open', 'open', 'open', 'closed']);
    expect(simulate(LESSON_ONE_PROGRAM)[1].note).toContain('already open');
  });

  it('fails the rules that a broken program breaks', () => {
    expect(checkRules(['open', 'close']).map((r) => r.passed)).toEqual([false, true, false]);
    expect(checkRules(['select', 'close', 'open']).map((r) => r.passed)).toEqual([true, false, false]);
  });

  it('shows the same canonical steps the app compiles for these blocks', () => {
    const compiled = toCanonicalNestRobotProgram({
      kind: 'robot_program', schemaVersion: 1,
      commands: [
        { op: 'arm_select', blockId: 'a', arm: 'left' },
        { op: 'gripper', blockId: 'b', arm: 'left', action: 'open' },
        { op: 'wait', blockId: 'c', seconds: 1 },
        { op: 'gripper', blockId: 'd', arm: 'left', action: 'close' },
      ],
    } as never);
    expect(compiled).toMatchObject({ ok: true, program: { steps: LESSON_ONE_PROGRAM.map((kind) => BLOCKS[kind].step) } });
  });
});
