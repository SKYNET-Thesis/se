// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarNav } from '../components/layout/SidebarNav';
import type { ApiMyLearning } from '../lib/api';

const mocks = vi.hoisted(() => ({
  sessionState: {
    session: null as null | { access_token: string; expires_at?: number; user: { id: string } },
    loading: true,
    sessionRevision: 0,
  },
  myLearning: vi.fn(),
  role: 'student',
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mocks.sessionState,
}));

vi.mock('../contexts/RoleContext', () => ({
  useRole: () => ({ role: mocks.role, loading: false }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, myLearning: mocks.myLearning },
  };
});

import { StudentAssignments, formatScore } from './StudentAssignments';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockAssignments: ApiMyLearning[] = [
  {
    classroom_assignment_id: 'ca-assigned-1',
    title: 'Gripper Assembly Challenge',
    instructions: 'Build a gripper program to pick and place cubes.',
    lesson_id: 'lesson-1',
    lesson_title: 'C1-L1 — Meet Your Robot',
    challenge_id: 'ch-1',
    challenge_title: 'Pick Object Challenge',
    classroom_name: 'Robotics Fundamentals Class A',
    course_title: 'Robotics Fundamentals',
    attempt_id: null,
    attempt_status: null,
    status: 'assigned',
    learning_status: 'assigned',
    due_at: '2026-11-15T00:00:00Z',
    score: null,
    teacher_feedback: null,
  },
  {
    classroom_assignment_id: 'ca-in-progress-1',
    title: 'Trajectory Optimization',
    instructions: 'Optimize smooth motion trajectories.',
    lesson_id: 'lesson-2',
    lesson_title: 'C1-L2 — Move the Robot',
    challenge_id: null,
    challenge_title: null,
    classroom_name: 'Robotics Fundamentals Class A',
    course_title: 'Robotics Fundamentals',
    attempt_id: 'att-ip-1',
    attempt_status: 'in_progress',
    status: 'in_progress',
    learning_status: 'in_progress',
    due_at: '2026-11-20T00:00:00Z',
    score: null,
    teacher_feedback: null,
  },
  {
    classroom_assignment_id: 'ca-submitted-1',
    title: 'Inverse Kinematics Lab',
    instructions: 'Calculate arm joint angles for target coords.',
    lesson_id: 'lesson-3',
    lesson_title: 'C1-L3 — Kinematics',
    challenge_id: 'ch-3',
    challenge_title: 'IK Solver',
    classroom_name: 'Robotics Fundamentals Class A',
    course_title: 'Robotics Fundamentals',
    attempt_id: 'att-sub-1',
    attempt_status: 'submitted',
    status: 'submitted',
    learning_status: 'submitted',
    due_at: null,
    score: null,
    teacher_feedback: null,
  },
  {
    classroom_assignment_id: 'ca-evaluated-1',
    title: 'Robotic Pick & Place Qualification',
    instructions: 'Complete precision pick and place task.',
    lesson_id: 'lesson-4',
    lesson_title: 'C1-L4 — Pick & Place',
    challenge_id: 'ch-4',
    challenge_title: 'Qualification Challenge',
    classroom_name: 'Robotics Fundamentals Class A',
    course_title: 'Robotics Fundamentals',
    attempt_id: 'att-eval-1',
    attempt_status: 'evaluated',
    status: 'evaluated',
    learning_status: 'evaluated',
    due_at: '2026-11-08T00:00:00Z',
    score: 92,
    teacher_feedback: 'Outstanding trajectory timing and block alignment!',
  },
];

describe('Student Assignments Workspace (/assignments)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  const renderRoute = async (initialPath = '/assignments') => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[initialPath]}>
            <div className="flex">
              <SidebarNav />
              <Routes>
                <Route path="/assignments" element={<StudentAssignments />} />
                <Route
                  path="/my-learning/:id"
                  element={<div data-testid="assignment-detail-page">Assignment Detail Page</div>}
                />
                <Route
                  path="/practice/:attemptId"
                  element={<div data-testid="practice-page">Practice Page</div>}
                />
              </Routes>
            </div>
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
    mocks.sessionState = {
      session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.myLearning.mockReset().mockResolvedValue(mockAssignments);
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
  });

  // 7. Assignments sidebar item exists
  it('7. Assignments sidebar item exists with correct route and icon', async () => {
    await renderRoute('/assignments');

    const sidebarLinks = Array.from(container.querySelectorAll('nav a'));
    const assignmentsLink = sidebarLinks.find((l) => l.getAttribute('href') === '/assignments');

    expect(assignmentsLink).toBeDefined();
    expect(assignmentsLink?.textContent).toContain('Assignments');
  });

  // 8. /assignments activates the correct sidebar item
  it('8. /assignments activates the correct sidebar item and does not activate My Learning', async () => {
    await renderRoute('/assignments');

    const assignmentsLink = Array.from(container.querySelectorAll('nav a')).find(
      (l) => l.getAttribute('href') === '/assignments'
    );
    const myLearningLink = Array.from(container.querySelectorAll('nav a')).find(
      (l) => l.getAttribute('href') === '/my-learning'
    );

    expect(assignmentsLink?.className).toContain('bg-accent-soft');
    expect(assignmentsLink?.className).toContain('text-accent-ink');
    expect(myLearningLink?.className).not.toContain('bg-accent-soft');
  });

  // 9. default tab is In Progress
  it('9. default tab is In Progress with role="tab" and aria-selected="true"', async () => {
    await renderRoute('/assignments');

    const inProgressTab = container.querySelector('#tab-in-progress');
    const completedTab = container.querySelector('#tab-completed');

    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
    expect(inProgressTab?.getAttribute('tabindex')).toBe('0');
    expect(completedTab?.getAttribute('aria-selected')).toBe('false');
    expect(completedTab?.getAttribute('tabindex')).toBe('-1');

    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBe('panel-in-progress');
  });

  // 10. Assigned assignment appears in In Progress
  it('10. Assigned assignment appears in In Progress', async () => {
    await renderRoute('/assignments');

    expect(container.textContent).toContain('Gripper Assembly Challenge');
    expect(container.textContent).toContain('Assigned');
  });

  // 11. in-progress assignment appears in In Progress
  it('11. in-progress assignment appears in In Progress', async () => {
    await renderRoute('/assignments');

    expect(container.textContent).toContain('Trajectory Optimization');
    expect(container.textContent).toContain('In Progress');
  });

  // 12. submitted/awaiting-evaluation assignment remains In Progress
  it('12. submitted/awaiting-evaluation assignment remains In Progress and shows Awaiting Evaluation / Submitted', async () => {
    await renderRoute('/assignments');

    expect(container.textContent).toContain('Inverse Kinematics Lab');
    expect(container.textContent).toContain('Awaiting Evaluation');
    expect(container.textContent).toContain('Submitted');
  });

  // 13. evaluated/completed assignment appears under Completed
  it('13. evaluated/completed assignment appears under Completed tab and not under In Progress', async () => {
    await renderRoute('/assignments');

    // On In Progress tab, evaluated assignment should not appear
    expect(container.textContent).not.toContain('Robotic Pick & Place Qualification');

    // Switch to Completed tab
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('Robotic Pick & Place Qualification');
    expect(container.textContent).toContain('Evaluated');
    expect(container.textContent).not.toContain('Gripper Assembly Challenge');
  });

  // 14. course + lesson + classroom context renders correctly
  it('14. course + lesson + classroom context renders correctly', async () => {
    await renderRoute('/assignments');

    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('C1-L1 — Meet Your Robot');
    expect(container.textContent).toContain('Pick Object Challenge');
    expect(container.textContent).toContain('Robotics Fundamentals Class A');
  });

  // 15. due date renders when available
  it('15. due date renders when available in formatted string', async () => {
    await renderRoute('/assignments');

    expect(container.textContent).toContain('Due Nov 15, 2026');
  });

  // 16. authoritative score renders when evaluated
  it('16. authoritative score renders when evaluated under Completed tab', async () => {
    await renderRoute('/assignments');

    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('Score:');
    expect(container.textContent).toContain('92 / 100');
  });

  // 17. teacher feedback renders when available
  it('17. teacher feedback renders when available under Completed tab', async () => {
    await renderRoute('/assignments');

    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('Teacher Feedback');
    expect(container.textContent).toContain('Outstanding trajectory timing and block alignment!');
  });

  // 18. assignment CTA matches lifecycle state
  it('18. assignment CTA matches lifecycle state (Start, Continue, View Submission, View Assignment, View Feedback)', async () => {
    await renderRoute('/assignments');

    // In Progress tab CTAs
    expect(container.textContent).toContain('Start Assignment');
    expect(container.textContent).toContain('Continue Assignment');
    expect(container.textContent).toContain('View Submission');

    // Switch to Completed tab to verify Evaluated CTAs
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');
    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain('View Assignment');
    expect(container.textContent).toContain('View Submission');
    expect(container.textContent).toContain('View Feedback');

    // Switch back to In Progress tab and test Continue navigation
    const inProgressTab = container.querySelector<HTMLButtonElement>('#tab-in-progress');
    await act(async () => {
      inProgressTab?.click();
    });

    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue Assignment')
    );
    await act(async () => {
      continueBtn?.click();
    });
    expect(container.textContent).toContain('Practice Page');
  });

  // 19. responsive layout does not overflow
  it('19. responsive layout does not overflow and uses horizontal scrolling tablist', async () => {
    await renderRoute('/assignments');

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist?.className).toContain('overflow-x-auto');

    const card = container.querySelector('article');
    expect(card?.className).toContain('rounded-xl');
  });

  // 20. keyboard-accessible tabs
  it('20. keyboard-accessible tabs allow navigation with Arrow keys, Home, and End', async () => {
    await renderRoute('/assignments');

    const inProgressTab = container.querySelector<HTMLButtonElement>('#tab-in-progress');
    const completedTab = container.querySelector<HTMLButtonElement>('#tab-completed');

    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');

    // ArrowRight moves from In Progress to Completed
    await act(async () => {
      inProgressTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
    });
    expect(completedTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-completed');

    // ArrowLeft moves from Completed to In Progress
    await act(async () => {
      completedTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      );
    });
    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe('panel-in-progress');

    // End key moves to Completed
    await act(async () => {
      inProgressTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      );
    });
    expect(completedTab?.getAttribute('aria-selected')).toBe('true');

    // Home key moves to In Progress
    await act(async () => {
      completedTab?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      );
    });
    expect(inProgressTab?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('formatScore', () => {
  it('uses the persisted rubric maximum instead of a hardcoded 100', () => {
    expect(formatScore(9, 10)).toBe('9 / 10');
    expect(formatScore(7.5, 15)).toBe('7.5 / 15');
    expect(formatScore(8.25, 12)).toBe('8.25 / 12');
  });
  it('keeps the percentage reading when no maximum is known', () => {
    expect(formatScore(80)).toBe('80 / 100'); expect(formatScore(80, null)).toBe('80 / 100'); expect(formatScore(80, 0)).toBe('80 / 100');
  });
});
