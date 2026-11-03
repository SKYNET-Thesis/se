// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityReader } from './ActivityReader';

const mocks = vi.hoisted(() => ({ query: vi.fn(), complete: vi.fn(), invalidate: vi.fn(), setQueryData: vi.fn(), progressData: { courseId: 'course-1', activities: [] as Array<{ activityId: string; status: 'completed' | 'not_started'; completedAt: string | null }> } }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mocks.query(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate, setQueryData: mocks.setQueryData }),
}));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, progressionApi: { ...actual.progressionApi, completeActivity: mocks.complete } };
});
vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({ session: { access_token: 'token', user: { id: 'student' } }, sessionRevision: 1 }),
}));
vi.mock('../components/learning/CourseLearningShell', () => ({
  CourseLearningShell: ({ children }: { children: React.ReactNode }) => <div data-testid="learning-shell">{children}</div>,
}));
vi.mock('../components/learning/useActivityProgress', () => ({ useActivityProgress: () => ({ data: mocks.progressData }) }));

describe('ActivityReader loading isolation', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.query.mockReturnValue({
      isLoading: false,
      data: {
        id: 'lesson-old',
        course_id: 'course-1',
        course_title: 'Robotics Fundamentals',
        title: 'Old lesson must not flash',
        ordinal: 1,
        status: 'current',
        progressPercent: 0,
        lockReason: null,
        prerequisites: [],
        content: { version: 1, summary: 'Old summary', learningObjectives: [], conceptSections: [], robotConcept: '', taskPreview: '', estimatedMinutes: 10, safetyNotes: [], completionCriteria: '' },
        assignment: null,
        activeAttempt: null,
        priorAttempt: null,
        created_at: '',
      },
    });
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('shows loading instead of rendering a previous lesson payload for a new activity route', async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-new/activities/lesson-new-reading-1']}><Routes><Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} /></Routes></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Loading activity');
    expect(container.textContent).not.toContain('Old lesson must not flash');
  });

  describe('C1-L2 activity content ownership', () => {
    const l2Data = {
      id: 'lesson-2',
      course_id: 'course-1',
      course_title: 'Robotics Fundamentals',
      title: 'Move the Robot',
      ordinal: 2,
      status: 'current',
      progressPercent: 0,
      lockReason: null,
      prerequisites: [],
      content: {
        version: 1,
        summary: 'Learn deterministic motion sequencing by homing the robot and commanding it to reach a defined target position.',
        learningObjectives: [],
        conceptSections: [
          { title: 'Deterministic Sequencing', content: 'Robots execute instructions one step at a time in sequence.' },
          { title: 'Target Positioning', content: 'Instead of manual joint angles, VISTA specifies target positions in 3D.' },
          { title: 'Pauses & Motion Timing', content: 'Wait commands allow motion to stabilize.' },
        ],
        robotConcept: 'The robot computes the required arm pose to place the gripper at the commanded 3D coordinates.',
        taskPreview: 'Program the left arm to home, move to Target A, and wait for motion stabilization.',
        estimatedMinutes: 20,
        safetyNotes: [
          'Confirm the target coordinates are within the safe reachable envelope.',
          'Always include a home step at the start of a program to reset joint state.',
        ],
        completionCriteria: 'Complete the target-position simulation successfully using the required action sequence.',
      },
      assignment: {
        id: 'a2',
        classroomAssignmentId: 'ca2',
        title: 'Reach Target A',
        instructions: 'Program the left arm to home, move to Target A, and wait.',
        allowedBlocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
        constraints: { kind: 'symbolic_program' },
      },
      activeAttempt: null,
      priorAttempt: null,
      created_at: '',
    };

    it('renders Learn the Concepts and Safety Protocols in the Reading activity', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-reading-1']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Understanding Robot Movement');
      expect(container.textContent).not.toMatch(/C1-L[1-5]/);
      expect(container.textContent).toContain('Mark as Completed');
      expect(container.textContent).toContain('Reading');
      expect(container.textContent).toContain('4 min');
      expect(container.textContent).toContain('Learn the Concepts');
      expect(container.textContent).toContain('Deterministic Sequencing');
      expect(container.textContent).toContain('Target Positioning');
      expect(container.textContent).toContain('Pauses & Motion Timing');
      expect(container.textContent).toContain('Safety Protocols');
      expect(container.textContent).toContain('Confirm the target coordinates are within the safe reachable envelope.');
    });

    it('marks Reading only after a server-confirmed completion response', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      mocks.complete.mockResolvedValue({ activityId: 'lesson-2-reading-1', status: 'completed', completedAt: '2026-11-03T10:00:00Z' });
      await act(async () => {
        root.render(<MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-reading-1']}><Routes><Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} /></Routes></MemoryRouter>);
        await Promise.resolve();
      });
      const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Mark as Completed');
      expect(mocks.complete).not.toHaveBeenCalled();
      await act(async () => { button?.click(); await Promise.resolve(); });
      expect(mocks.complete).toHaveBeenCalledWith('lesson-2-reading-1', 'token');
      expect(mocks.setQueryData).toHaveBeenCalled();
      expect(mocks.invalidate).toHaveBeenCalled();
      expect(container.textContent).toContain('Activity completed.');
    });

    it('keeps Reading unconfirmed when completion request fails', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      mocks.complete.mockRejectedValue(new Error('Connection lost'));
      await act(async () => {
        root.render(<MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-reading-1']}><Routes><Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} /></Routes></MemoryRouter>);
        await Promise.resolve();
      });
      const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Mark as Completed');
      await act(async () => { button?.click(); await Promise.resolve(); });
      expect(container.textContent).toContain('Connection lost');
      expect(container.textContent).not.toContain('Activity completed.');
      expect(mocks.setQueryData).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Mark as Completed');
    });

    it('renders Robot Concept in Action in the Demonstration activity', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-demonstration']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Robot Concept in Action');
      expect(container.textContent).toContain('Demonstration');
      expect(container.textContent).toContain('3 min');
      expect(container.textContent).toContain('How the Robot Interprets the Target');
      expect(container.textContent).toContain('Deterministic Motion Sequencing');
      expect(container.textContent).toContain('Simulation Preview');
      expect(container.textContent).not.toContain('Safety Protocols');
    });

    it('owns Your Practice Mission and allowed commands in Guided Practice activity', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-guided-practice']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Build Your Move the Robot Sequence');
      expect(container.textContent).toContain('Guided Practice');
      expect(container.textContent).toContain('Your Practice Mission');
      expect(container.textContent).toContain('arm.select · home · preview.move_xyz · wait');
      expect(container.textContent).toContain('Open practice workspace');
    });

    it('renders Authoritative 3D Simulation in the simulation activity', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-simulation']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Reach Target A');
      expect(container.textContent).toContain('3D Simulation');
      expect(container.textContent).toContain('Authoritative 3D Simulation');
      expect(container.textContent).toContain('Target Position');
      expect(container.textContent).toContain('X: 240, Y: 220, Z: 120');
      expect(container.textContent).toContain('Open simulation in workspace');
    });

    it('renders Simulation Feedback and completion criteria in Result activity', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l2Data });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2/activities/lesson-2-result']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Simulation Feedback');
      expect(container.textContent).toContain('Result');
      expect(container.textContent).toContain('Awaiting Simulation Completion');
      expect(container.textContent).toContain('Complete the target-position simulation successfully using the required action sequence.');
      expect(container.textContent).toContain('Open practice workspace');
    });
  });

  describe('C1-L5 Physical Lab Handoff (TEST M - TEST P)', () => {
    const l5QualifiedData = {
      id: 'lesson-5',
      course_id: 'course-1',
      course_title: 'Robotics Fundamentals',
      title: 'Physical Robot Lab',
      ordinal: 5,
      status: 'in_progress',
      progressPercent: 0,
      lockReason: null,
      prerequisites: [],
      content: {
        version: 1,
        summary: 'Transfer your validated Pick & Place simulation program to the physical robot hardware.',
        learningObjectives: [],
        conceptSections: [
          { title: 'Physical Robot Operations', content: 'Safety interlocks, preflight verification, and physical execution.' },
        ],
        robotConcept: 'Review your verified symbolic program before physical execution.',
        taskPreview: 'Run preflight checks and deploy the qualified program to hardware.',
        estimatedMinutes: 30,
        safetyNotes: [
          'Verify emergency stop engagement before powering arm actuators.',
          'Physical execution requires instructor safety authorization.',
        ],
        completionCriteria: 'Complete physical preflight and verified physical experiment.',
      },
      qualification: {
        courseId: 'course-1',
        lessonId: 'lesson-4',
        qualifiedProgramVersionId: 'pv-l4-2',
        programVersionId: 'pv-l4-2',
        programId: 'prog-l4',
        versionNumber: 2,
        challengeId: 'chal-l4',
        symbolicEvaluationId: 'eval-l4-pass-v2',
        evaluationId: 'eval-l4-pass-v2',
        schematicExperimentId: 'exp-l4-2',
        experimentId: 'exp-l4-2',
        verdict: 'passed' as const,
        attemptId: 'att-l4',
        passedAt: '2026-10-31T11:30:00Z',
        qualifiedAt: '2026-10-31T11:30:00Z',
        changeSummary: 'Attempt 2 (corrected target)',
      },
      assignment: null,
      activeAttempt: null,
      priorAttempt: null,
      created_at: '',
    };

    it('TEST M: L5 displays qualified version when backend returns qualification', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l5QualifiedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-demonstration']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Qualified Program');
      expect(container.textContent).toContain('Pick & Place — Version 2');
      expect(container.textContent).toContain('Simulation: PASS');
      expect(container.textContent).toContain('Ready for physical preflight');
      expect(container.textContent).toContain('pv-l4-2');
      expect(container.textContent).toContain('eval-l4-pass-v2');
      expect(container.textContent).toContain('exp-l4-2');
      expect(container.textContent).toContain('Attempt 2 (corrected target)');
    });

    it('TEST N: L5 never displays fake robot success/readiness', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l5QualifiedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-readiness']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Robot Readiness / Safety Check');
      expect(container.textContent).toContain('Physical Lab (Gated)');
      expect(container.textContent).toContain('Preflight Safety Check');
      expect(container.textContent).toContain('Qualified Target: Pick & Place — Version 2');
      expect(container.textContent).toContain('Hardware execution is gated until preflight hardware authorization is enabled (P0.9)');
      expect(container.textContent).toContain('No fake robot execution or synthetic readiness will be performed');
      expect(container.textContent).not.toContain('Robot is ready');
      expect(container.textContent).not.toContain('Execution succeeded');
    });

    it('TEST O: Result/Evidence renders server verdict', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l5QualifiedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-evidence']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Physical Evidence Pending Execution');
      expect(container.textContent).toContain('Evidence review and reflection will be recorded and generated after an authorized physical robot experiment is executed in P0.9');
      expect(container.textContent).toContain('Preflight Program Version: Pick & Place — Version 2');
    });

    it('TEST P: refresh/reload refetches authoritative qualification', async () => {
      // First render returns qualified v2
      mocks.query.mockReturnValue({ isLoading: false, data: l5QualifiedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-demonstration']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });
      expect(container.textContent).toContain('Pick & Place — Version 2');

      // Server updates qualification to v3 (e.g. after fresh pass)
      const l5UpdatedData = {
        ...l5QualifiedData,
        qualification: {
          ...l5QualifiedData.qualification,
          programVersionId: 'pv-l4-3',
          versionNumber: 3,
          evaluationId: 'eval-l4-pass-v3',
          changeSummary: 'Attempt 3 (optimized placement)',
        },
      };

      mocks.query.mockReturnValue({ isLoading: false, data: l5UpdatedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-demonstration']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });
      expect(container.textContent).toContain('Pick & Place — Version 3');
      expect(container.textContent).toContain('pv-l4-3');
      expect(container.textContent).toContain('eval-l4-pass-v3');
    });

    it('TEST Q: Physical Experiment requires explicit confirmation of all 3 checkboxes to enable execution', async () => {
      mocks.query.mockReturnValue({ isLoading: false, data: l5QualifiedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-physical']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Authoritative Target Program');
      expect(container.textContent).toContain('Pick & Place — Version 2');
      expect(container.textContent).toContain('pv-l4-2');
      expect(container.textContent).toContain('Explicit Safety Confirmation Checklist');

      const executeBtn = container.querySelector('#confirm-and-execute-btn') as HTMLButtonElement;
      expect(executeBtn).toBeDefined();
      expect(executeBtn.disabled).toBe(true);

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);

      // Check 1
      await act(async () => {
        checkboxes[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
      expect(executeBtn.disabled).toBe(true);

      // Check 2
      await act(async () => {
        checkboxes[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
      expect(executeBtn.disabled).toBe(true);

      // Check 3
      await act(async () => {
        checkboxes[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
      expect(executeBtn.disabled).toBe(false);
    });

    it('TEST R: Succeeded physical execution displays 100% course evidence', async () => {
      const l5CompletedData = {
        ...l5QualifiedData,
        status: 'completed' as const,
        progressPercent: 100,
      };
      mocks.query.mockReturnValue({ isLoading: false, data: l5CompletedData });
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-5/activities/lesson-5-evidence']}>
            <Routes>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<ActivityReader />} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Authoritative Physical Evidence Verified');
      expect(container.textContent).toContain('real_robot (Physical Hardware)');
      expect(container.textContent).toContain('SO-101 Manipulator (Calibrated)');
      expect(container.textContent).toContain('100% — All 5 Modules Completed');
      expect(container.textContent).toContain('pv-l4-2');
    });
  });
});
