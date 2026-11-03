import { describe, expect, it } from 'vitest';
import {
  canPublishAssignment,
  createDraftBody,
  createUpdateBody,
  deliveryCourseTitle,
  draftForDeliveryOption,
  assignmentStatusLabel,
  flattenTeacherAssignments,
  teacherLearningInvalidations,
  teacherLearningKeys,
  teacherReviewInvalidations,
  teacherAssignmentEditPath,
} from './teacherLearningQueries';

describe('Teacher learning query scoping', () => {
  it('scopes classroom reads by classroom id', () => {
    expect(teacherLearningKeys.teachingClassrooms).toEqual(['teacher-learning', 'teaching-classrooms']);
    expect(teacherLearningKeys.assignments('class-a')).not.toEqual(teacherLearningKeys.assignments('class-b'));
    expect(teacherLearningKeys.deliveryOptions('class-a')).not.toEqual(teacherLearningKeys.deliveryOptions('class-b'));
  });

  it('combines server assignments with their authoritative classroom identity', () => {
    expect(flattenTeacherAssignments([
      {
        classroom: { id: 'class-a', name: 'Robotics A' },
        assignments: [{ id: 'delivery-a', assignment_id: 'assignment-a', title: 'Gripper', status: 'draft' }],
      },
      {
        classroom: { id: 'class-b', name: 'Robotics B' },
        assignments: [{ id: 'delivery-b', assignment_id: 'assignment-b', title: 'Reach', status: 'published' }],
      },
    ])).toEqual([
      expect.objectContaining({ id: 'delivery-a', classroomId: 'class-a', classroomName: 'Robotics A' }),
      expect.objectContaining({ id: 'delivery-b', classroomId: 'class-b', classroomName: 'Robotics B' }),
    ]);
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

  it('limits assignment edits to fields supported by the backend contract', () => {
    expect(createUpdateBody('  Updated title  ', '  Updated instructions  ')).toEqual({
      title: 'Updated title',
      instructions: 'Updated instructions',
    });
  });

  it('shows the backend course as soon as a classroom delivery option is loaded', () => {
    expect(deliveryCourseTitle([{ course_title: 'Robotics Foundations' }])).toBe('Robotics Foundations');
    expect(deliveryCourseTitle([])).toBe('');
  });

  it('keeps classroom identity in the canonical edit URL', () => {
    expect(teacherAssignmentEditPath('class-a', 'assignment-a')).toBe('/teacher/assignments/class-a/assignment-a/edit');
  });

  it('renders authoritative terminal delivery states instead of calling them drafts', () => {
    expect(assignmentStatusLabel('draft')).toBe('Draft');
    expect(assignmentStatusLabel('published')).toBe('Published');
    expect(assignmentStatusLabel('closed')).toBe('Closed');
    expect(assignmentStatusLabel('archived')).toBe('Archived');
  });

  it('replaces lesson-dependent content when the teacher switches backend lessons', () => {
    expect(draftForDeliveryOption({ lesson_id: 'lesson-b', title: 'Lesson B task', instructions: 'Use B.' })).toEqual({
      lessonId: 'lesson-b', challengeId: '', title: 'Lesson B task', instructions: 'Use B.',
    });
    expect(draftForDeliveryOption(undefined)).toEqual({ lessonId: '', challengeId: '', title: '', instructions: '' });
  });
});
