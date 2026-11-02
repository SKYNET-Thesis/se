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
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mocks.sessionState,
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, coursePaths: mocks.coursePaths, quizzes: mocks.quizzes },
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

  const renderRoute = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/my-learning']}>
            <Routes>
              <Route path="/my-learning" element={<MyLearning />} />
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
    expect(container.textContent).toContain('C1-L3 — Grab & Release');
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
    expect(container.textContent).toContain('✓ Completed');
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
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L1 — Meet Your Robot');
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

    // Authoritative Passed status and score
    expect(container.textContent).toContain('Passed');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('View Result');

    // Authoritative Failed status and score
    expect(container.textContent).toContain('Failed');
    expect(container.textContent).toContain('50%');
    expect(container.textContent).toContain('Retry Quiz');

    // Not Started
    expect(container.textContent).toContain('Not Started');
    expect(container.textContent).toContain('Start Quiz');

    // Clicking CTA navigates to the knowledge check activity
    const viewResultBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View Result')
    );
    await act(async () => {
      viewResultBtn?.click();
    });
    expect(container.textContent).toContain('Activity Reader Page');
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
});
