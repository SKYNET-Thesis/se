// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LessonActivitySections } from './LessonActivitySections';
import type { LessonDetailResponse } from '../../lib/api';

const progress = vi.hoisted(() => ({ data: { courseId: 'c1', activities: [] as Array<{ activityId: string; status: 'completed' | 'not_started'; completedAt: string | null }> } }));
vi.mock('./useActivityProgress', () => ({ useActivityProgress: () => ({ data: progress.data, isPending: false, isError: false, refetch: vi.fn() }) }));

const lesson = { id: 'l2', course_id: 'c1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, content: { version: 1, summary: 'Move', learningObjectives: [], conceptSections: [], robotConcept: 'Robot motion', taskPreview: 'Reach target', estimatedMinutes: 20, safetyNotes: [], completionCriteria: 'Pass', lessonType: 'symbolic_program' }, objectives: [], status: 'current', progressPercent: 20, lockReason: null, prerequisites: [], qualification: null, assignment: { id: 'a', classroomAssignmentId: 'd', title: 'Reach the Target', instructions: 'Build it.', allowedBlocks: [], constraints: { kind: 'symbolic_program' }, challengeTitle: 'Reach the Target', challengeDescription: 'Move.' }, activeAttempt: null, priorAttempt: null, created_at: '' } as LessonDetailResponse;

describe('LessonActivitySections', () => {
  it('renders ordered expandable activities without fake completion', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<MemoryRouter><LessonActivitySections lesson={lesson} /></MemoryRouter>); });
    expect(container.textContent).toContain('Guided Practice');
    expect(container.textContent).toContain('3D Simulation');
    expect(container.textContent).not.toContain('Completed');
    expect(container.querySelectorAll('[data-completion="completed"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-completion="incomplete"]')).toHaveLength(5);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
