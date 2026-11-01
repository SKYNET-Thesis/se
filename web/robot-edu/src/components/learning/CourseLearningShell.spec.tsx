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
    expect(container.textContent).not.toContain('Authoritative learning item 1');

    await act(async () => { (container.querySelector('button[aria-label="Expand all modules"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('button[aria-label^="Collapse C1-L"]')).toHaveLength(5);

    await act(async () => { (container.querySelector('button[aria-label="Collapse all modules"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('button[aria-label^="Expand C1-L"]')).toHaveLength(5);
  });

  it('renders Course Material strictly as navigation without descriptive paragraphs', async () => {
    const pathOverride = {
      lessons: [
        {
          id: 'lesson-2',
          code: 'C1-L2',
          ordinal: 2,
          title: 'Move the Robot',
          status: 'current',
          progressPercent: 0,
          prerequisite: [],
          lockReason: null,
          completedAt: null,
          learningItems: [
            'Use home, target motion, wait, and sequence blocks in order.',
            'Understand how the robot plans motion to reach a 3D target position.',
            'Observe preview simulation to verify the robot trajectory before execution.',
          ],
          estimatedMinutes: 20,
        },
        {
          id: 'lesson-3',
          code: 'C1-L3',
          ordinal: 3,
          title: 'Grab & Release',
          status: 'locked',
          progressPercent: 0,
          prerequisite: [],
          lockReason: { message: 'Complete Move the Robot first.' },
          completedAt: null,
          learningItems: ['Operate gripper.'],
          estimatedMinutes: 15,
        },
      ] as never,
    };

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <CourseLearningShell
              courseId="course-1"
              lessonId="lesson-2"
              lesson={lesson}
              pathOverride={pathOverride}
              activityId="lesson-2-reading-1"
            >
              <div>Activity workspace</div>
            </CourseLearningShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    // 1. Navigation structure present
    expect(container.textContent).toContain('Movement Fundamentals');
    expect(container.textContent).toContain('Understanding Robot Movement');
    expect(container.textContent).toContain('Reading • 4 min');
    expect(container.textContent).toContain('Robot Concept in Action');
    expect(container.textContent).toContain('Demonstration • 3 min');
    expect(container.textContent).toContain('Practice');
    expect(container.textContent).toContain('Build Your Move the Robot Sequence');
    expect(container.textContent).toContain('Reach Target A');
    expect(container.textContent).toContain('Simulation Feedback');

    // 2. Explanatory paragraphs and estimated lesson description paragraphs removed
    expect(container.textContent).not.toContain('Use home, target motion, wait, and sequence blocks in order.');
    expect(container.textContent).not.toContain('Understand how the robot plans motion to reach a 3D target position.');
    expect(container.textContent).not.toContain('Observe preview simulation to verify the robot trajectory before execution.');
    expect(container.textContent).not.toContain('Estimated 20 min');

    // 3. Selected activity receives aria-current="page"
    const selectedLink = container.querySelector('a[aria-current="page"]');
    expect(selectedLink).not.toBeNull();
    expect(selectedLink?.getAttribute('href')).toContain('lesson-2-reading-1');
    expect(selectedLink?.className).toContain('border-accent');
    expect(selectedLink?.className).toContain('bg-accent-soft');

    // 4. Hover & focus classes exist on interactive items
    expect(selectedLink?.className).toContain('focus-visible:ring-accent');
    const courseInfoLink = container.querySelector('a[href="/courses/course-1/info"]');
    expect(courseInfoLink?.className).toContain('hover:bg-sunken');
    expect(courseInfoLink?.className).toContain('transition-colors');

    // 5. Locked lesson remains non-navigable with lock reason
    expect(container.querySelector('a[href="/courses/course-1/lessons/lesson-3"]')).toBeNull();
    const l3Toggle = container.querySelector('button[aria-label="Expand C1-L3"]') as HTMLButtonElement;
    await act(async () => {
      l3Toggle?.click();
    });
    expect(container.textContent).toContain('Complete Move the Robot first.');
  });
});
