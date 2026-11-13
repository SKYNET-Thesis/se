import { describe, expect, it } from 'vitest';
import { validateAssignmentForm } from './TeacherAssignmentEditor';

describe('validateAssignmentForm', () => {
  const valid = { classroomId: 'c', lessonId: 'l', challengeId: '', title: 'Gripper', instructions: '' };
  it('accepts a complete form (challenge and instructions are optional)', () => expect(validateAssignmentForm(valid)).toEqual({}));
  it('requires classroom, lesson and a non-blank title', () => {
    expect(Object.keys(validateAssignmentForm({ ...valid, classroomId: '', lessonId: '', title: '   ' })).sort()).toEqual(['classroomId', 'lessonId', 'title']);
  });
  it('rejects a title above 200 characters', () => expect(validateAssignmentForm({ ...valid, title: 'x'.repeat(201) }).title).toMatch(/200/));
});
