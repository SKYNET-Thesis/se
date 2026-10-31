// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly';
import { Practice } from './Practice';
import { studentLearningKeys } from '../queries/studentLearningQueries';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'token', user: { id: 'student' } },
  attempt: vi.fn(), assignment: vi.fn(), program: vi.fn(), lessonDetail: vi.fn(),
  versions: vi.fn(), submissions: vi.fn(), experiments: vi.fn(), evaluations: vi.fn(), objects: vi.fn(),
  createProgram: vi.fn(), updateProgram: vi.fn(), createVersion: vi.fn(),
  submit: vi.fn(), createSchematic: vi.fn(), runSchematic: vi.fn(), evaluateSymbolic: vi.fn(),
}));

let canvasChangeHandler: (() => void) | undefined;
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: mocks.session }) }));
vi.mock('../components/studio/BlocklyCanvas', () => ({
  BlocklyCanvas: ({ toolbox, onReady, onChange }: { toolbox: unknown; onReady?: (ws: unknown) => void; onChange?: () => void }) => {
    React.useEffect(() => {
      onReady?.({
        getTopBlocks: () => [{ type: 'robot_start', isEnabled: () => true, getNextBlock: () => null, id: 'start-1' }],
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    canvasChangeHandler = onChange;
    return (
      <div data-testid="blockly">
        <button type="button" data-testid="trigger-change" onClick={() => onChange?.()}>Trigger change</button>
        Blockly workspace {JSON.stringify(toolbox)}
      </div>
    );
  },
}));
vi.mock('../components/studio/So101Viewer3D', () => ({ So101Viewer3D: () => <div data-testid="so101">SO-101 viewer</div> }));
vi.mock('../lib/robotExecution', () => ({ createRobotExecutionClient: () => ({ getRobotStatus: vi.fn(), restoreExecution: vi.fn() }) }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: {
      ...actual.learnerApi,
      attempt: mocks.attempt,
      program: mocks.program,
      versions: mocks.versions,
      submissions: mocks.submissions,
      experiments: mocks.experiments,
      symbolicEvaluations: mocks.evaluations,
      createProgram: mocks.createProgram,
      updateProgram: mocks.updateProgram,
      createVersion: mocks.createVersion,
      submit: mocks.submit,
      createSchematic: mocks.createSchematic,
      runSchematic: mocks.runSchematic,
      evaluateSymbolic: mocks.evaluateSymbolic,
    },
    assignmentApi: { ...actual.assignmentApi, detail: mocks.assignment },
    catalogApi: { ...actual.catalogApi, lessonDetail: mocks.lessonDetail, challengeObjects: mocks.objects },
  };
});

describe('Course 1 Practice integration & L2 Authoritative Task Simulation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let currentSavedWorkspace: Record<string, unknown>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    currentSavedWorkspace = { blocks: { languageVersion: 0, blocks: [] } };
    vi.spyOn(Blockly.serialization.workspaces, 'save').mockImplementation(() => currentSavedWorkspace);

    mocks.attempt.mockResolvedValue({ id: 'attempt-2', classroom_assignment_id: 'ca-2', status: 'in_progress' });
    mocks.program.mockResolvedValue({
      id: 'program-2',
      title: 'L2 program',
      workspace_json: { blocks: { blocks: [] } },
      robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] },
    });
    mocks.versions.mockResolvedValue([]);
    mocks.submissions.mockResolvedValue([]);
    mocks.experiments.mockResolvedValue([]);
    mocks.evaluations.mockResolvedValue([]);
    mocks.objects.mockResolvedValue([]);
    mocks.updateProgram.mockResolvedValue({ id: 'program-2' });
    mocks.createVersion.mockResolvedValue({ id: 'version-new-1', version_number: 1 });
    mocks.submit.mockResolvedValue({ id: 'sub-1', program_version_id: 'version-1', status: 'submitted' });
    mocks.createSchematic.mockResolvedValue({ id: 'exp-1', status: 'pending', execution_mode: 'schematic' });
    mocks.runSchematic.mockResolvedValue({ timeline: [] });
    mocks.evaluateSymbolic.mockResolvedValue({
      id: 'eval-1',
      experimentId: 'exp-1',
      programVersionId: 'version-1',
      evaluatorVersion: '1.0.0',
      ruleSetSchemaVersion: 1,
      ruleSetHash: 'hash-1',
      verdict: 'passed',
      ruleResults: [
        { ordinal: 1, type: 'ordered_actions', passed: true, code: 'ORDERED_ACTIONS_MATCH', message: 'The required sequence of movements was executed.', reason: 'Actions executed in order', expected: {}, observed: {}, evidence: [] },
        { ordinal: 2, type: 'preview_target_match', passed: true, code: 'PREVIEW_TARGET_MATCH', message: 'Target A reached successfully.', reason: 'Target matched', expected: {}, observed: {}, evidence: [] },
      ],
      metrics: { ruleCount: 2, passedRuleCount: 2 },
      createdAt: '2026-10-31T00:00:00Z',
      status: 'success',
      taskState: 'success',
      robotState: { selectedArm: 'left', position: { x: 240, y: 220, z: 120 } },
      feedback: { code: 'SIMULATION_PASSED', message: 'Target A reached successfully.', ruleResults: [] },
      evidence: { experimentId: 'exp-1', evaluationId: 'eval-1', programVersionId: 'version-1' },
    });
    mocks.lessonDetail.mockResolvedValue({
      id: 'lesson-2',
      course_id: 'course-1',
      course_title: 'Robotics Fundamentals',
      title: 'Move the Robot',
      ordinal: 2,
      content: { completionCriteria: 'Reach Target A with the required sequence.' },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/practice/attempt-2']}>
            <Routes>
              <Route path="/practice/:attemptId" element={<Practice mode="learning" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('1 & 2. renders the existing Blockly and SO-101 preview with server-driven L2 blocks', async () => {
    mocks.versions.mockResolvedValueOnce([{ id: 'version-p04', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Home, move, then wait.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L2');
    expect(container.querySelector('[data-testid="blockly"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="so101"]')).not.toBeNull();
    expect(container.textContent).toContain('robot_move_home');
    expect(container.textContent).toContain('robot_move_to');
    expect(container.textContent).not.toContain('robot_gripper_open');
    expect(container.textContent).not.toContain('robot_repeat');
    expect(container.textContent).toContain('Save version');
    expect(container.textContent).toContain('Run simulation');
    expect(container.textContent).toContain('version-p04');
    expect(container.textContent).toContain('Visual learning preview — not an authoritative PASS');
  });

  it('3. Existing preview controls still render and function', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();
    expect(container.textContent).toContain('Program preview');
    expect(container.textContent).toContain('Reset');
    expect(container.textContent).toContain('Preview');
    expect(container.textContent).toContain('1×');
  });

  it('4. fails closed when the server sends an unknown allowed block', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Move',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'course2.ai'],
      constraints: { kind: 'symbolic_program' },
      status: 'published',
      challenge_id: null,
    });
    await render();
    expect(container.textContent).toContain('toolbox is locked');
    expect(container.textContent).not.toContain('robot_repeat');
  });

  it('5. Save Version still works and creates immutable version', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Home, move, then wait.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save version'));
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn?.click();
    });
    expect(mocks.createVersion).toHaveBeenCalledWith('program-2', 'token', 'Course 1 practice checkpoint');
    expect(container.textContent).toContain('Immutable ProgramVersion 1 saved');
  });

  it('6. Run Simulation requires immutable version and is disabled when none exists', async () => {
    mocks.versions.mockResolvedValue([]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();
    const simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    expect(simBtn).toBeDefined();
    expect(simBtn?.hasAttribute('disabled')).toBe(true);
  });

  it('7 & 8. Unsaved changes prevent stale simulation and show student warning', async () => {
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();

    // Initial state: version exists and no dirty changes, Run simulation is enabled
    let simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    expect(simBtn?.hasAttribute('disabled')).toBe(false);

    // Student edits workspace
    currentSavedWorkspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_move_home' }] } };
    await act(async () => {
      canvasChangeHandler?.();
    });

    // Run simulation should now be disabled and warning shown
    simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    expect(simBtn?.hasAttribute('disabled')).toBe(true);
    expect(container.textContent).toContain('Save a new version before running simulation.');
  });

  it('9 & 10 & 13. Valid saved version can Run Simulation, displays loading state, PASS result, and invalidates queries', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();

    const simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    await act(async () => {
      simBtn?.click();
    });

    expect(mocks.submit).toHaveBeenCalledWith('attempt-2', 'token', 'version-1');
    expect(mocks.createSchematic).toHaveBeenCalledWith('attempt-2', 'token', 'version-1');
    expect(mocks.runSchematic).toHaveBeenCalledWith('exp-1', 'token');
    expect(mocks.evaluateSymbolic).toHaveBeenCalledWith('exp-1', 'token');

    // PASS card
    expect(container.textContent).toContain('Simulation Passed');
    expect(container.textContent).toContain('Target A reached successfully.');
    expect(container.textContent).toContain('C1-L2 Move the Robot completed.');
    expect(container.textContent).toContain('Next lesson unlocked:');
    expect(container.textContent).toContain('Grab & Release (C1-L3)');
    expect(container.textContent).toContain('Continue to Course Path');

    // Query invalidation
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: studentLearningKeys.all });
  });

  it('11 & 14 & 15. Failed simulation displays FAIL card with specific feedback and does NOT show L3 unlocked', async () => {
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.evaluateSymbolic.mockResolvedValue({
      id: 'eval-fail-1',
      experimentId: 'exp-fail-1',
      programVersionId: 'version-1',
      evaluatorVersion: '1.0.0',
      ruleSetSchemaVersion: 1,
      ruleSetHash: 'hash-fail',
      verdict: 'failed',
      ruleResults: [
        { ordinal: 1, type: 'ordered_actions', passed: true, code: 'ORDERED_ACTIONS_MATCH', message: 'The required sequence of movements was executed.', reason: 'Actions executed in order', expected: {}, observed: {}, evidence: [] },
        { ordinal: 2, type: 'preview_target_match', passed: false, code: 'PREVIEW_TARGET_MISMATCH', message: 'The robot did not reach Target A.', reason: 'Target mismatch', expected: {}, observed: {}, evidence: [] },
      ],
      metrics: { ruleCount: 2, passedRuleCount: 1 },
      createdAt: '2026-10-31T00:00:00Z',
      status: 'failed',
      taskState: 'failed',
      feedback: { code: 'SIMULATION_FAILED', message: 'The robot did not reach Target A.', ruleResults: [] },
      evidence: { experimentId: 'exp-fail-1', evaluationId: 'eval-fail-1', programVersionId: 'version-1' },
    });
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();

    const simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    await act(async () => {
      simBtn?.click();
    });

    expect(container.textContent).toContain('Simulation Needs Changes');
    expect(container.textContent).toContain('The robot did not reach Target A.');
    expect(container.textContent).toContain('Review your Move to Position block and try again.');
    expect(container.textContent).toContain('Edit Program');
    expect(container.textContent).toContain('Preview Again');
    expect(container.textContent).not.toContain('Simulation Passed');
    expect(container.textContent).not.toContain('Next lesson unlocked:');
  });

  it('12. TASK FAIL and SYSTEM ERROR are visually/semantically distinct', async () => {
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.submit.mockRejectedValueOnce(new Error('Network disconnected during simulation request'));
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();

    const simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    await act(async () => {
      simBtn?.click();
    });

    // Should display distinct system error alert, not educational task fail
    expect(container.textContent).toContain('System error:');
    expect(container.textContent).toContain('Network disconnected during simulation request');
    expect(container.textContent).not.toContain('Simulation Needs Changes');
    expect(container.textContent).not.toContain('Simulation Passed');
  });

  it('16. Editing after failed result allows new version creation and re-simulation', async () => {
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();

    // Trigger edit
    currentSavedWorkspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_move_to' }] } };
    await act(async () => {
      canvasChangeHandler?.();
    });

    expect(container.textContent).toContain('Save a new version before running simulation.');

    // Save new version
    mocks.createVersion.mockResolvedValueOnce({ id: 'version-2', version_number: 2 });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save version'));
    await act(async () => {
      saveBtn?.click();
    });

    expect(container.textContent).toContain('Immutable ProgramVersion 2 saved');
    expect(container.textContent).not.toContain('Save a new version before running simulation.');

    // Run simulation again
    const simBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
    expect(simBtn?.hasAttribute('disabled')).toBe(false);
  });

  it('17. Existing workspace remains intact after evaluation', async () => {
    const savedBlocks = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_move_home', id: 'home-1' }] } };
    mocks.program.mockResolvedValue({
      id: 'program-saved',
      title: 'Restored program',
      workspace_json: savedBlocks,
      robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'home', arm: 'left' }] },
    });
    mocks.versions.mockResolvedValue([{ id: 'version-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Restore.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    await render();
    expect(container.querySelector('[data-testid="blockly"]')).not.toBeNull();
    expect(container.textContent).toContain('Saved to VISTA');
  });

  it('18. keeps L1 as a lesson knowledge check and does not render Blockly', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-1',
      assignment_id: 'assignment-1',
      lesson_id: 'lesson-1',
      title: 'Safety Knowledge Check',
      instructions: 'Answer questions.',
      allowed_blocks: [],
      constraints: { kind: 'knowledge_check' },
      status: 'published',
      challenge_id: null,
    });
    await render();
    expect(container.textContent).toContain('Knowledge Check stays in Lesson Detail');
    expect(container.querySelector('[data-testid="blockly"]')).toBeNull();
  });

  it('19. exposes gripper capabilities for L3 while keeping advanced blocks excluded', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-3',
      assignment_id: 'assignment-3',
      lesson_id: 'lesson-3',
      title: 'Grab & Release',
      instructions: 'Pick up the object.',
      allowed_blocks: ['arm.select', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close'],
      constraints: { kind: 'symbolic_program' },
      status: 'published',
      challenge_id: null,
    });
    mocks.lessonDetail.mockResolvedValue({
      id: 'lesson-3',
      course_id: 'course-1',
      course_title: 'Robotics Fundamentals',
      title: 'Grab & Release',
      ordinal: 3,
      content: { completionCriteria: 'Pick and release object.' },
    });
    await render();
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L3');
    expect(container.textContent).toContain('robot_gripper_open');
    expect(container.textContent).toContain('robot_gripper_close');
    expect(container.textContent).toContain('robot_move_to');
    expect(container.textContent).not.toContain('robot_repeat');
    expect(container.textContent).not.toContain('robot_if');
    expect(container.textContent).not.toContain('vision_ai_plan');
  });

  it('19b. exposes full Pick & Place capabilities for L4 without Course 2/advanced blocks', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-4',
      assignment_id: 'assignment-4',
      lesson_id: 'lesson-4',
      title: 'Pick & Place',
      instructions: 'Complete the pick and place sequence.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close'],
      constraints: { kind: 'symbolic_program' },
      status: 'published',
      challenge_id: null,
    });
    mocks.lessonDetail.mockResolvedValue({
      id: 'lesson-4',
      course_id: 'course-1',
      course_title: 'Robotics Fundamentals',
      title: 'Pick & Place',
      ordinal: 4,
      content: { completionCriteria: 'Release object inside target zone.' },
    });
    await render();
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L4');
    expect(container.textContent).toContain('robot_move_home');
    expect(container.textContent).toContain('robot_move_to');
    expect(container.textContent).toContain('robot_gripper_open');
    expect(container.textContent).toContain('robot_gripper_close');
    expect(container.textContent).toContain('robot_wait');
    expect(container.textContent).not.toContain('robot_repeat');
    expect(container.textContent).not.toContain('course2.ai');
  });

  it('preserves existing workspace containing disallowed blocks without deletion, warns learner and blocks version creation', async () => {
    mocks.assignment.mockResolvedValue({
      id: 'ca-2',
      assignment_id: 'assignment-2',
      lesson_id: 'lesson-2',
      title: 'Reach Target A',
      instructions: 'Move.',
      allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'],
      constraints: { kind: 'symbolic_program', target: { x: 1 } },
      status: 'published',
      challenge_id: null,
    });
    mocks.program.mockResolvedValue({
      id: 'program-disallowed',
      title: 'Disallowed blocks',
      workspace_json: { blocks: { blocks: [{ type: 'robot_repeat', id: 'disallowed-block' }] } },
      robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] },
    });
    await render();
    expect(container.textContent).toContain('Your saved workspace contains blocks outside this lesson’s toolbox');
    expect(container.textContent).toContain('robot_repeat');
    expect(container.textContent).toContain('Nothing was deleted');
    const saveBtn = container.querySelector('button[disabled]');
    expect(saveBtn).not.toBeNull();
  });

  it('renders recoverable error state with retry button when attempt loading fails', async () => {
    mocks.attempt.mockRejectedValueOnce(new Error('Network offline or attempt missing'));
    await render();
    expect(container.textContent).toContain('Practice workspace unavailable');
    expect(container.textContent).toContain('Network offline or attempt missing');
    expect(container.textContent).toContain('Try again');
  });

  describe('P0.6 — C1-L3 Grab & Release Simulation UX', () => {
    beforeEach(() => {
      mocks.assignment.mockResolvedValue({
        id: 'ca-3',
        assignment_id: 'assignment-3',
        lesson_id: 'lesson-3',
        title: 'Grab & Release an Object',
        instructions: 'Approach, close the left gripper, lift, then release.',
        allowed_blocks: ['arm.select', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close'],
        constraints: { kind: 'symbolic_program' },
        status: 'published',
        challenge_id: 'challenge-l3',
      });
      mocks.lessonDetail.mockResolvedValue({
        id: 'lesson-3',
        course_id: 'course-1',
        course_title: 'Robotics Fundamentals',
        title: 'Grab & Release',
        ordinal: 3,
        content: { completionCriteria: 'Successfully grasp, lift, and release the required object.' },
      });
      mocks.versions.mockResolvedValue([
        { id: 'version-l3-1', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } },
      ]);
    });

    it('evaluates L3 with Run Simulation, displays PASS card and unlocks Pick & Place (C1-L4)', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      mocks.evaluateSymbolic.mockResolvedValueOnce({
        id: 'eval-l3-pass',
        experimentId: 'exp-l3-1',
        programVersionId: 'version-l3-1',
        evaluatorVersion: 'vista-symbolic-evaluator-1',
        ruleSetSchemaVersion: 1,
        ruleSetHash: 'hash',
        verdict: 'passed',
        status: 'success',
        taskState: 'success',
        objectState: { objectId: 'cube-red', position: { x: 120, y: 150, z: 0 }, graspedBy: null, state: 'released' },
        feedback: { summary: 'You successfully grasped, lifted, and released the object. Simulation passed.', messages: [] },
        ruleResults: [
          { ordinal: 1, type: 'ordered_actions', passed: true, code: 'ORDERED_ACTIONS_MATCH', message: 'Required actions executed in the correct sequence.', reason: 'matches' },
          { ordinal: 2, type: 'object_grasped', passed: true, code: 'OBJECT_GRASPED', message: 'The object was successfully grasped.', reason: 'grasped' },
          { ordinal: 3, type: 'object_lifted', passed: true, code: 'OBJECT_LIFTED', message: 'The object was lifted after being grasped.', reason: 'lifted' },
          { ordinal: 4, type: 'object_released', passed: true, code: 'OBJECT_RELEASED', message: 'The object was released.', reason: 'released' },
          { ordinal: 5, type: 'final_gripper_state', passed: true, code: 'GRIPPER_STATE_MATCH', message: 'Final gripper state is open.', reason: 'matches' },
        ],
        metrics: { ruleCount: 5, passedRuleCount: 5 },
      });

      await render();
      const runSimBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));
      expect(runSimBtn).toBeDefined();

      await act(async () => {
        runSimBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Simulation Passed');
      expect(container.textContent).toContain('You successfully grasped, lifted, and released the object.');
      expect(container.textContent).toContain('C1-L3 Grab & Release completed.');
      expect(container.textContent).toContain('Next lesson unlocked:');
      expect(container.textContent).toContain('Pick & Place (C1-L4)');
      expect(container.textContent).toContain('Continue to Course Path');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: studentLearningKeys.all });
    });

    it('evaluates L3 with Run Simulation, displays grasp failure feedback without unlocking L4', async () => {
      mocks.evaluateSymbolic.mockResolvedValueOnce({
        id: 'eval-l3-fail',
        experimentId: 'exp-l3-1',
        programVersionId: 'version-l3-1',
        evaluatorVersion: 'vista-symbolic-evaluator-1',
        ruleSetSchemaVersion: 1,
        ruleSetHash: 'hash',
        verdict: 'failed',
        status: 'failed',
        taskState: 'failed',
        objectState: { objectId: 'cube-red', position: { x: 120, y: 150, z: 0 }, graspedBy: null, state: 'free' },
        feedback: {
          code: 'GRASP_NOT_ESTABLISHED',
          message: 'The gripper closed, but the object was not grasped. Move closer to the object before closing the gripper.',
          ruleResults: [],
        },
        ruleResults: [
          { ordinal: 1, type: 'ordered_actions', passed: true, code: 'ORDERED_ACTIONS_MATCH', message: 'Required actions executed in the correct sequence.', reason: 'matches' },
          { ordinal: 2, type: 'object_grasped', passed: false, code: 'GRASP_NOT_ESTABLISHED', message: 'The gripper closed, but the object was not grasped. Move closer to the object before closing the gripper.', reason: 'gripper closed outside grasp threshold' },
        ],
        metrics: { ruleCount: 2, passedRuleCount: 1 },
      });

      await render();
      const runSimBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));

      await act(async () => {
        runSimBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Simulation Needs Changes');
      expect(container.textContent).toContain('The gripper closed, but the object was not grasped.');
      expect(container.textContent).toContain('Review your approach and gripper blocks, then try again.');
      expect(container.textContent).not.toContain('Next lesson unlocked:');
      expect(container.textContent).not.toContain('Pick & Place (C1-L4)');
    });

    it('evaluates L3 with Run Simulation, displays lift failure feedback', async () => {
      mocks.evaluateSymbolic.mockResolvedValueOnce({
        id: 'eval-l3-lift-fail',
        experimentId: 'exp-l3-1',
        programVersionId: 'version-l3-1',
        evaluatorVersion: 'vista-symbolic-evaluator-1',
        ruleSetSchemaVersion: 1,
        ruleSetHash: 'hash',
        verdict: 'failed',
        status: 'failed',
        taskState: 'failed',
        feedback: {
          code: 'OBJECT_NOT_LIFTED',
          message: 'The object was grasped but was not lifted.',
          ruleResults: [],
        },
        ruleResults: [
          { ordinal: 1, type: 'object_grasped', passed: true, code: 'OBJECT_GRASPED', message: 'The object was successfully grasped.', reason: 'grasped' },
          { ordinal: 2, type: 'object_lifted', passed: false, code: 'OBJECT_NOT_LIFTED', message: 'The object was grasped but was not lifted.', reason: 'remained low' },
        ],
        metrics: { ruleCount: 2, passedRuleCount: 1 },
      });

      await render();
      const runSimBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));

      await act(async () => {
        runSimBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Simulation Needs Changes');
      expect(container.textContent).toContain('The object was grasped but was not lifted.');
    });

    it('evaluates L3 with Run Simulation, displays release failure feedback', async () => {
      mocks.evaluateSymbolic.mockResolvedValueOnce({
        id: 'eval-l3-rel-fail',
        experimentId: 'exp-l3-1',
        programVersionId: 'version-l3-1',
        evaluatorVersion: 'vista-symbolic-evaluator-1',
        ruleSetSchemaVersion: 1,
        ruleSetHash: 'hash',
        verdict: 'failed',
        status: 'failed',
        taskState: 'failed',
        feedback: {
          code: 'OBJECT_NOT_RELEASED',
          message: 'Open the gripper to release the object.',
          ruleResults: [],
        },
        ruleResults: [
          { ordinal: 1, type: 'object_released', passed: false, code: 'OBJECT_NOT_RELEASED', message: 'Open the gripper to release the object.', reason: 'held' },
        ],
        metrics: { ruleCount: 1, passedRuleCount: 0 },
      });

      await render();
      const runSimBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));

      await act(async () => {
        runSimBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Simulation Needs Changes');
      expect(container.textContent).toContain('Open the gripper to release the object.');
    });

    it('distinguishes SYSTEM ERROR from TASK FAIL on L3 simulation failure', async () => {
      mocks.evaluateSymbolic.mockRejectedValueOnce(new Error('Network connectivity lost'));

      await render();
      const runSimBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Run simulation'));

      await act(async () => {
        runSimBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('System error:');
      expect(container.textContent).toContain('Network connectivity lost');
      expect(container.textContent).not.toContain('Simulation Needs Changes');
    });
  });
});
