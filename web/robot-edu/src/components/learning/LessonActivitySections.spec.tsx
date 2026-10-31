// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonActivitySections } from './LessonActivitySections';
import type { LessonDetailResponse } from '../../lib/api';

const lesson = { id: 'l2', course_id: 'c1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, content: { version: 1, summary: 'Move', learningObjectives: [], conceptSections: [], robotConcept: null, taskPreview: 'Reach target', estimatedMinutes: 20, safetyNotes: [], completionCriteria: 'Pass', lessonType: 'symbolic_program' }, objectives: [], status: 'current', progressPercent: 20, lockReason: null, prerequisites: [], qualification: null, assignment: { id: 'a', classroomAssignmentId: 'd', title: 'Reach the Target', instructions: 'Build it.', allowedBlocks: [], constraints: { kind: 'symbolic_program' }, challengeTitle: 'Reach the Target', challengeDescription: 'Move.' }, activeAttempt: null, priorAttempt: null, created_at: '' } as LessonDetailResponse;

describe('LessonActivitySections', () => {
  it('renders ordered expandable activities without fake completion', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<LessonActivitySections lesson={lesson} />); });
    expect(container.textContent).toContain('Guided Practice');
    expect(container.textContent).toContain('3D Simulation');
    expect(container.textContent).not.toContain('Completed');
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
