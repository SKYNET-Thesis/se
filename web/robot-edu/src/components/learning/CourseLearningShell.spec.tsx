// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseLearningShell } from './CourseLearningShell';
import type { LessonDetailResponse } from '../../lib/api';

const mocks = vi.hoisted(() => ({ path: vi.fn(), session: { session: { access_token: 'token', user: { id: 'student' } }, loading: false, sessionRevision: 1 } }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.session }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, progressionApi: { ...actual.progressionApi, coursePath: mocks.path } };
});

const lesson = { id: 'lesson-2', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, content: { version: 1, summary: 'Movement', learningObjectives: [], conceptSections: [{ title: 'Movement', content: 'Move safely.' }], robotConcept: 'Motion', taskPreview: 'Reach target', estimatedMinutes: 20, safetyNotes: [], completionCriteria: 'Pass', lessonType: 'symbolic_program' }, objectives: [], status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], qualification: null, assignment: { id: 'a2', classroomAssignmentId: 'd2', title: 'Reach the Target', instructions: 'Build a sequence.', allowedBlocks: [], constraints: { kind: 'symbolic_program' }, challengeTitle: 'Reach the Target', challengeDescription: 'Move to target.' }, activeAttempt: null, priorAttempt: null, created_at: '2026-10-31T00:00:00Z' } as LessonDetailResponse;

describe('CourseLearningShell', () => {
  let root: Root; let container: HTMLDivElement; let client: QueryClient;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.path.mockResolvedValue({ course: { id: 'course-1', title: 'Robotics Fundamentals' }, progressPercent: 0, currentLessonId: 'lesson-2', lessons: [1, 2, 3, 4, 5].map((ordinal) => ({ id: `lesson-${ordinal}`, code: `C1-L${ordinal}`, ordinal, title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1], status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked', progressPercent: ordinal === 1 ? 100 : 0, prerequisite: [], lockReason: ordinal > 2 ? { message: 'Complete the previous lesson.' } : null, completedAt: null })) });
  });
  afterEach(() => { act(() => root.unmount()); client.clear(); container.remove(); });

  it('renders five authoritative lesson entries and accessible mobile material control', async () => {
    const pathOverride = { lessons: [1, 2, 3, 4, 5].map((ordinal) => ({ id: `lesson-${ordinal}`, code: `C1-L${ordinal}`, ordinal, title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1], status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked', progressPercent: ordinal === 1 ? 100 : 0, prerequisite: [], lockReason: ordinal > 2 ? { message: 'Complete the previous lesson.' } : null, completedAt: null })) as never };
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson} pathOverride={pathOverride}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>); await Promise.resolve(); });
    expect(mocks.path).toHaveBeenCalled();
    expect(container.textContent).toContain('Meet Your Robot');
    expect(container.querySelector('[aria-label="Course lessons"]')?.children.length).toBe(5);
    const menu = container.querySelector('button[aria-controls="course-material-nav"]');
    expect(menu?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Lesson content');
    expect(container.textContent).not.toContain('Learning activities');
    expect(container.querySelector('.lg\\:w-72')).not.toBeNull();
    expect(container.querySelector('a[href="/courses/course-1/lessons/lesson-3"]')).toBeNull();
  });

  it('collapses and restores the focused navigator without changing the selected activity', async () => {
    const pathOverride = { lessons: [] as never };
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson} pathOverride={pathOverride} focused activityId="lesson-2-reading-1"><div data-testid="activity-content">Activity content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>); await Promise.resolve(); });
    const toggle = container.querySelector('button[aria-label="Hide course material"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { toggle.click(); });
    expect(container.querySelector('button[aria-label="Show course material"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="activity-content"]')).not.toBeNull();
    await act(async () => { (container.querySelector('button[aria-label="Show course material"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('button[aria-label="Hide course material"]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('expands individual course modules independently and supports expand/collapse all', async () => {
    const pathOverride = {
      lessons: [1, 2, 3, 4, 5].map((ordinal) => ({
        id: `lesson-${ordinal}`,
        code: `C1-L${ordinal}`,
        ordinal,
        title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1],
        status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked',
        progressPercent: ordinal === 1 ? 100 : 0,
        prerequisite: [],
        lockReason: ordinal > 2 ? { message: 'Complete the previous lesson.' } : null,
        completedAt: null,
        learningItems: [`Authoritative learning item ${ordinal}`],
        estimatedMinutes: ordinal * 5,
      })) as never,
    };
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson} pathOverride={pathOverride} focused activityId="lesson-2-reading-1"><div>Activity content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>); await Promise.resolve(); });

    const l1 = container.querySelector('button[aria-label="Expand C1-L1"]') as HTMLButtonElement;
    const l2 = container.querySelector('button[aria-label="Collapse C1-L2"]') as HTMLButtonElement;
    expect(l1).toBeTruthy();
    expect(l2).toBeTruthy();
    await act(async () => { l1.click(); });
    expect(l1.getAttribute('aria-expanded')).toBe('true');
    expect(l2.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Authoritative learning item 1');

    await act(async () => { (container.querySelector('button[aria-label="Expand all modules"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('button[aria-label^="Collapse C1-L"]')).toHaveLength(5);

    await act(async () => { (container.querySelector('button[aria-label="Collapse all modules"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('button[aria-label^="Expand C1-L"]')).toHaveLength(5);
  });
});
