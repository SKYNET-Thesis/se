// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseLearningShell } from './CourseLearningShell';
import { ActivityReader } from '../../pages/ActivityReader';
import { resetSessionExpandedState } from './CourseLearningState';
import type { LessonDetailResponse } from '../../lib/api';

const mocks = vi.hoisted(() => ({ path: vi.fn(), progress: vi.fn(), complete: vi.fn(), lessonDetail: vi.fn(), rows: [] as Array<{ activityId: string; status: 'completed' | 'not_started'; completedAt: string | null }>, session: { session: { access_token: 'token', user: { id: 'student' } }, loading: false, sessionRevision: 1 } }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.session }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, progressionApi: { ...actual.progressionApi, coursePath: mocks.path, activityProgress: mocks.progress, completeActivity: mocks.complete }, catalogApi: { ...actual.catalogApi, lessonDetail: mocks.lessonDetail } };
});

const lesson = { id: 'lesson-2', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, content: { version: 1, summary: 'Movement', learningObjectives: [], conceptSections: [{ title: 'Movement', content: 'Move safely.' }], robotConcept: 'Motion', taskPreview: 'Reach target', estimatedMinutes: 20, safetyNotes: [], completionCriteria: 'Pass', lessonType: 'symbolic_program' }, objectives: [], status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], qualification: null, assignment: { id: 'a2', classroomAssignmentId: 'd2', title: 'Reach the Target', instructions: 'Build a sequence.', allowedBlocks: [], constraints: { kind: 'symbolic_program' }, challengeTitle: 'Reach the Target', challengeDescription: 'Move to target.' }, activeAttempt: null, priorAttempt: null, created_at: '2026-10-31T00:00:00Z' } as LessonDetailResponse;

describe('CourseLearningShell', () => {
  let root: Root; let container: HTMLDivElement; let client: QueryClient;
  beforeEach(() => {
    resetSessionExpandedState();
    mocks.session.session = { access_token: 'token', user: { id: 'student' } };
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.path.mockResolvedValue({ course: { id: 'course-1', title: 'Robotics Fundamentals' }, progressPercent: 0, currentLessonId: 'lesson-2', lessons: [1, 2, 3, 4, 5].map((ordinal) => ({ id: `lesson-${ordinal}`, code: `C1-L${ordinal}`, ordinal, title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1], status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked', progressPercent: ordinal === 1 ? 100 : 0, prerequisite: [], lockReason: ordinal > 2 ? { message: 'Complete the previous lesson.' } : null, completedAt: null })) });
    mocks.progress.mockReset().mockResolvedValue({ courseId: 'course-1', activities: [] });
    mocks.complete.mockReset();
    mocks.lessonDetail.mockReset().mockResolvedValue(lesson);
    mocks.rows = [];
  });
  afterEach(() => { act(() => root.unmount()); client.clear(); container.remove(); });

  it('renders five authoritative lesson entries and accessible mobile material control', async () => {
    const pathOverride = { lessons: [1, 2, 3, 4, 5].map((ordinal) => ({ id: `lesson-${ordinal}`, code: `C1-L${ordinal}`, ordinal, title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1], status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked', progressPercent: ordinal === 1 ? 100 : 0, prerequisite: [], lockReason: ordinal > 2 ? { message: 'Complete the previous lesson.' } : null, completedAt: null })) as never };
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson} pathOverride={pathOverride}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>); await Promise.resolve(); });
    expect(mocks.path).toHaveBeenCalled();
    expect(container.textContent).toContain('Meet Your Robot');
    expect(container.textContent).not.toMatch(/C1-L[1-5]/);
    expect(container.querySelectorAll('[data-completion="completed"]')).toHaveLength(0);
    expect(container.textContent).toContain('1 of 5 lessons completed');
    expect(container.querySelector('[aria-label="Course lessons"]')?.children.length).toBe(5);
    const menu = container.querySelector('button[aria-controls="course-material-nav"]');
    expect(menu?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Lesson content');
    expect(container.textContent).not.toContain('Learning activities');
    expect(container.querySelector('.lg\\:w-72')).not.toBeNull();
    expect(container.querySelector('a[href="/courses/course-1/lessons/lesson-3"]')).toBeNull();
  });

  it('renders only server-confirmed activity ticks, separately from lesson completion', async () => {
    mocks.progress.mockResolvedValue({
      courseId: 'course-1',
      activities: [{ activityId: 'lesson-2-reading-1', status: 'completed', completedAt: '2026-11-03T10:00:00Z' }],
    });
    await act(async () => {
      root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>);
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.progress).toHaveBeenCalledWith('course-1', 'token');
    expect(container.querySelector('[aria-label="Understanding Robot Movement: completed"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Robot Concept in Action: not completed"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-completion="completed"]')).toHaveLength(1);
  });

  it('loads persisted Reading completion after remount with a fresh query cache', async () => {
    mocks.progress.mockImplementation(async () => ({ courseId: 'course-1', activities: [...mocks.rows] }));
    mocks.complete.mockImplementation(async (activityId: string) => {
      const row = { activityId, status: 'completed' as const, completedAt: '2026-11-03T10:00:00Z' };
      mocks.rows = [row];
      return row;
    });
    const renderReader = async () => {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-reading-1']}>
              <Routes><Route path="/courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} /></Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        );
        await Promise.resolve();
      });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    };

    await renderReader();
    expect(container.querySelector('[aria-label="Understanding Robot Movement: not completed"]')).not.toBeNull();
    const markButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Mark as Completed');
    expect(markButton).toBeTruthy();
    await act(async () => { markButton?.click(); await Promise.resolve(); });
    expect(mocks.complete).toHaveBeenCalledWith('lesson-2-reading-1', 'token');
    expect(container.querySelector('[aria-label="Understanding Robot Movement: completed"]')).not.toBeNull();

    await act(async () => root.unmount());
    client.clear();
    container.replaceChildren();
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderReader();

    expect(mocks.progress.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[aria-label="Understanding Robot Movement: completed"]')).not.toBeNull();
    expect(container.textContent).toContain('✓ Activity completed');
  });

  it('does not remain in checking state when progress query is disabled without a session', async () => {
    mocks.session.session = null as never;
    await act(async () => {
      root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>);
      await Promise.resolve();
    });
    expect(mocks.progress).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Sign in to verify activity progress.');
    expect(container.textContent).not.toContain('Checking activity progress');
  });

  it('shows retry after an initial progress request error without a completed tick', async () => {
    mocks.progress.mockRejectedValue(new Error('network unavailable'));
    await act(async () => {
      root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>);
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('Activity progress could not be verified.');
    expect(container.querySelector('button')?.textContent).toBeTruthy();
    expect(container.querySelectorAll('[data-completion="completed"]')).toHaveLength(0);
  });

  it('retains a verified tick when refreshing progress fails', async () => {
    mocks.progress
      .mockResolvedValueOnce({ courseId: 'course-1', activities: [{ activityId: 'lesson-2-reading-1', status: 'completed', completedAt: '2026-11-03T10:00:00Z' }] })
      .mockRejectedValueOnce(new Error('network unavailable'));
    await act(async () => {
      root.render(<QueryClientProvider client={client}><MemoryRouter><CourseLearningShell courseId="course-1" lessonId="lesson-2" lesson={lesson}><div>Lesson content</div></CourseLearningShell></MemoryRouter></QueryClientProvider>);
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector('[aria-label="Understanding Robot Movement: completed"]')).not.toBeNull();
    await act(async () => { await client.refetchQueries({ queryKey: ['student-learning', 'activity-progress'] }); });
    expect(mocks.progress).toHaveBeenCalledTimes(2);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector('[aria-label="Understanding Robot Movement: completed"]')).not.toBeNull();
    expect(container.textContent).toContain('Progress could not be updated.');
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

    const l1 = container.querySelector('button[aria-label="Expand Meet Your Robot"]') as HTMLButtonElement;
    const l2 = container.querySelector('button[aria-label="Collapse Move the Robot"]') as HTMLButtonElement;
    expect(l1).toBeTruthy();
    expect(l2).toBeTruthy();
    await act(async () => { l1.click(); });
    expect(l1.getAttribute('aria-expanded')).toBe('true');
    expect(l2.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#course-module-lesson-3')?.getAttribute('style')).toContain('display: none');
    expect(container.textContent).not.toContain('Authoritative learning item 1');

    await act(async () => { (container.querySelector('button[aria-label="Expand all lessons"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('nav[aria-label="Course lessons"] button[aria-label^="Collapse "]')).toHaveLength(5);

    await act(async () => { (container.querySelector('button[aria-label="Collapse all lessons"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('nav[aria-label="Course lessons"] button[aria-label^="Expand "]')).toHaveLength(5);
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
    expect(selectedLink?.parentElement?.className).toContain('border-accent');
    expect(selectedLink?.className).toContain('bg-accent-soft');

    // 4. Hover & focus classes exist on interactive items
    expect(selectedLink?.className).toContain('focus-visible:ring-accent');
    const courseInfoLink = container.querySelector('a[href="/courses/course-1/info"]');
    expect(courseInfoLink?.className).toContain('hover:bg-sunken');
    expect(courseInfoLink?.className).toContain('transition-colors');

    // 5. Locked lesson remains non-navigable with lock reason
    expect(container.querySelector('a[href="/courses/course-1/lessons/lesson-3"]')).toBeNull();
    const l3Toggle = container.querySelector('button[aria-label="Expand Grab & Release"]') as HTMLButtonElement;
    await act(async () => {
      l3Toggle?.click();
    });
    expect(container.textContent).toContain('Complete Move the Robot first.');
  });

  it('supports independent multi-expand across lessons (A11 tests 1-7, 12-13)', async () => {
    const pathOverride = {
      lessons: [1, 2, 3, 4, 5].map((ordinal) => ({
        id: `lesson-${ordinal}`,
        code: `C1-L${ordinal}`,
        ordinal,
        title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1],
        status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked',
        progressPercent: ordinal === 1 ? 100 : 0,
        prerequisite: [],
        lockReason: ordinal > 2 ? { message: `Complete lesson ${ordinal - 1} first.` } : null,
        completedAt: null,
      })) as never,
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
              <div>Workspace</div>
            </CourseLearningShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const getBtn = (code: string) => {
      const title = ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][Number(code.split('-L')[1]) - 1];
      return container.querySelector(`button[aria-label$="${title}"]`) as HTMLButtonElement;
    };

    // 1. L2 expanded alone initially
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('false');
    expect(getBtn('C1-L3').getAttribute('aria-expanded')).toBe('false');
    expect(getBtn('C1-L4').getAttribute('aria-expanded')).toBe('false');
    expect(getBtn('C1-L5').getAttribute('aria-expanded')).toBe('false');

    // 2. Opening L1 keeps L2 expanded (both L1 and L2 simultaneously open)
    await act(async () => {
      getBtn('C1-L1').click();
    });
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Understanding Meet Your Robot');
    expect(container.textContent).toContain('Understanding Robot Movement');

    // 3. Opening L3 keeps L1 and L2 expanded (L1 + L2 + L3 all simultaneously open)
    await act(async () => {
      getBtn('C1-L3').click();
    });
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L3').getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Understanding Grab & Release');

    // 4. Collapsing L2 leaves L1 and L3 expanded
    await act(async () => {
      getBtn('C1-L2').click();
    });
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('false');
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L3').getAttribute('aria-expanded')).toBe('true');

    // 5. Expand All expands all five lessons
    const expandAllBtn = container.querySelector('button[aria-label="Expand all lessons"]') as HTMLButtonElement;
    await act(async () => {
      expandAllBtn.click();
    });
    for (let i = 1; i <= 5; i++) {
      expect(getBtn(`C1-L${i}`).getAttribute('aria-expanded')).toBe('true');
      const panel = container.querySelector(`#course-module-lesson-${i}`);
      expect(panel?.className).toContain('grid-rows-[1fr]');
      expect(panel?.className).toContain('duration-200');
    }

    // 6. After Expand All, collapsing L4 leaves others expanded
    await act(async () => {
      getBtn('C1-L4').click();
    });
    expect(getBtn('C1-L4').getAttribute('aria-expanded')).toBe('false');
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L3').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L5').getAttribute('aria-expanded')).toBe('true');

    // 7. Collapse All closes all lesson panels
    const collapseAllBtn = container.querySelector('button[aria-label="Collapse all lessons"]') as HTMLButtonElement;
    await act(async () => {
      collapseAllBtn.click();
    });
    for (let i = 1; i <= 5; i++) {
      expect(getBtn(`C1-L${i}`).getAttribute('aria-expanded')).toBe('false');
      const panel = container.querySelector(`#course-module-lesson-${i}`);
      expect(panel?.className).toContain('grid-rows-[0fr]');
    }
  });

  it('decouples selected activity state from expansion and prevents locked lesson bypass (A11 tests 8-10)', async () => {
    const pathOverride = {
      lessons: [1, 2, 3, 4, 5].map((ordinal) => ({
        id: `lesson-${ordinal}`,
        code: `C1-L${ordinal}`,
        ordinal,
        title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1],
        status: ordinal === 1 ? 'completed' : ordinal === 2 ? 'current' : 'locked',
        progressPercent: ordinal === 1 ? 100 : 0,
        prerequisite: [],
        lockReason: ordinal > 2 ? { message: `Complete lesson ${ordinal - 1} first.` } : null,
        completedAt: null,
      })) as never,
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
              <div>Workspace</div>
            </CourseLearningShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const getBtn = (code: string) => {
      const title = ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][Number(code.split('-L')[1]) - 1];
      return container.querySelector(`button[aria-label$="${title}"]`) as HTMLButtonElement;
    };

    // Expand L1 and L3 while L2 is the active lesson with selected activity
    await act(async () => {
      getBtn('C1-L1').click();
      getBtn('C1-L3').click();
    });

    // 8. Selected activity is only marked on L2's activity
    const activePageLinks = container.querySelectorAll('a[aria-current="page"]');
    expect(activePageLinks).toHaveLength(1);
    expect(activePageLinks[0].getAttribute('href')).toContain('/lessons/lesson-2/activities/lesson-2-reading-1');

    // 9. Locked lesson L3 expansion renders activity metadata with lock icon without unlocking
    expect(container.textContent).toContain('Complete lesson 2 first.');
    expect(container.textContent).toContain('Build your Grab & Release sequence');
    expect(container.textContent).toContain('Reach & Grasp Target');

    // 10. Locked activity navigation remains completely blocked (no <a> tags inside L3 panel)
    const l3Panel = container.querySelector('#course-module-lesson-3');
    expect(l3Panel?.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelector('a[href*="/lessons/lesson-3"]')).toBeNull();
  });

  it('preserves expanded state across navigation transitions without collapsing unrelated lessons (A11 test 11)', async () => {
    const pathOverride = {
      lessons: [1, 2, 3, 4, 5].map((ordinal) => ({
        id: `lesson-${ordinal}`,
        code: `C1-L${ordinal}`,
        ordinal,
        title: ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][ordinal - 1],
        status: ordinal <= 2 ? 'completed' : ordinal === 3 ? 'current' : 'locked',
        progressPercent: ordinal <= 2 ? 100 : 0,
        prerequisite: [],
        lockReason: ordinal > 3 ? { message: `Complete lesson ${ordinal - 1} first.` } : null,
        completedAt: null,
      })) as never,
    };

    // First render with lesson-2
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
              <div>Workspace L2</div>
            </CourseLearningShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const getBtn = (code: string) => {
      const title = ['Meet Your Robot', 'Move the Robot', 'Grab & Release', 'Pick & Place', 'Physical Robot Lab'][Number(code.split('-L')[1]) - 1];
      return container.querySelector(`button[aria-label$="${title}"]`) as HTMLButtonElement;
    };

    // Expand L1 as well
    await act(async () => {
      getBtn('C1-L1').click();
    });
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');

    // Simulate navigation to lesson-1 (new props)
    const lesson1 = { ...lesson, id: 'lesson-1', ordinal: 1, title: 'Meet Your Robot' };
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <CourseLearningShell
              courseId="course-1"
              lessonId="lesson-1"
              lesson={lesson1}
              pathOverride={pathOverride}
              activityId="lesson-1-reading-1"
            >
              <div>Workspace L1</div>
            </CourseLearningShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    // Both L1 and L2 remain expanded! L2 was NOT collapsed by navigating to L1!
    expect(getBtn('C1-L1').getAttribute('aria-expanded')).toBe('true');
    expect(getBtn('C1-L2').getAttribute('aria-expanded')).toBe('true');
  });
});
