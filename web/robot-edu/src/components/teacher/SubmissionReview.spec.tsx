// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { session: { access_token: 'tok', user: { id: 't1' } }, loading: false, sessionRevision: 0 },
  submission: vi.fn(), assess: vi.fn(), release: vi.fn(), feedback: vi.fn(), attemptFiles: vi.fn(), submissions: vi.fn(), teachingClassrooms: vi.fn(), list: vi.fn(),
  canvasState: vi.fn(),
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.session }));
vi.mock('../studio/BlocklyCanvas', () => ({ BlocklyCanvas: (props: { initialState: unknown; readOnly?: boolean }) => { mocks.canvasState(props.initialState, props.readOnly); return <div data-testid="canvas" />; } }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    instructorApi: { ...actual.instructorApi, submission: mocks.submission, assess: mocks.assess, releaseGrading: mocks.release, feedback: mocks.feedback, attemptFiles: mocks.attemptFiles, submissions: mocks.submissions, teachingClassrooms: mocks.teachingClassrooms },
    assignmentApi: { ...actual.assignmentApi, list: mocks.list },
  };
});

import { SubmissionReviewDetail, formatStepParameters } from './SubmissionReviewDetail';
import { TeacherSubmissions } from '../../pages/teacher/TeacherSubmissions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const detail = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1', assignment_id: 'a1', learner_user_id: 'u1', status: 'submitted', submitted_at: '2026-11-13T01:00:00Z', origin: 'original', full_name: 'VISTA Demo Student', email: 's@example.test', assignment_title: 'Gripper',
  attempt: { id: 'att-1', attemptNumber: 1, gradingReleasedAt: null },
  program_version: { id: 'pv-1', versionNumber: 3, workspaceJson: { blocks: { marker: 'SUBMITTED' } }, robotProgram: { steps: [{ type: 'gripper.open' }, { type: 'wait', durationMs: 100 }] }, validationResult: {}, createdAt: '2026-11-13T00:50:00Z' },
  experiment: null, experiments: [], symbolic_evaluation: null, assessment: null, feedback: [],
  rubric_criteria: [{ id: 'c1', title: 'Sequence correct', description: null, maxPoints: '10.00', ordinal: 1 }], ...over,
});

let container: HTMLDivElement; let root: Root;
const mount = async (ui: React.ReactElement) => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/teacher/submissions']}>{ui}</MemoryRouter></QueryClientProvider>); }); await flush(); };
const button = (name: string) => [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === name) as HTMLButtonElement | undefined;
const typeInto = async (el: HTMLInputElement, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); };

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.attemptFiles.mockResolvedValue([]); mocks.assess.mockResolvedValue([]); mocks.release.mockResolvedValue({ attemptId: 'att-1', released: true, releasedAt: 'x' }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe('SubmissionReviewDetail', () => {
  it('shows the submitted ProgramVersion read-only and keeps Save Assessment and Release Grade separate', async () => {
    mocks.submission.mockResolvedValue(detail());
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect(mocks.canvasState).toHaveBeenCalledWith({ blocks: { marker: 'SUBMITTED' } }, true);
    expect(container.textContent).toContain('Version 3'); expect(container.textContent).toContain('gripper.open');
    expect(button('Release Grade')!.disabled).toBe(true); // nothing saved yet

    await typeInto(container.querySelector('input[aria-label="Score for Sequence correct"]')!, '11');
    await act(async () => { button('Save Assessment')!.click(); });
    expect(mocks.assess).not.toHaveBeenCalled(); // above the maximum
    expect(container.textContent).toContain('The maximum is 10');

    await typeInto(container.querySelector('input[aria-label="Score for Sequence correct"]')!, '8');
    await act(async () => { button('Save Assessment')!.click(); });
    await flush();
    expect(mocks.assess).toHaveBeenCalledWith('sub-1', 'tok', { overallFeedback: undefined, scores: [{ criterionId: 'c1', awardedPoints: 8, comment: undefined }] });
    expect(mocks.release).not.toHaveBeenCalled(); // saving never releases
  });

  it('shows every submitted parameter (including nested ones), the version details and the frozen-copy source', async () => {
    mocks.submission.mockResolvedValue(detail({ program_version: { id: 'abcdef12-0000-4000-8000-000000000000', versionNumber: 7, snapshotSource: 'submission', workspaceJson: { blocks: {} }, robotProgram: { steps: [{ type: 'arm.select', arm: 'left' }, { type: 'preview.move_xyz', arm: 'left', position: { x: 240, y: 220, z: 120 } }, { type: 'wait', durationMs: 1000 }] }, validationResult: { valid: true }, changeSummary: 'checkpoint', createdAt: '2026-11-13T00:50:00Z' } }));
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    const steps = container.querySelector('[aria-label="Program steps and parameters"]')!.textContent!;
    expect(steps).toContain('arm: left'); expect(steps).toContain('position: {x: 240, y: 220, z: 120}'); expect(steps).toContain('durationMs: 1000');
    const meta = container.querySelector('[aria-label="Program version details"]')!.textContent!;
    expect(meta).toContain('#7'); expect(meta).toContain('abcdef12'); expect(meta).toContain('Valid'); expect(meta).toContain('checkpoint');
    expect(container.textContent).toContain('frozen on the submission'); expect(container.textContent).toContain('Frozen at submission');
  });

  it('is honest when an older submission only has the saved version, and when nothing was recorded', async () => {
    mocks.submission.mockResolvedValue(detail());
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect(container.textContent).toContain('no frozen copy');
    expect(formatStepParameters({ type: 'wait', durationMs: 100 })).toBe('durationMs: 100'); expect(formatStepParameters({ type: 'home' })).toBe('');
    mocks.submission.mockResolvedValue(detail({ program_version: null }));
    await act(async () => root.unmount()); root = createRoot(container);
    await mount(<SubmissionReviewDetail submissionId="sub-2" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect(container.textContent).toContain('No ProgramVersion was recorded'); expect(container.querySelector('[data-testid="readonly-blockly"]')).toBeNull();
  });

  it('enables release only after an assessment exists, asks for confirmation, then calls the release endpoint once', async () => {
    mocks.submission.mockResolvedValue(detail({ assessment: { id: 'as1', overallFeedback: 'Nice', reviewedAt: '2026-11-13T02:00:00Z', scores: [{ criterionId: 'c1', awardedPoints: 9, comment: null }] } }));
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect((container.querySelector('input[aria-label="Score for Sequence correct"]') as HTMLInputElement).value).toBe('9');
    expect(button('Release Grade')!.disabled).toBe(false);
    await act(async () => { button('Release Grade')!.click(); });
    expect(mocks.release).not.toHaveBeenCalled(); // confirmation first
    await act(async () => { [...document.querySelectorAll('button')].find((el) => el.textContent === 'Release Grade' && el.hasAttribute('data-autofocus'))!.click(); });
    await flush();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('locks scores once the grade is released', async () => {
    mocks.submission.mockResolvedValue(detail({ attempt: { id: 'att-1', attemptNumber: 1, gradingReleasedAt: '2026-11-13T03:00:00Z' }, assessment: { id: 'as1', overallFeedback: null, reviewedAt: '2026-11-13T02:00:00Z', scores: [{ criterionId: 'c1', awardedPoints: 9, comment: null }] } }));
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect((container.querySelector('input[aria-label="Score for Sequence correct"]') as HTMLInputElement).disabled).toBe(true);
    expect(button('Release Grade')!.disabled).toBe(true); expect(button('Save Assessment')!.disabled).toBe(true);
    expect(container.textContent).toContain('locked');
  });

  it('explains when an assignment has no rubric instead of showing empty score fields', async () => {
    mocks.submission.mockResolvedValue(detail({ rubric_criteria: [] }));
    await mount(<SubmissionReviewDetail submissionId="sub-1" token="tok" classroomId="c1" allSubmissions={[]} onSelect={() => undefined} />);
    expect(container.textContent).toContain('no rubric criteria'); expect(container.querySelector('input[aria-label^="Score for"]')).toBeNull();
  });
});

describe('TeacherSubmissions list', () => {
  it('shows summary counts and no grading fields until a submission is opened', async () => {
    mocks.teachingClassrooms.mockResolvedValue([{ id: 'c1', name: 'Robotics Class A', student_count: 2 }]);
    mocks.list.mockResolvedValue([{ id: 'ca1', assignment_id: 'a1', title: 'Gripper', status: 'published' }]);
    mocks.submissions.mockResolvedValue([
      { id: 's1', assignment_id: 'a1', learner_user_id: 'u1', status: 'submitted', submitted_at: '2026-11-13T01:00:00Z', attempt_number: 1, full_name: 'VISTA Demo Student', review_status: 'unreviewed', assignment_title: 'Gripper' },
      { id: 's2', assignment_id: 'a1', learner_user_id: 'u2', status: 'submitted', submitted_at: '2026-11-13T01:10:00Z', attempt_number: 1, full_name: 'Other', review_status: 'assessed', grading_released_at: '2026-11-13T02:00:00Z', assignment_title: 'Gripper' },
    ]);
    await mount(<TeacherSubmissions />);
    const summary = container.querySelector('[aria-label="Submission summary"]')!.textContent!;
    expect(summary).toContain('Total submitted2'); expect(summary).toContain('Awaiting assessment1'); expect(summary).toContain('Released1');
    expect(container.textContent).toContain('VISTA Demo Student');
    expect(button('Save Assessment')).toBeUndefined(); expect(button('Release Grade')).toBeUndefined(); expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('No submission selected');
  });

  it('asks for a classroom when none is selected', async () => {
    mocks.teachingClassrooms.mockResolvedValue([{ id: 'c1', name: 'A', student_count: 1 }, { id: 'c2', name: 'B', student_count: 1 }]);
    await mount(<TeacherSubmissions />);
    expect(container.textContent).toContain('Select a classroom'); expect(mocks.submissions).not.toHaveBeenCalled();
  });
});
