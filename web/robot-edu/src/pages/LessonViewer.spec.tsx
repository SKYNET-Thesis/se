// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonViewer } from './LessonViewer';
import type { LessonDetailResponse } from '../lib/api';

const mocks = vi.hoisted(() => ({
  sessionState: {
    session: { access_token: 'valid-token', user: { id: 'student-1' } } as null | { access_token: string; user: { id: string } },
    loading: false,
    sessionRevision: 0,
  },
  lessonDetail: vi.fn(),
  createAttempt: vi.fn(),
  submitKnowledgeCheck: vi.fn(),
  classrooms: vi.fn(),
  assignments: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mocks.sessionState,
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      lessonDetail: (...args: unknown[]) => mocks.lessonDetail(...args),
    },
    learnerApi: {
      ...actual.learnerApi,
      createAttempt: (...args: unknown[]) => mocks.createAttempt(...args),
      submitKnowledgeCheck: (...args: unknown[]) => mocks.submitKnowledgeCheck(...args),
      classrooms: (...args: unknown[]) => mocks.classrooms(...args),
      assignments: (...args: unknown[]) => mocks.assignments(...args),
    },
  };
});

const baseLessonFixture: LessonDetailResponse = {
  id: 'lesson-c1-l1',
  course_id: 'course-1',
  course_title: 'Robotics Fundamentals',
  title: 'Meet Your Robot',
  ordinal: 1,
  status: 'current',
  progressPercent: 0,
  lockReason: null,
  prerequisites: [],
  content: {
    version: 1,
    summary: 'Identify safe robot-lab behavior, components, joints, gripper, camera, workspace bounds, and essential commands.',
    learningObjectives: [
      'Identify the main structural components of the robot arm and joints.',
      'Understand the role of visual workspace inspection and camera view.',
    ],
    conceptSections: [
      {
        title: 'Robot Arm Anatomy & Joints',
        content: 'A robotic arm consists of rigid links connected by motorized joints.',
      },
      {
        title: 'Workspace & Camera View',
        content: 'Before commanding movement, the workspace must be inspected via camera.',
      },
    ],
    robotConcept: 'The robot operates inside a defined 3D workspace. Motors and joints execute commands sequentially.',
    taskPreview: 'Complete the safety knowledge check to verify your readiness before beginning robot motion programming.',
    estimatedMinutes: 15,
    safetyNotes: [
      'Always ensure the robot workspace is clear of obstacles before starting motion.',
      'Never place hands within reach of the robot while a program is running.',
    ],
    completionCriteria: 'Pass the safety knowledge check with a score of at least 80%.',
  },
  objectives: [
    { code: 'C1-L1', description: 'Identify robot components, joints, gripper, camera, workspace bounds, and safety procedures.' },
  ],
  assignment: {
    id: 'assign-1',
    classroomAssignmentId: 'ca-1',
    title: 'Safety Knowledge Check',
    instructions: 'Answer every question. The server calculates the result.',
    allowedBlocks: [],
    constraints: {
      kind: 'knowledge_check',
      questions: [
        { id: 'q1', prompt: 'Which robot component connects links and allows rotational motion?', options: ['joint', 'linkage', 'chassis'] },
        { id: 'q2', prompt: 'What is the primary role of the camera in the workspace?', options: ['visual_inspection', 'power_supply', 'joint_braking'] },
        { id: 'q3', prompt: 'Before commanding the gripper to grasp, what workspace condition must be confirmed?', options: ['clear_workspace', 'blind_approach', 'maximum_speed'] },
        { id: 'q4', prompt: 'Which command returns all robot arm joints to a known safe configuration?', options: ['home', 'emergency_power', 'open_gripper'] },
        { id: 'q5', prompt: 'What is the required immediate safety response to unexpected motion in the workspace?', options: ['stop', 'continue', 'ignore'] },
      ],
    },
  },
  activeAttempt: null,
  priorAttempt: null,
  created_at: '2026-10-31T00:00:00Z',
};

const lockedLessonFixture: LessonDetailResponse = {
  ...baseLessonFixture,
  id: 'lesson-c1-l2',
  title: 'Move the Robot',
  ordinal: 2,
  status: 'locked',
  lockReason: {
    code: 'PREREQUISITE_NOT_COMPLETED',
    prerequisiteLessonId: 'lesson-c1-l1',
    prerequisiteLessonTitle: 'Meet Your Robot',
    message: 'Complete "Meet Your Robot" to unlock this lesson.',
  },
  content: {
    ...baseLessonFixture.content,
    summary: 'Learn deterministic motion sequencing by homing the robot and commanding it to reach a defined target position.',
    conceptSections: [{ title: 'Deterministic Sequencing', content: 'Robots execute instructions one step at a time.' }],
    robotConcept: 'The robot computes the required arm pose to place the gripper at the target.',
    taskPreview: 'Program the left arm to home, move to Target A, and wait for motion stabilization.',
    completionCriteria: 'Complete the target-position simulation successfully with all required actions in order.',
  },
};

describe('LessonViewer / Guided Learning Experience', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.clearAllMocks();
    mocks.sessionState.session = { access_token: 'valid-token', user: { id: 'student-1' } };
    mocks.sessionState.loading = false;
    mocks.sessionState.sessionRevision = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderRoute = async (courseId = 'course-1', lessonId = 'lesson-c1-l1') => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/courses/${courseId}/lessons/${lessonId}`]}>
            <Routes>
              <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonViewer />} />
              <Route path="/courses/:courseId" element={<div>Course Path Screen</div>} />
              <Route path="/practice/:attemptId" element={<div>Practice Workspace Screen</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('eligible lesson renders title, summary, breadcrumb, and status badge', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('C1-L1 — Meet Your Robot');
    expect(container.textContent).toContain('Identify safe robot-lab behavior');
    expect(container.textContent).toContain('Current');
  });

  it('objectives render from server data', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('What You Will Learn');
    expect(container.textContent).toContain('C1-L1');
    expect(container.textContent).toContain('Identify robot components, joints, gripper, camera, workspace bounds');
  });

  it('concept sections (LEARN) render properly', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('Learn the Concepts');
    expect(container.textContent).toContain('Robot Arm Anatomy & Joints');
    expect(container.textContent).toContain('A robotic arm consists of rigid links connected by motorized joints.');
    expect(container.textContent).toContain('Workspace & Camera View');
  });

  it('robot concept and safety notes render', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('Robot Concept in Action');
    expect(container.textContent).toContain('The robot operates inside a defined 3D workspace.');
    expect(container.textContent).toContain('Safety Protocols');
    expect(container.textContent).toContain('Always ensure the robot workspace is clear of obstacles');
  });

  it('task preview and completion criteria render with student-facing copy', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('Your Practice Mission');
    expect(container.textContent).toContain('Complete the safety knowledge check to verify your readiness');
    expect(container.textContent).toContain('How This Lesson Is Completed');
    expect(container.textContent).toContain('Pass the safety knowledge check with a score of at least 80%.');
  });

  it('locked lesson shows server lock reason and disables the practice CTA', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(lockedLessonFixture);
    await renderRoute('course-1', 'lesson-c1-l2');

    expect(container.textContent).toContain('This lesson is locked');
    expect(container.textContent).toContain('Complete "Meet Your Robot" to unlock this lesson.');

    const lockedButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Locked')
    );
    expect(lockedButton).toBeDefined();
    expect(lockedButton?.disabled).toBe(true);
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it('opening lesson performs no completion write or attempt creation', async () => {
    mocks.lessonDetail.mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(mocks.createAttempt).not.toHaveBeenCalled();
    expect(mocks.submitKnowledgeCheck).not.toHaveBeenCalled();
  });

  it('active attempt produces Continue Practice state for practice lessons', async () => {
    const l2ActiveFixture: LessonDetailResponse = {
      ...lockedLessonFixture,
      status: 'in_progress',
      lockReason: null,
      ordinal: 2,
      assignment: {
        ...baseLessonFixture.assignment!,
        title: 'Reach Target A',
        constraints: { kind: 'symbolic_program' },
      },
      activeAttempt: { id: 'attempt-in-progress', status: 'in_progress', score: null },
    };
    mocks.lessonDetail.mockResolvedValueOnce(l2ActiveFixture);
    await renderRoute('course-1', 'lesson-c1-l2');

    expect(container.textContent).toContain('Continue Practice');

    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue Practice')
    );
    expect(continueBtn).toBeDefined();

    await act(async () => {
      continueBtn?.click();
    });

    expect(container.textContent).toContain('Practice Workspace Screen');
  });

  it('does not infer a knowledge check from ordinal 1 for a legacy symbolic lesson', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...baseLessonFixture,
      course_title: 'Robot Discovery',
      title: 'Open & Close Gripper',
      assignment: {
        ...baseLessonFixture.assignment!,
        title: 'Gripper Sequence Challenge',
        constraints: { kind: 'symbolic_program' },
      },
    });
    await renderRoute('legacy-course', 'legacy-lesson-1');
    expect(container.textContent).not.toContain('Safety Knowledge Check');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it('does not fabricate fallback questions when the server returns no question set', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...baseLessonFixture,
      assignment: {
        ...baseLessonFixture.assignment!,
        constraints: { kind: 'knowledge_check', questions: [] },
      },
    });
    await renderRoute();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(container.textContent).toContain('Knowledge check content is unavailable');
  });

  it('L1 knowledge check FAIL shows feedback and does not claim completion', async () => {
    mocks.lessonDetail.mockResolvedValue(baseLessonFixture);
    mocks.createAttempt.mockResolvedValueOnce({ id: 'att-1', classroom_assignment_id: 'ca-1', status: 'in_progress' } as never);
    mocks.submitKnowledgeCheck.mockResolvedValueOnce({
      attemptId: 'att-1',
      passed: false,
      score: 60,
      completedLessonId: null,
      newlyUnlockedLessonIds: [],
    });

    await renderRoute();

    // Answer the questions
    const inputs = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);

    for (const qId of ['q1', 'q2', 'q3', 'q4', 'q5']) {
      const qInput = inputs.find((i) => i.name === qId);
      if (qInput) {
        await act(async () => {
          qInput.click();
        });
      }
    }

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Answers')
    );
    expect(submitBtn?.disabled).toBe(false);

    await act(async () => {
      submitBtn?.click();
    });

    expect(mocks.submitKnowledgeCheck).toHaveBeenCalledWith(
      'att-1',
      expect.objectContaining({ answers: expect.any(Array) }),
      'valid-token'
    );
    expect(container.textContent).toContain('Did not meet passing criteria');
    expect(container.textContent).toContain('Your score: 60%');
    expect(container.textContent).toContain('Try Again');
  });

  it('L1 knowledge check PASS displays success result and unlocks progression', async () => {
    mocks.lessonDetail.mockResolvedValue(baseLessonFixture);
    mocks.createAttempt.mockResolvedValueOnce({ id: 'att-1', classroom_assignment_id: 'ca-1', status: 'in_progress' } as never);
    mocks.submitKnowledgeCheck.mockResolvedValueOnce({
      attemptId: 'att-1',
      passed: true,
      score: 100,
      completedLessonId: 'lesson-c1-l1',
      newlyUnlockedLessonIds: ['lesson-c1-l2'],
    });

    await renderRoute();

    const inputs = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    for (const qId of ['q1', 'q2', 'q3', 'q4', 'q5']) {
      const qInput = inputs.find((i) => i.name === qId);
      if (qInput) {
        await act(async () => {
          qInput.click();
        });
      }
    }

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Answers')
    );

    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('Knowledge Check Passed!');
    expect(container.textContent).toContain('Your score: 100%');
    expect(container.textContent).toContain('Continue to Course Path');

    const coursePathBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue to Course Path')
    );
    await act(async () => {
      coursePathBtn?.click();
    });

    expect(container.textContent).toContain('Course Path Screen');
  });

  it('renders error state and retry button on API failure', async () => {
    mocks.lessonDetail.mockRejectedValueOnce(new Error('Network failure loading lesson')).mockResolvedValueOnce(baseLessonFixture);
    await renderRoute();

    expect(container.textContent).toContain('Lesson unavailable');
    expect(container.textContent).toContain('Network failure loading lesson');

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again')
    );
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.lessonDetail).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Meet Your Robot');
  });

  describe('P0.8 — C1-L5 Physical Lab Qualification and Readiness', () => {
    it('renders qualification summary and qualified ProgramVersion when L4 is passed', async () => {
      mocks.lessonDetail.mockResolvedValueOnce({
        id: 'lesson-c1-l5',
        course_id: 'course-1',
        course_title: 'Robotics Fundamentals',
        title: 'Physical Robot Lab',
        ordinal: 5,
        status: 'in_progress',
        progressPercent: 0,
        lockReason: null,
        prerequisites: [],
        qualification: {
          lessonId: 'lesson-c1-l4',
          evaluationId: 'eval-l4-pass',
          experimentId: 'exp-l4-pass',
          programVersionId: 'version-l4-2',
          versionNumber: 2,
          attemptId: 'att-l4',
          passedAt: '2026-10-31T12:00:00Z',
        },
        content: {
          version: 1,
          summary: 'Execute your verified Pick & Place program on the physical SO-101 robot arm.',
          learningObjectives: ['Execute validated program on physical hardware.'],
          keyTakeaways: ['Simulation verification is mandatory before physical execution.'],
          completionCriteria: 'Successfully execute program on the physical robot.',
        },
        assignment: null,
        activeAttempt: null,
        priorAttempt: null,
        created_at: '2026-10-31T00:00:00Z',
      });

      await renderRoute('course-1', 'lesson-c1-l5');

      expect(container.textContent).toContain('Physical Lab Qualification & Readiness');
      expect(container.textContent).toContain('Pick & Place simulation passed');
      expect(container.textContent).toContain('Version 2');
      expect(container.textContent).toContain('Passed');
      expect(container.textContent).toContain('Not started');
      expect(container.textContent).toContain('Continue to Physical Lab');
      expect(container.textContent).not.toContain('Run on robot');
    });

    it('renders incomplete prerequisite status when L4 simulation has not passed', async () => {
      mocks.lessonDetail.mockResolvedValueOnce({
        id: 'lesson-c1-l5',
        course_id: 'course-1',
        course_title: 'Robotics Fundamentals',
        title: 'Physical Robot Lab',
        ordinal: 5,
        status: 'locked',
        progressPercent: 0,
        lockReason: { code: 'PREREQUISITE_NOT_COMPLETED', message: 'Complete Pick & Place first.' },
        prerequisites: [],
        qualification: null,
        content: {
          version: 1,
          summary: 'Physical Lab',
          learningObjectives: [],
          keyTakeaways: [],
          completionCriteria: 'Physical execution.',
        },
        assignment: null,
        activeAttempt: null,
        priorAttempt: null,
        created_at: '2026-10-31T00:00:00Z',
      });

      await renderRoute('course-1', 'lesson-c1-l5');

      expect(container.textContent).toContain('Physical Lab Qualification & Readiness');
      expect(container.textContent).toContain('Incomplete (Pick & Place simulation required)');
      expect(container.textContent).toContain('None');
      expect(container.textContent).toContain('Awaiting simulation pass');
      expect(container.textContent).toContain('Not started');
    });
  });
});

