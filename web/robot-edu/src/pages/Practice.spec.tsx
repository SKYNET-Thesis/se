// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Practice } from './Practice';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'token', user: { id: 'student' } },
  attempt: vi.fn(), assignment: vi.fn(), program: vi.fn(), lessonDetail: vi.fn(),
  versions: vi.fn(), submissions: vi.fn(), experiments: vi.fn(), evaluations: vi.fn(), objects: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: mocks.session }) }));
vi.mock('../components/studio/BlocklyCanvas', () => ({ BlocklyCanvas: ({ toolbox }: { toolbox: unknown }) => <div data-testid="blockly">Blockly workspace {JSON.stringify(toolbox)}</div> }));
vi.mock('../components/studio/So101Viewer3D', () => ({ So101Viewer3D: () => <div data-testid="so101">SO-101 viewer</div> }));
vi.mock('../lib/robotExecution', () => ({ createRobotExecutionClient: () => ({ getRobotStatus: vi.fn(), restoreExecution: vi.fn() }) }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, attempt: mocks.attempt, program: mocks.program, versions: mocks.versions, submissions: mocks.submissions, experiments: mocks.experiments, symbolicEvaluations: mocks.evaluations },
    assignmentApi: { ...actual.assignmentApi, detail: mocks.assignment },
    catalogApi: { ...actual.catalogApi, lessonDetail: mocks.lessonDetail, challengeObjects: mocks.objects },
  };
});

describe('Course 1 Practice integration', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); vi.clearAllMocks();
    mocks.attempt.mockResolvedValue({ id: 'attempt-2', classroom_assignment_id: 'ca-2', status: 'in_progress' });
    mocks.program.mockResolvedValue({ id: 'program-2', title: 'L2 program', workspace_json: { blocks: { blocks: [] } }, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } });
    mocks.versions.mockResolvedValue([]); mocks.submissions.mockResolvedValue([]); mocks.experiments.mockResolvedValue([]); mocks.evaluations.mockResolvedValue([]); mocks.objects.mockResolvedValue([]);
    mocks.lessonDetail.mockResolvedValue({ id: 'lesson-2', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, content: { completionCriteria: 'Reach Target A with the required sequence.' } });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={['/practice/attempt-2']}><Routes><Route path="/practice/:attemptId" element={<Practice mode="learning" />} /></Routes></MemoryRouter>); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  it('renders the existing Blockly and SO-101 preview with server-driven L2 blocks', async () => {
    mocks.versions.mockResolvedValueOnce([{ id: 'version-p04', version_number: 1, robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [] } }]);
    mocks.assignment.mockResolvedValue({ id: 'ca-2', assignment_id: 'assignment-2', lesson_id: 'lesson-2', title: 'Reach Target A', instructions: 'Home, move, then wait.', allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'], constraints: { kind: 'symbolic_program', target: { x: 1 } }, status: 'published', challenge_id: null });
    await render();
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L2');
    expect(container.querySelector('[data-testid="blockly"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="so101"]')).not.toBeNull();
    expect(container.textContent).toContain('robot_move_home');
    expect(container.textContent).toContain('robot_move_to');
    expect(container.textContent).not.toContain('robot_gripper_open');
    expect(container.textContent).not.toContain('robot_repeat');
    expect(container.textContent).toContain('Save version');
    expect(container.textContent).not.toContain('Submit & evaluate');
    expect(container.textContent).toContain('version-p04');
    expect(container.textContent).toContain('Visual learning preview — not an authoritative PASS');
  });

  it('fails closed when the server sends an unknown allowed block', async () => {
    mocks.assignment.mockResolvedValue({ id: 'ca-2', assignment_id: 'assignment-2', lesson_id: 'lesson-2', title: 'Move', instructions: 'Move.', allowed_blocks: ['arm.select', 'course2.ai'], constraints: { kind: 'symbolic_program' }, status: 'published', challenge_id: null });
    await render();
    expect(container.textContent).toContain('toolbox is locked');
    expect(container.textContent).not.toContain('robot_repeat');
  });

  it('keeps L1 as a lesson knowledge check and does not render Blockly', async () => {
    mocks.assignment.mockResolvedValue({ id: 'ca-1', assignment_id: 'assignment-1', lesson_id: 'lesson-1', title: 'Safety Knowledge Check', instructions: 'Answer questions.', allowed_blocks: [], constraints: { kind: 'knowledge_check' }, status: 'published', challenge_id: null });
    await render();
    expect(container.textContent).toContain('Knowledge Check stays in Lesson Detail');
    expect(container.querySelector('[data-testid="blockly"]')).toBeNull();
  });

  it('exposes gripper capabilities for L3 while keeping advanced blocks excluded', async () => {
    mocks.assignment.mockResolvedValue({ id: 'ca-3', assignment_id: 'assignment-3', lesson_id: 'lesson-3', title: 'Grab & Release', instructions: 'Pick up the object.', allowed_blocks: ['arm.select', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close'], constraints: { kind: 'symbolic_program' }, status: 'published', challenge_id: null });
    mocks.lessonDetail.mockResolvedValue({ id: 'lesson-3', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Grab & Release', ordinal: 3, content: { completionCriteria: 'Pick and release object.' } });
    await render();
    expect(container.textContent).toContain('Robotics Fundamentals · C1-L3');
    expect(container.textContent).toContain('robot_gripper_open');
    expect(container.textContent).toContain('robot_gripper_close');
    expect(container.textContent).toContain('robot_move_to');
    expect(container.textContent).not.toContain('robot_repeat');
    expect(container.textContent).not.toContain('robot_if');
    expect(container.textContent).not.toContain('vision_ai_plan');
  });

  it('exposes full Pick & Place capabilities for L4 without Course 2/advanced blocks', async () => {
    mocks.assignment.mockResolvedValue({ id: 'ca-4', assignment_id: 'assignment-4', lesson_id: 'lesson-4', title: 'Pick & Place', instructions: 'Complete the pick and place sequence.', allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'gripper.open', 'wait', 'gripper.close'], constraints: { kind: 'symbolic_program' }, status: 'published', challenge_id: null });
    mocks.lessonDetail.mockResolvedValue({ id: 'lesson-4', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Pick & Place', ordinal: 4, content: { completionCriteria: 'Release object inside target zone.' } });
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
    mocks.assignment.mockResolvedValue({ id: 'ca-2', assignment_id: 'assignment-2', lesson_id: 'lesson-2', title: 'Reach Target A', instructions: 'Move.', allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'], constraints: { kind: 'symbolic_program', target: { x: 1 } }, status: 'published', challenge_id: null });
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

  it('restores saved workspace on reload and continue practice', async () => {
    const savedBlocks = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_move_home', id: 'home-1' }] } };
    mocks.program.mockResolvedValue({
      id: 'program-saved',
      title: 'Restored program',
      workspace_json: savedBlocks,
      robot_program: { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'home', arm: 'left' }] },
    });
    mocks.assignment.mockResolvedValue({ id: 'ca-2', assignment_id: 'assignment-2', lesson_id: 'lesson-2', title: 'Reach Target A', instructions: 'Restore.', allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'], constraints: { kind: 'symbolic_program', target: { x: 1 } }, status: 'published', challenge_id: null });
    await render();
    expect(container.querySelector('[data-testid="blockly"]')).not.toBeNull();
    expect(container.textContent).toContain('Saved to VISTA');
  });

  it('renders recoverable error state with retry button when attempt loading fails', async () => {
    mocks.attempt.mockRejectedValueOnce(new Error('Network offline or attempt missing'));
    await render();
    expect(container.textContent).toContain('Practice workspace unavailable');
    expect(container.textContent).toContain('Network offline or attempt missing');
    expect(container.textContent).toContain('Try again');
  });
});
