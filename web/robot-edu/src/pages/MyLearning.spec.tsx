// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionState: {
    session: null as null | { access_token: string; expires_at?: number; user: { id: string } },
    loading: true,
    sessionRevision: 0,
  },
  myLearning: vi.fn(),
  coursePaths: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mocks.sessionState,
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, myLearning: mocks.myLearning, coursePaths: mocks.coursePaths },
    progressionApi: { ...actual.progressionApi, coursePaths: mocks.coursePaths },
  };
});

import { MyLearning } from './MyLearning';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const published = [
  {
    classroom_assignment_id: 'delivery-1',
    title: 'Published gripper task',
    lesson_id: 'lesson-1',
    lesson_title: 'Gripper',
    classroom_name: 'Robotics Class A',
    course_title: 'Robotics',
    attempt_id: null,
    attempt_status: null,
    learning_status: 'assigned' as const,
    due_at: '2026-11-15T00:00:00Z',
    challenge_title: 'Pick Object Challenge',
  },
];

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
    {
      id: 'lesson-4-uuid',
      ordinal: 4,
      title: 'Pick & Place',
      status: 'locked' as const,
      progressPercent: 0,
      prerequisite: [
        { lessonId: 'lesson-3-uuid', title: 'Grab & Release', required: true, minimumScore: null },
      ],
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED' as const,
        prerequisiteLessonId: 'lesson-3-uuid',
        prerequisiteLessonTitle: 'Grab & Release',
        message: 'Complete Grab & Release to unlock this lesson.',
      },
      completedAt: null,
    },
    {
      id: 'lesson-5-uuid',
      ordinal: 5,
      title: 'Physical Robot Lab',
      status: 'locked' as const,
      progressPercent: 0,
      prerequisite: [
        { lessonId: 'lesson-4-uuid', title: 'Pick & Place', required: true, minimumScore: null },
      ],
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED' as const,
        prerequisiteLessonId: 'lesson-4-uuid',
        prerequisiteLessonTitle: 'Pick & Place',
        message: 'Complete Pick & Place to unlock this lesson.',
      },
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

describe('My Learning tabbed information architecture and lifecycle', () => {
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
              <Route path="/my-learning/:id" element={<div data-testid="assignment-detail-page">Assignment Detail Page</div>} />
              <Route path="/courses/:courseId" element={<div data-testid="course-path-page">Course Path Page</div>} />
              <Route
                path="/courses/:courseId/lessons/:lessonId"
                element={<div data-testid="lesson-detail-page">Lesson Detail Page</div>}
              />
              <Route path="/practice/:attemptId" element={<div data-testid="practice-page">Practice Page</div>} />
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
    mocks.myLearning.mockReset().mockResolvedValue([]);
    mocks.coursePaths.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
  });

  // Requirement 1: default tab is In Progress
  it('1. default tab is In Progress with correct active state and accessibility attributes', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();

    const inProgressTab = container.querySelector('#tab-in-progress');
    const completedTab = container.querySelector('#tab-completed');
    const assignmentsTab = container.querySelector('#tab-assignments');

    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
    expect(inProgressTab?.getAttribute('tabindex')).toBe('0');
    expect(completedTab?.getAttribute('aria-selected')).toBe('false');
    expect(completedTab?.getAttribute('tabindex')).toBe('-1');
    expect(assignmentsTab?.getAttribute('aria-selected')).toBe('false');
    expect(assignmentsTab?.getAttribute('tabindex')).toBe('-1');

    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBe('panel-in-progress');
    expect(panel?.getAttribute('aria-labelledby')).toBe('tab-in-progress');
  });

  // Requirement 2: active course appears under In Progress
  it('2. active course appears under In Progress with title, metadata, progress, current lesson, and CTAs', async () => {
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
    expect(container.textContent).toContain('2 / 5 lessons completed');
    expect(container.textContent).toContain('C1-L3 — Grab & Release');
    expect(container.textContent).toContain('Continue Learning');
    expect(container.textContent).toContain('View Course Path');
  });

  // Requirement 3: assignments no longer appear below the active course
  it('3. assignments no longer appear below the active course on In Progress tab', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();

    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).not.toContain('Published gripper task');
    expect(container.textContent).not.toContain('Classroom Assignments');
  });

  // Requirement 4: Completed tab filters completed courses correctly
  it('4. Completed tab filters completed courses correctly and excludes in-progress courses', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path, completedCoursePath]);
    await renderRoute();

    // On In Progress tab, only course1Path is shown
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

  // Requirement 5: Completed empty state
  it('5. Completed tab displays empty state when no courses are completed', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    await renderRoute();

    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('No completed courses');
    expect(container.textContent).toContain('You have not completed any curriculum courses yet.');
  });

  // Requirement 6: Assignments tab displays assigned work
  it('6. Assignments tab displays assigned work with course, classroom, lesson, and challenge context', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();

    const assignmentsTab = container.querySelector<HTMLButtonElement>('#tab-assignments');
    await act(async () => {
      assignmentsTab?.click();
    });

    expect(container.textContent).toContain('Published gripper task');
    expect(container.textContent).toContain('Robotics · Robotics Class A');
    expect(container.textContent).toContain('Gripper');
    expect(container.textContent).toContain('Pick Object Challenge');
    expect(container.textContent).toContain('Assigned');
    expect(container.textContent).toContain('Start Assignment');
  });

  // Requirement 7: evaluated assignment displays authoritative score/feedback when available
  it('7. evaluated assignment displays authoritative score and teacher feedback when available', async () => {
    const evaluatedAssignment = {
      classroom_assignment_id: 'delivery-eval-1',
      title: 'Pick and Place Qualification',
      lesson_id: 'lesson-4',
      lesson_title: 'Pick & Place',
      classroom_name: 'Robotics Class A',
      course_title: 'Robotics Fundamentals',
      attempt_id: 'att-1',
      attempt_status: 'evaluated',
      status: 'evaluated' as const,
      learning_status: 'evaluated' as const,
      score: 95,
      teacher_feedback: 'Excellent grasp on robot trajectory and gripper timing!',
      due_at: '2026-11-20T00:00:00Z',
    };

    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue([evaluatedAssignment]);
    await renderRoute();

    const assignmentsTab = container.querySelector<HTMLButtonElement>('#tab-assignments');
    await act(async () => {
      assignmentsTab?.click();
    });

    expect(container.textContent).toContain('Pick and Place Qualification');
    expect(container.textContent).toContain('Evaluated');
    expect(container.textContent).toContain('Score:');
    expect(container.textContent).toContain('95%');
    expect(container.textContent).toContain('Teacher Feedback');
    expect(container.textContent).toContain('Excellent grasp on robot trajectory and gripper timing!');
    expect(container.textContent).toContain('View Feedback');
  });

  // Requirement 8: assignment CTA matches its state
  it('8. assignment CTA matches its state: Start / Continue / View Submission / View Feedback', async () => {
    const variousAssignments = [
      {
        classroom_assignment_id: 'ca-assigned',
        title: 'Task A (Assigned)',
        lesson_id: 'l-1',
        lesson_title: 'Lesson 1',
        classroom_name: 'Class A',
        course_title: 'Course 1',
        attempt_id: null,
        attempt_status: null,
        status: 'assigned' as const,
        learning_status: 'assigned' as const,
      },
      {
        classroom_assignment_id: 'ca-in-progress',
        title: 'Task B (In Progress)',
        lesson_id: 'l-2',
        lesson_title: 'Lesson 2',
        classroom_name: 'Class A',
        course_title: 'Course 1',
        attempt_id: 'att-ip',
        attempt_status: 'in_progress',
        status: 'in_progress' as const,
        learning_status: 'in_progress' as const,
      },
      {
        classroom_assignment_id: 'ca-submitted',
        title: 'Task C (Submitted)',
        lesson_id: 'l-3',
        lesson_title: 'Lesson 3',
        classroom_name: 'Class A',
        course_title: 'Course 1',
        attempt_id: 'att-sub',
        attempt_status: 'submitted',
        status: 'submitted' as const,
        learning_status: 'submitted' as const,
      },
      {
        classroom_assignment_id: 'ca-evaluated',
        title: 'Task D (Evaluated)',
        lesson_id: 'l-4',
        lesson_title: 'Lesson 4',
        classroom_name: 'Class A',
        course_title: 'Course 1',
        attempt_id: 'att-ev',
        attempt_status: 'evaluated',
        status: 'evaluated' as const,
        learning_status: 'evaluated' as const,
      },
    ];

    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(variousAssignments);
    await renderRoute();

    const assignmentsTab = container.querySelector<HTMLButtonElement>('#tab-assignments');
    await act(async () => {
      assignmentsTab?.click();
    });

    expect(container.textContent).toContain('Start Assignment');
    expect(container.textContent).toContain('Continue Assignment');
    expect(container.textContent).toContain('View Submission');
    expect(container.textContent).toContain('View Feedback');

    // Click Continue Assignment navigates to practice
    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue Assignment')
    );
    await act(async () => {
      continueBtn?.click();
    });
    expect(container.textContent).toContain('Practice Page');
  });

  // Requirement 9: tab switching does not alter authoritative progression
  it('9. tab switching does not alter authoritative progression', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();

    expect(container.textContent).toContain('40%');

    // Switch to Completed
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    // Switch to Assignments
    const assignmentsTab = container.querySelector<HTMLButtonElement>('#tab-assignments');
    await act(async () => {
      assignmentsTab?.click();
    });

    // Switch back to In Progress
    const inProgressTab = container.querySelector<HTMLButtonElement>('#tab-in-progress');
    await act(async () => {
      inProgressTab?.click();
    });

    expect(container.textContent).toContain('40%');
    expect(container.textContent).toContain('2 / 5 lessons completed');
    expect(container.textContent).toContain('C1-L3 — Grab & Release');
  });

  // Requirement 10: keyboard and tab accessibility
  it('10. keyboard and tab accessibility works across tablist, tabs, and panels', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeDefined();
    expect(tablist?.getAttribute('aria-label')).toBe('My Learning Sections');

    const inProgressTab = container.querySelector<HTMLButtonElement>('#tab-in-progress');
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    const assignmentsTab = container.querySelector<HTMLButtonElement>('#tab-assignments');

    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');

    // ArrowRight moves from In Progress to Completed
    await act(async () => {
      inProgressTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
    });
    expect(completedTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-completed');

    // ArrowRight moves from Completed to Assignments
    await act(async () => {
      completedTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
    });
    expect(assignmentsTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-assignments');

    // Home moves to In Progress
    await act(async () => {
      assignmentsTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      );
    });
    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-in-progress');

    // End moves to Assignments
    await act(async () => {
      inProgressTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      );
    });
    expect(assignmentsTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-assignments');
  });

  // Requirement 11: responsive rendering does not overflow
  it('11. responsive rendering container includes overflow-x-auto and wrapping classes', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    await renderRoute();

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist?.className).toContain('overflow-x-auto');

    const courseCard = container.querySelector('article');
    expect(courseCard?.className).toContain('rounded-xl');
  });

  // Lifecycle & routing validations
  it('Continue Learning navigates to currentLessonId', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    await renderRoute();

    const continueButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue Learning')
    );
    expect(continueButton).toBeDefined();

    await act(async () => {
      continueButton?.click();
    });

    expect(container.textContent).toContain('Lesson Detail Page');
  });

  it('View Course Path navigates to /courses/:courseId', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePaths.mockResolvedValue([course1Path]);
    await renderRoute();

    const pathButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View Course Path')
    );
    expect(pathButton).toBeDefined();

    await act(async () => {
      pathButton?.click();
    });

    expect(container.textContent).toContain('Course Path Page');
  });

  it('renders genuine empty state when no courses and no assignments exist', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.myLearning.mockResolvedValue([]);
    mocks.coursePaths.mockResolvedValue([]);
    await renderRoute();

    expect(container.textContent).toContain('No assigned learning');
  });

  it('displays API error without false empty state and supports retry', async () => {
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.myLearning.mockRejectedValue(new Error('Unable to load learning.'));
    await renderRoute();

    expect(container.textContent).toContain('Unable to load learning.');
    expect(container.textContent).not.toContain('No assigned learning');
    expect(container.querySelector('button')?.textContent).toContain('Retry');
  });
});
