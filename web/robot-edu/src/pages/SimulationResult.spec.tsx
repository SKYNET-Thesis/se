// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationResult } from './SimulationResult';
import type { ApiSymbolicEvaluation, CoursePathResponse } from '../lib/api';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'valid-token', user: { id: 'student-1' } },
  symbolicEvaluation: vi.fn(),
  symbolicEvaluations: vi.fn(),
  coursePath: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({ session: mocks.session, loading: false }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: {
      ...actual.learnerApi,
      symbolicEvaluation: mocks.symbolicEvaluation,
      symbolicEvaluations: mocks.symbolicEvaluations,
    },
    progressionApi: {
      ...actual.progressionApi,
      coursePath: mocks.coursePath,
    },
  };
});

const c1CoursePathFixture: CoursePathResponse = {
  course: { id: 'course-1', title: 'Robotics Fundamentals', status: 'published' },
  progressPercent: 80,
  currentLessonId: 'lesson-5',
  lessons: [
    { id: 'lesson-1', ordinal: 1, title: 'Meet Your Robot', status: 'completed', progressPercent: 100, prerequisite: [], lockReason: null, completedAt: '2026-10-31T10:00:00Z' },
    { id: 'lesson-2', ordinal: 2, title: 'Move the Robot', status: 'completed', progressPercent: 100, prerequisite: [], lockReason: null, completedAt: '2026-10-31T10:30:00Z' },
    { id: 'lesson-3', ordinal: 3, title: 'Grab & Release', status: 'completed', progressPercent: 100, prerequisite: [], lockReason: null, completedAt: '2026-10-31T11:00:00Z' },
    { id: 'lesson-4', ordinal: 4, title: 'Pick & Place', status: 'completed', progressPercent: 100, prerequisite: [], lockReason: null, completedAt: '2026-10-31T11:30:00Z' },
    { id: 'lesson-5', ordinal: 5, title: 'Physical Robot Lab', status: 'in_progress', progressPercent: 0, prerequisite: [], lockReason: null, completedAt: null },
  ],
};

const l4PassEvaluationFixture: ApiSymbolicEvaluation = {
  id: 'eval-l4-pass-2',
  experimentId: 'exp-l4-2',
  programVersionId: 'version-l4-2',
  versionNumber: 2,
  evaluatorVersion: 'vista-symbolic-evaluator-1',
  ruleSetSchemaVersion: 1,
  ruleSetHash: 'hash-l4',
  verdict: 'passed',
  status: 'success',
  taskState: 'success',
  metrics: { ruleCount: 4, passedRuleCount: 4 },
  createdAt: '2026-10-31T11:30:00Z',
  lesson: {
    id: 'lesson-4',
    title: 'Pick & Place',
    ordinal: 4,
    courseId: 'course-1',
    courseTitle: 'Robotics Fundamentals',
  },
  feedback: {
    summary: 'You successfully placed the object inside the target zone. Course 1 simulation challenge complete.',
    message: 'You successfully placed the object inside the target zone.',
    messages: ['Object grasped.', 'Object lifted.', 'Object released.', 'Object placed in target zone.'],
    ruleResults: [],
  },
  ruleResults: [
    { ordinal: 1, type: 'object_grasped', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Grasp established at (120, 150, 40)', message: 'Object grasped.' },
    { ordinal: 2, type: 'object_lifted', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Object lifted to z=100 (min 70)', message: 'Object lifted.' },
    { ordinal: 3, type: 'object_released', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Gripper opened after transport', message: 'Object released.' },
    { ordinal: 4, type: 'object_in_target_zone', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Object contained in Zone A', message: 'Object placed inside target zone.' },
  ],
  evidence: {
    experimentId: 'exp-l4-2',
    evaluationId: 'eval-l4-pass-2',
    programVersionId: 'version-l4-2',
    versionNumber: 2,
  },
};

const l4FailEvaluationFixture: ApiSymbolicEvaluation = {
  id: 'eval-l4-fail-1',
  experimentId: 'exp-l4-1',
  programVersionId: 'version-l4-1',
  versionNumber: 1,
  evaluatorVersion: 'vista-symbolic-evaluator-1',
  ruleSetSchemaVersion: 1,
  ruleSetHash: 'hash-l4',
  verdict: 'failed',
  status: 'failed',
  taskState: 'failed',
  metrics: { ruleCount: 4, passedRuleCount: 3 },
  createdAt: '2026-10-31T11:00:00Z',
  lesson: {
    id: 'lesson-4',
    title: 'Pick & Place',
    ordinal: 4,
    courseId: 'course-1',
    courseTitle: 'Robotics Fundamentals',
  },
  feedback: {
    summary: 'The object was released outside the target zone.',
    code: 'OBJECT_RELEASED_OUTSIDE_TARGET',
    message: 'The object was released outside the target zone.',
    messages: ['Object grasped.', 'Object lifted.', 'Object released.', 'The object was released outside the target zone.'],
    ruleResults: [],
  },
  ruleResults: [
    { ordinal: 1, type: 'object_grasped', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Grasp established at (120, 150, 40)', message: 'Object grasped.' },
    { ordinal: 2, type: 'object_lifted', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Object lifted to z=100 (min 70)', message: 'Object lifted.' },
    { ordinal: 3, type: 'object_released', passed: true, expected: {}, observed: {}, evidence: [], reason: 'Gripper opened', message: 'Object released.' },
    {
      ordinal: 4,
      type: 'object_in_target_zone',
      passed: false,
      code: 'OBJECT_RELEASED_OUTSIDE_TARGET',
      expected: {},
      observed: {},
      evidence: [],
      reason: 'The object was released 45 mm outside the target area. Move the object farther into the target area before opening the gripper.',
      message: 'The object was released outside the target zone.',
    },
  ],
  evidence: {
    experimentId: 'exp-l4-1',
    evaluationId: 'eval-l4-fail-1',
    programVersionId: 'version-l4-1',
    versionNumber: 1,
  },
};

describe('SimulationResult — P0.8 Authoritative Evidence & Handoff Screen', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.coursePath.mockResolvedValue(c1CoursePathFixture);
    mocks.symbolicEvaluations.mockResolvedValue([l4PassEvaluationFixture, l4FailEvaluationFixture]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderRoute = async (route = '/practice/att-4/result/eval-l4-pass-2') => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/practice/:attemptId/result/:evaluationId" element={<SimulationResult />} />
              <Route path="/courses/:courseId/lessons/:lessonId" element={<div data-testid="lesson-screen">Lesson Screen</div>} />
              <Route path="/courses/:courseId" element={<div data-testid="course-path-screen">Course Path Screen</div>} />
              <Route path="/practice/:attemptId" element={<div data-testid="practice-screen">Practice Workspace Screen</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };

  it('1. loads PASS result from persisted API evidence without needing transient Practice state', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    expect(container.textContent).toContain('Simulation Passed');
    expect(container.textContent).toContain('You successfully placed the object inside the target zone.');
    expect(container.textContent).toContain('C1-L4 Pick & Place Result');
  });

  it('2. displays exact immutable ProgramVersion provenance prominently', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    expect(container.textContent).toContain('Evaluated Program');
    expect(container.textContent).toContain('Version 2');
  });

  it('3. renders all passed rule checks with check icons and messages', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    expect(container.textContent).toContain('Task Checks & Educational Evidence');
    expect(container.textContent).toContain('Object grasped.');
    expect(container.textContent).toContain('Object lifted.');
    expect(container.textContent).toContain('Object released.');
    expect(container.textContent).toContain('Object placed inside target zone.');
    expect(container.textContent).toContain('4 of 4 checks passed');
  });

  it('4. loads FAIL result with specific near-miss feedback and direction on what to fix', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4FailEvaluationFixture);
    await renderRoute('/practice/att-4/result/eval-l4-fail-1');

    expect(container.textContent).toContain('Simulation Needs Changes');
    expect(container.textContent).toContain('The object was released outside the target zone.');
    expect(container.textContent).toContain('45 mm outside the target area');
    expect(container.textContent).toContain('Needs Revision');
  });

  it('5. FAIL result Try Again returns to the same practice attempt', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4FailEvaluationFixture);
    await renderRoute('/practice/att-4/result/eval-l4-fail-1');

    const tryAgainBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try Again in Practice')
    );
    expect(tryAgainBtn).toBeDefined();

    await act(async () => {
      tryAgainBtn?.click();
    });

    expect(container.textContent).toContain('Practice Workspace Screen');
  });

  it('6. L4 PASS Continue Learning navigates to C1-L5 Physical Robot Lab detail', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue Learning: Physical Robot Lab')
    );
    expect(continueBtn).toBeDefined();

    await act(async () => {
      continueBtn?.click();
    });

    expect(container.textContent).toContain('Lesson Screen');
  });

  it('7. L4 PASS does NOT display course completed (shows Course 1 simulation challenge complete, unlocks L5)', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    expect(container.textContent).toContain('Course 1 simulation challenge complete');
    expect(container.textContent).not.toContain('Course 1 Completed');
  });

  it('8. renders compact simulation attempt history allowing navigation to prior immutable versions', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    expect(container.textContent).toContain('Simulation Attempt History');
    expect(container.textContent).toContain('Version 2');
    expect(container.textContent).toContain('Version 1');
  });

  it('9. expands technical evidence details on toggle', async () => {
    mocks.symbolicEvaluation.mockResolvedValueOnce(l4PassEvaluationFixture);
    await renderRoute();

    const toggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Evidence Provenance & Technical Audit')
    );
    expect(toggleBtn).toBeDefined();

    await act(async () => {
      toggleBtn?.click();
    });

    expect(container.textContent).toContain('Evaluation ID');
    expect(container.textContent).toContain('eval-l4-pass-2');
    expect(container.textContent).toContain('ProgramVersion ID');
    expect(container.textContent).toContain('version-l4-2');
    expect(container.textContent).toContain('vista-symbolic-evaluator-1');
  });

  it('10. handles authorization failure / non-existent evaluation safely with empty state', async () => {
    mocks.symbolicEvaluation.mockRejectedValueOnce(new Error('Symbolic evaluation was not found.'));
    await renderRoute('/practice/att-4/result/eval-other-student');

    expect(container.textContent).toContain('Simulation result unavailable');
    expect(container.textContent).toContain('Symbolic evaluation was not found.');
    expect(container.textContent).toContain('Return to Practice');
  });
});
