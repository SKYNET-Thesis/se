// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonViewer } from './LessonViewer';
import type { LessonDetailResponse } from '../lib/api';

const mocks = vi.hoisted(() => ({ session: { access_token: 'token', user: { id: 'student' } }, lessonDetail: vi.fn(), coursePath: vi.fn(), completeActivity: vi.fn(), activityProgress: vi.fn() }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: mocks.session, loading: false, sessionRevision: 0 }) }));
vi.mock('../lib/api', async (original) => { const actual = await original<typeof import('../lib/api')>(); return { ...actual, catalogApi: { ...actual.catalogApi, lessonDetail: (...args: unknown[]) => mocks.lessonDetail(...args) }, progressionApi: { ...actual.progressionApi, coursePath: (...args: unknown[]) => mocks.coursePath(...args), completeActivity: (...args: unknown[]) => mocks.completeActivity(...args), activityProgress: (...args: unknown[]) => mocks.activityProgress(...args) } }; });

const lesson: LessonDetailResponse = { id: 'lesson-2', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], objectives: [], created_at: '', activeAttempt: null, priorAttempt: null, qualification: null, content: { version: 1, summary: 'Learn deterministic motion sequencing.', learningObjectives: [], conceptSections: [{ title: 'Deterministic Sequencing', content: 'Robots execute one step at a time.' }], robotConcept: 'The robot interprets a target in its workspace.', taskPreview: 'Program the left arm to home, move to Target A, and wait.', estimatedMinutes: 20, safetyNotes: ['Keep the workspace clear.'], completionCriteria: 'Complete the target-position simulation.' }, assignment: { id: 'a2', classroomAssignmentId: 'ca2', title: 'Reach Target A', instructions: 'Build a safe sequence.', allowedBlocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'], constraints: { kind: 'symbolic_program' } } };

describe('LessonViewer activity-map boundary', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.lessonDetail.mockResolvedValue(lesson); mocks.coursePath.mockRejectedValue(new Error('path not mocked')); mocks.activityProgress.mockRejectedValue(new Error('progress not mocked')); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
  async function render() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2']}><Routes><Route path="/courses/:courseId/lessons/:lessonId" element={<LessonViewer />} /></Routes></MemoryRouter></QueryClientProvider>); }); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
  it('renders an activity map rather than the instructional article', async () => {
    await render();
    expect(container.textContent).toContain('Learning activities');
    expect(container.textContent).not.toContain('C1-L2');
    expect(container.textContent).toContain('Movement Fundamentals');
    expect(container.textContent).toContain('Understanding Robot Movement');
    expect(container.textContent).toContain('Reading • 4 min');
    expect(container.textContent).toContain('Robot Concept in Action');
    expect(container.textContent).toContain('Demonstration • 3 min');
    expect(container.textContent).toContain('Practice');
    expect(container.textContent).toContain('Build Your Move the Robot Sequence');
    expect(container.textContent).toContain('Reach Target A');
    expect(container.textContent).toContain('Simulation Feedback');

    // Instructional content must NOT be dumped into overview
    expect(container.textContent).not.toContain('Learn the Concepts');
    expect(container.textContent).not.toContain('Safety Protocols');
    expect(container.textContent).not.toContain('Your Practice Mission');
    expect(container.textContent).not.toContain('Deterministic Sequencing');
    expect(container.textContent).not.toContain('Target Positioning');

    // Activity links point to focused activity workspace
    const readingLink = container.querySelector('a[href*="/activities/lesson-2-reading-1"]');
    expect(readingLink).not.toBeNull();
  });

  it('does not render Practice Quiz questions on the module overview', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...lesson,
      id: 'lesson-1',
      ordinal: 1,
      title: 'Meet Your Robot',
      assignment: {
        id: 'a1',
        classroomAssignmentId: 'ca1',
        title: 'Safety Knowledge Check',
        instructions: 'Check your knowledge before operating the robot.',
        allowedBlocks: [],
        constraints: {
          kind: 'knowledge_check',
          questions: [
            { id: 'q1', prompt: 'Which command homes the robot?', options: ['home', 'stop', 'power'] },
          ],
        },
      },
    });
    await render();
    expect(container.textContent).toContain('Safety Knowledge Check');
    expect(container.textContent).toContain('Practice Quiz • 8 min');
    // Quiz questions must not be rendered on the overview
    expect(container.textContent).not.toContain('Which command homes the robot?');
    expect(container.textContent).not.toContain('Question 1 of 1');
  });

  it('keeps locked lessons non-navigable with their server reason', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...lesson,
      status: 'locked',
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED',
        prerequisiteLessonId: 'l1',
        prerequisiteLessonTitle: 'Meet Your Robot',
        message: 'Complete Meet Your Robot first.',
      },
    });
    await render();
    expect(container.textContent).toContain('Complete Meet Your Robot first.');
    expect(container.querySelectorAll('a').length).toBeGreaterThan(0);
  });
});

describe('Lesson player navigation and access (A05)', () => {
  let root: Root; let container: HTMLDivElement;
  const pathLesson = (id: string, ordinal: number, title: string, status: string, lockReason: unknown = null) => ({ id, ordinal, title, status, code: null, progressPercent: status === 'completed' ? 100 : 0, prerequisite: [], lockReason, completedAt: null, summary: null, learningItems: [], estimatedMinutes: null });
  const unlockReason = { code: 'PREREQUISITE_NOT_COMPLETED', prerequisiteLessonId: 'lesson-2', prerequisiteLessonTitle: 'Move the Robot', message: 'Complete Move the Robot before starting Grab & Release.' };
  const coursePath = { course: { id: 'course-1', title: 'Robotics Fundamentals', status: 'published', description: null, label: null, level: null, recommendedGrades: null, learningOutcome: null, competencies: [] }, progressPercent: 33, currentLessonId: 'lesson-2',
    lessons: [pathLesson('lesson-1', 1, 'Meet Your Robot', 'completed'), pathLesson('lesson-2', 2, 'Move the Robot', 'current'), pathLesson('lesson-3', 3, 'Grab & Release', 'locked', unlockReason)] };
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.lessonDetail.mockResolvedValue(lesson); mocks.coursePath.mockResolvedValue(coursePath); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
  async function open(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/courses/:courseId/lessons/:lessonId" element={<LessonViewer />} /><Route path="/courses/:courseId" element={<p>Course page</p>} /></Routes></MemoryRouter></QueryClientProvider>); });
    for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  const hrefs = () => [...container.querySelectorAll('nav[aria-label="Lessons"] a')].map((a) => a.getAttribute('href'));

  it('shows where the student is and moves between lessons in server order without completing anything', async () => {
    await open('/courses/course-1/lessons/lesson-2');
    expect(container.textContent).toContain('Lesson 2 of 3');
    expect(hrefs()).toEqual(['/courses/course-1/lessons/lesson-1']); // the locked next lesson is not a link
    const pager = container.querySelector('nav[aria-label="Lessons"]')?.textContent ?? '';
    expect(pager).toContain('Previous lessonMeet Your Robot'); expect(pager).toContain('Next lesson, locked');
    expect(pager).toContain('Complete Move the Robot before starting Grab & Release.');
    expect(mocks.completeActivity).not.toHaveBeenCalled();
  });

  it('leads with the next activity the server has not recorded as completed', async () => {
    mocks.activityProgress.mockResolvedValue({ courseId: 'course-1', activities: [{ activityId: 'lesson-2-reading-1', status: 'completed', completedAt: '2026-11-01T00:00:00Z' }] });
    await open('/courses/course-1/lessons/lesson-2');
    const card = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Up next')?.parentElement;
    expect(card?.textContent).toContain('Robot Concept in Action');
    expect(card?.querySelector('a')?.getAttribute('href')).toBe('/courses/course-1/lessons/lesson-2/activities/lesson-2-demonstration');
    expect(container.textContent).toMatch(/1 of \d+ done/);
    const crumbs = [...container.querySelectorAll('nav[aria-label="Breadcrumb"] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(crumbs).toEqual([['My learning', '/my-learning'], ['Robotics Fundamentals', '/courses/course-1']]);
    expect(mocks.completeActivity).not.toHaveBeenCalled();
  });

  it('explains a lesson the server refuses as locked and links to the lesson that unlocks it', async () => {
    const { ApiError } = await import('../lib/api');
    mocks.lessonDetail.mockRejectedValue(new ApiError(409, unlockReason.message));
    await open('/courses/course-1/lessons/lesson-3');
    expect(container.querySelector('h1')?.textContent).toBe('Grab & Release');
    expect(container.textContent).toContain('This lesson is locked');
    expect(container.textContent).toContain(unlockReason.message);
    const unlock = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Go to Move the Robot');
    expect(unlock?.getAttribute('href')).toBe('/courses/course-1/lessons/lesson-2');
    expect(container.textContent).not.toContain('Lesson unavailable');
  });

  it('says a lesson is unavailable without offering a retry that cannot help', async () => {
    const { ApiError } = await import('../lib/api');
    mocks.lessonDetail.mockRejectedValue(new ApiError(404, 'Lesson was not found in the authoritative course path.'));
    await open('/courses/course-1/lessons/gone');
    expect(container.textContent).toContain('This lesson isn’t available to you.');
    expect(container.textContent).not.toContain('authoritative');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Try again'))).toBe(false);
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/courses/course-1')).toBe(true);
  });
});
