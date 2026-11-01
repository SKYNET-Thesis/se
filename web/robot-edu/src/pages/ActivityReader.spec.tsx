// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityReader } from './ActivityReader';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({ useQuery: () => mocks.query() }));
vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({ session: { access_token: 'token', user: { id: 'student' } }, sessionRevision: 1 }),
}));
vi.mock('../components/learning/CourseLearningShell', () => ({
  CourseLearningShell: ({ children }: { children: React.ReactNode }) => <div data-testid="learning-shell">{children}</div>,
}));

describe('ActivityReader loading isolation', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.query.mockReturnValue({
      isLoading: false,
      data: {
        id: 'lesson-old',
        course_id: 'course-1',
        course_title: 'Robotics Fundamentals',
        title: 'Old lesson must not flash',
        ordinal: 1,
        status: 'current',
        progressPercent: 0,
        lockReason: null,
        prerequisites: [],
        content: { version: 1, summary: 'Old summary', learningObjectives: [], conceptSections: [], robotConcept: '', taskPreview: '', estimatedMinutes: 10, safetyNotes: [], completionCriteria: '' },
        assignment: null,
        activeAttempt: null,
        priorAttempt: null,
        created_at: '',
      },
    });
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('shows loading instead of rendering a previous lesson payload for a new activity route', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-new/activities/lesson-new-reading-1']}><Routes><Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} /></Routes></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Loading activity');
    expect(container.textContent).not.toContain('Old lesson must not flash');
  });
});
