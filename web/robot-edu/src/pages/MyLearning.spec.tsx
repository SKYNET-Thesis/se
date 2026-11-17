// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiStudentQuiz } from '../lib/api';

const mocks = vi.hoisted(() => ({
  sessionState: {
    session: null as null | { access_token: string; expires_at?: number; user: { id: string } },
    loading: true,
    sessionRevision: 0,
  },
  coursePaths: vi.fn(),
  quizzes: vi.fn(),
  myLearning: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mocks.sessionState,
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, coursePaths: mocks.coursePaths, quizzes: mocks.quizzes, myLearning: mocks.myLearning },
    progressionApi: { ...actual.progressionApi, coursePaths: mocks.coursePaths, quizzes: mocks.quizzes },
  };
});

import { MyLearning } from './MyLearning';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const course1Path = {
  course: {
    id: 'c1-uuid',
    title: 'Robotics Fundamentals',
    status: 'published',
    level: 'Introductory',
    recommendedGrades: '6-8',
    description: 'Foundations of robotics',
    label: 'Track 1',
    learningOutcome: 'Build robot behaviors',
    competencies: [],
  },
  progressPercent: 40,
  currentLessonId: 'lesson-3-uuid',
  lessons: [
    {
      id: 'lesson-1-uuid',
      ordinal: 1,
      title: 'Meet Your Robot',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [],
      lockReason: null,
      completedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'lesson-2-uuid',
      ordinal: 2,
      title: 'Move the Robot',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [],
      lockReason: null,
      completedAt: '2026-10-31T01:00:00Z',
    },
    {
      id: 'lesson-3-uuid',
      ordinal: 3,
      title: 'Grab & Release',
      status: 'current' as const,
      progressPercent: 0,
      prerequisite: [],
      lockReason: null,
      completedAt: null,
    },
  ],
};

const completedCoursePath = {
  course: {
    id: 'c2-uuid',
    title: 'Advanced Robot Kinematics',
    status: 'published',
    level: 'Advanced',
    recommendedGrades: '9-12',
    description: 'Advanced robotics motion',
    label: 'Track 2',
    learningOutcome: 'Master kinematics',
    competencies: [],
  },
  progressPercent: 100,
  currentLessonId: null,
  lessons: [
    {
      id: 'c2-l1',
      ordinal: 1,
      title: 'Forward Kinematics',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [],
      lockReason: null,
      completedAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'c2-l2',
      ordinal: 2,
      title: 'Inverse Kinematics',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [],
      lockReason: null,
      completedAt: '2026-11-02T10:00:00Z',
    },
  ],
};

const mockQuizzes: ApiStudentQuiz[] = [
  {
    course_id: 'c1-uuid',
    course_title: 'Robotics Fundamentals',
    lesson_id: 'lesson-1-uuid',
    lesson_title: 'Meet Your Robot',
    lesson_ordinal: 1,
    assignment_id: 'asg-quiz-1',
    quiz_title: 'Meet Your Robot Knowledge Check',
    classroom_assignment_id: 'ca-quiz-1',
    attempt_status: 'submitted',
    passed: true,
    status: 'passed',
    score: 100,
    pass_percent: 80,
    attempt_id: 'att-q1',
  },
  {
    course_id: 'c1-uuid',
    course_title: 'Robotics Fundamentals',
    lesson_id: 'lesson-2-uuid',
    lesson_title: 'Move the Robot',
    lesson_ordinal: 2,
    assignment_id: 'asg-quiz-2',
    quiz_title: 'Move the Robot Knowledge Check',
    classroom_assignment_id: 'ca-quiz-2',
    attempt_status: 'submitted',
    passed: false,
    status: 'failed',
    score: 50,
    pass_percent: 80,
    attempt_id: 'att-q2',
  },
  {
    course_id: 'c1-uuid',
    course_title: 'Robotics Fundamentals',
    lesson_id: 'lesson-3-uuid',
    lesson_title: 'Grab & Release',
    lesson_ordinal: 3,
    assignment_id: 'asg-quiz-3',
    quiz_title: 'Grab & Release Knowledge Check',
    classroom_assignment_id: 'ca-quiz-3',
    attempt_status: null,
    passed: null,
    status: 'not_started',
    score: null,
    pass_percent: 80,
    attempt_id: null,
  },
];

describe('My Learning tabbed information architecture (In Progress, Completed, Quizzes)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  const renderRoute = async (path = '/my-learning') => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/my-learning" element={<MyLearning />} />
              <Route path="/my-learning/:classroomAssignmentId" element={<div>Quiz Page</div>} />
              <Route path="/courses/:courseId" element={<div data-testid="course-path-page">Course Path Page</div>} />
              <Route
                path="/courses/:courseId/lessons/:lessonId"
                element={<div data-testid="lesson-detail-page">Lesson Detail Page</div>}
              />
              <Route
                path="/courses/:courseId/lessons/:lessonId/activities/:activityId"
                element={<div data-testid="activity-reader-page">Activity Reader Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    mocks.myLearning.mockResolvedValue([{ classroom_assignment_id: 'ca-quiz-1', due_at: null }, { classroom_assignment_id: 'ca-quiz-2', due_at: null }, { classroom_assignment_id: 'ca-quiz-3', due_at: null }]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.sessionState = { session: null, loading: true, sessionRevision: 0 };
    mocks.coursePaths.mockReset().mockResolvedValue([]);
    mocks.quizzes.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
  });

  // 1. default In Progress tab
  it('1. default In Progress tab is active and tabs are exactly In Progress, Completed, Quizzes', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue(mockQuizzes);
    await renderRoute();

    const inProgressTab = container.querySelector('#tab-in-progress');
    const completedTab = container.querySelector('#tab-completed');
    const quizzesTab = container.querySelector('#tab-quizzes');
    const assignmentsTab = container.querySelector('#tab-assignments');

    expect(inProgressTab).not.toBeNull();
    expect(completedTab).not.toBeNull();
    expect(quizzesTab).not.toBeNull();
    expect(assignmentsTab).toBeNull(); // Assignments tab must NOT be inside My Learning

    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
    expect(inProgressTab?.getAttribute('tabindex')).toBe('0');
    expect(completedTab?.getAttribute('aria-selected')).toBe('false');
    expect(quizzesTab?.getAttribute('aria-selected')).toBe('false');

    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBe('panel-in-progress');
  });

  // 2. active courses render
  it('2. active courses render under In Progress with title, metadata, progress %, lesson, and CTAs', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    await renderRoute();

    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('Level: Introductory');
    expect(container.textContent).toContain('Grades: 6-8');
    expect(container.textContent).toContain('40%');
    expect(container.textContent).toContain('2 / 3 lessons completed');
    expect(container.textContent).toContain('Grab & Release');
    expect(container.textContent).not.toMatch(/C1-L[1-5]/);
    expect(container.textContent).toContain('Continue Learning');
    expect(container.textContent).toContain('View Course Path');
  });

  // 3. completed courses render only under Completed
  it('3. completed courses render only under Completed tab, not under In Progress', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path, completedCoursePath]);
    await renderRoute();

    // In Progress tab: only course1Path visible
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).not.toContain('Advanced Robot Kinematics');

    // Switch to Completed tab
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('Advanced Robot Kinematics');
    expect(container.textContent).toContain('Completed');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('2 / 2 lessons completed');
    expect(container.textContent).not.toContain('Robotics Fundamentals');
  });

  // 4. assignments no longer render inside My Learning
  it('4. assignments no longer render inside My Learning', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue(mockQuizzes);
    await renderRoute();

    expect(container.textContent).not.toContain('Classroom Assignments');
    expect(container.textContent).not.toContain('Assigned to classroom');
    expect(container.textContent).not.toContain('Awaiting Evaluation');
  });

  // 5. Quizzes tab renders knowledge-check items
  it('5. Quizzes tab renders knowledge-check items with course, lesson, and quiz title', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue(mockQuizzes);
    await renderRoute();

    const quizzesTab = container.querySelector<HTMLButtonElement>('#tab-quizzes');
    await act(async () => {
      quizzesTab?.click();
    });

    expect(container.textContent).toContain('Meet Your Robot Knowledge Check');
    expect(container.textContent).toContain('Move the Robot Knowledge Check');
    expect(container.textContent).toContain('Grab & Release Knowledge Check');
    expect(container.textContent).toContain('Robotics Fundamentals›Meet Your Robot');
  });

  // 6. quiz result uses authoritative result data
  it('6. quiz result uses authoritative result data (Passed, Failed, score %, CTAs)', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue(mockQuizzes);
    await renderRoute();

    const quizzesTab = container.querySelector<HTMLButtonElement>('#tab-quizzes');
    await act(async () => {
      quizzesTab?.click();
    });

    for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); // open deliveries load

    // Authoritative Passed status and score
    expect(container.textContent).toContain('Passed');
    expect(container.textContent).toContain('100%');

    // Not passed: the quiz page decides whether a retake is allowed, so the row offers the result
    expect(container.textContent).toContain('Not passed');
    expect(container.textContent).toContain('50%');
    expect(container.textContent).not.toContain('Retry');
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]);
    expect(links).toContainEqual(['View result: Meet Your Robot Knowledge Check', '/my-learning/ca-quiz-1']);
    expect(links).toContainEqual(['View result: Move the Robot Knowledge Check', '/my-learning/ca-quiz-2']);

    // Not started and open now
    expect(container.textContent).toContain('Not started');
    expect(links).toContainEqual(['Start quiz: Grab & Release Knowledge Check', '/my-learning/ca-quiz-3']);

    // Every classroom quiz opens on its quiz page
    const viewResultBtn = Array.from(container.querySelectorAll<HTMLElement>('a')).find((b) => b.textContent === 'View result');
    await act(async () => {
      viewResultBtn?.click();
    });
    expect(container.textContent).toContain('Quiz Page');
  });

  it('A06: tells an open quiz from one that is not open now, using the open deliveries from GET /me/learning', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue([
      { ...mockQuizzes[2], quiz_title: 'Open quiz', assignment_id: 'x1', classroom_assignment_id: 'ca-open' },
      { ...mockQuizzes[2], quiz_title: 'Scheduled quiz', assignment_id: 'x2', classroom_assignment_id: 'ca-later' },
    ]);
    mocks.myLearning.mockResolvedValue([{ classroom_assignment_id: 'ca-open', due_at: '2026-11-20T10:00:00Z' }]);
    await renderRoute('/my-learning?tab=quizzes');
    for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const rows = [...container.querySelectorAll('[role="tabpanel"] li')].map((li) => li.textContent);
    expect(rows[0]).toContain('Not started'); expect(rows[0]).toContain('Start quiz'); expect(rows[0]).toMatch(/Due \w{3}, Nov 20/);
    expect(rows[1]).toContain('Not open now'); expect(rows[1]).toContain('View quiz'); expect(rows[1]).not.toContain('Start quiz');
  });

  it('A06: lists only quizzes delivered to the student’s class, once each', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockResolvedValue([
      { ...mockQuizzes[0], quiz_title: 'Delivered quiz', assignment_id: 'y1', classroom_assignment_id: 'ca-quiz-1' },
      { ...mockQuizzes[0], quiz_title: 'Delivered quiz', assignment_id: 'y1', classroom_assignment_id: 'ca-quiz-1' },
      { ...mockQuizzes[2], quiz_title: 'Another class copy', assignment_id: 'y2', classroom_assignment_id: null },
    ]);
    await renderRoute('/my-learning?tab=quizzes');
    for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelectorAll('[role="tabpanel"] li')).toHaveLength(1);
    expect(container.textContent).not.toContain('Another class copy');
    expect(container.querySelector('#tab-quizzes')?.textContent).toContain('1');
  });

  it('renders genuine empty state when no courses and no quizzes exist', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([]);
    mocks.quizzes.mockResolvedValue([]);
    await renderRoute();

    expect(container.textContent).toContain('No assigned learning');
  });

  it('restores the chosen tab from the link, and keeps courses visible when only quizzes fail (A05)', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.quizzes.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderRoute('/my-learning?tab=quizzes');
    expect(container.querySelector('#tab-quizzes')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"] [role="alert"]')?.textContent).toContain('VISTA couldn’t be reached.');
    await act(async () => { (container.querySelector('#tab-in-progress') as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('Continue Learning');
  });
});

describe('My Learning reliability (A05)', () => {
  it('never turns a failed request into an empty course list', async () => {
    const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
    const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
      await expect(actual.progressionApi.coursePaths('tok')).rejects.toBeInstanceOf(TypeError); // enrollments failed: an error, not []
      fetchMock.mockImplementation((url: string) => String(url).includes('/me/enrollments')
        ? json(200, [{ course_id: 'c1', status: 'active' }, { course_id: 'c2', status: 'active' }])
        : String(url).includes('/me/courses/c1/') ? json(200, { course: { id: 'c1' }, lessons: [], progressPercent: 0, currentLessonId: null }) : json(404, { message: 'Course was not found.' }));
      expect((await actual.progressionApi.coursePaths('tok')).map((p) => p.course.id)).toEqual(['c1']); // c2 is no longer available
      fetchMock.mockImplementation((url: string) => String(url).includes('/me/enrollments') ? json(200, [{ course_id: 'c1', status: 'active' }]) : json(500, { message: 'boom' }));
      await expect(actual.progressionApi.coursePaths('tok')).rejects.toMatchObject({ status: 500 }); // not silently dropped
    } finally { vi.unstubAllGlobals(); }
  });
});
