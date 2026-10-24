import { describe, expect, it } from 'vitest';
import { canPublishAssignment, createDraftBody, teacherLearningInvalidations, teacherLearningKeys, teacherReviewInvalidations } from './teacherLearningQueries';

describe('Teacher learning query scoping', () => {
  it('scopes classroom reads by classroom id', () => {
    expect(teacherLearningKeys.assignments('class-a')).not.toEqual(teacherLearningKeys.assignments('class-b'));
    expect(teacherLearningKeys.deliveryOptions('class-a')).not.toEqual(teacherLearningKeys.deliveryOptions('class-b'));
  });

  it('invalidates only the selected classroom assignment family after create or publish', () => {
    expect(teacherLearningInvalidations('class-a')).toEqual([teacherLearningKeys.assignments('class-a')]);
  });
  it('scopes submission detail and invalidates only its review plus classroom list',()=>{expect(teacherLearningKeys.submission('submission-a')).not.toEqual(teacherLearningKeys.submission('submission-b'));expect(teacherReviewInvalidations('class-a','submission-a')).toEqual([teacherLearningKeys.submission('submission-a'),teacherLearningKeys.submissions('class-a')]);});
});

describe('Teacher assignment draft UI contract', () => {
  it('builds the create-draft payload from explicit teacher input', () => {
    expect(createDraftBody({ lessonId: 'lesson-1', challengeId: '', title: '  Gripper draft  ', instructions: '  Build it.  ' }))
      .toEqual({ lessonId: 'lesson-1', title: 'Gripper draft', instructions: 'Build it.' });
    expect(createDraftBody({ lessonId: 'lesson-1', challengeId: 'challenge-1', title: 'Draft', instructions: '' }))
      .toEqual({ lessonId: 'lesson-1', challengeId: 'challenge-1', title: 'Draft', instructions: '' });
  });

  it('offers publish only for draft assignments', () => {
    expect(canPublishAssignment('draft')).toBe(true);
    expect(canPublishAssignment('published')).toBe(false);
    expect(canPublishAssignment('closed')).toBe(false);
    expect(canPublishAssignment('archived')).toBe(false);
  });
});
