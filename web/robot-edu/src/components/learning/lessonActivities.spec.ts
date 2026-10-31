import { describe, expect, it } from 'vitest';
import { buildLessonActivities } from './lessonActivities';
import type { LessonDetailResponse } from '../../lib/api';

function lesson(overrides: Partial<LessonDetailResponse> = {}): LessonDetailResponse {
  return {
    id: 'lesson-1', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Meet Your Robot', ordinal: 1,
    content: {
      version: 1, summary: 'Safety foundations', learningObjectives: ['Understand the robot'], conceptSections: [{ title: 'Robot anatomy', content: 'Learn the parts.' }],
      robotConcept: 'A robot uses joints.', taskPreview: 'Complete the knowledge check.', estimatedMinutes: 15, safetyNotes: [], completionCriteria: 'Pass the check.', lessonType: 'knowledge_check',
    }, objectives: [], status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], qualification: null,
    assignment: { id: 'assignment-1', classroomAssignmentId: 'delivery-1', title: 'Safety Knowledge Check', instructions: 'Answer every question.', allowedBlocks: [], constraints: { kind: 'knowledge_check', questions: [] }, challengeTitle: null, challengeDescription: null },
    activeAttempt: null, priorAttempt: null, created_at: '2026-10-31T00:00:00Z', ...overrides,
  };
}

describe('lesson activity model', () => {
  it('maps L1 reading and authoritative knowledge check in order', () => {
    const activities = buildLessonActivities(lesson());
    expect(activities.map((item) => item.type)).toEqual(['reading', 'demonstration', 'reading', 'knowledge_check']);
    expect(activities.at(-1)).toMatchObject({ title: 'Safety Knowledge Check', authoritative: true, action: 'knowledge_check' });
  });

  it('maps L2-L4 practice activities to the existing assignment flow', () => {
    const activities = buildLessonActivities(lesson({ ordinal: 2, title: 'Move the Robot', assignment: { id: 'a2', classroomAssignmentId: 'd2', title: 'Reach the Target', instructions: 'Build it.', allowedBlocks: [], constraints: { kind: 'symbolic_program' }, challengeTitle: 'Reach the Target', challengeDescription: 'Move to target.' } }));
    expect(activities.map((item) => item.type)).toEqual(['reading', 'demonstration', 'guided_practice', 'simulation', 'result']);
    expect(activities.find((item) => item.type === 'simulation')).toMatchObject({ action: 'practice', authoritative: true });
  });

  it('marks physical L5 execution honest and unavailable', () => {
    const activities = buildLessonActivities(lesson({ ordinal: 5, title: 'Physical Robot Lab', assignment: { id: 'a5', classroomAssignmentId: 'd5', title: 'Physical Lab', instructions: 'Run safely.', allowedBlocks: [], constraints: { kind: 'physical_lab' }, challengeTitle: null, challengeDescription: null } }));
    const physical = activities.find((item) => item.type === 'physical_lab');
    expect(physical).toMatchObject({ status: 'unavailable', actionable: false });
    expect(physical?.description).toContain('runtime is authorized and ready');
  });
});
