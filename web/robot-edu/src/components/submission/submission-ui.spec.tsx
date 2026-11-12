// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { session: { access_token: 'tok', user: { id: 'u1' } }, loading: false, sessionRevision: 0 },
  attemptGrading: vi.fn(), attemptFiles: vi.fn(), createAttemptFile: vi.fn(), completeAttemptFile: vi.fn(), removeAttemptFile: vi.fn(), attemptFileUrl: vi.fn(),
  attemptHistory: vi.fn(), detail: vi.fn(), createAttempt: vi.fn(), uploadToPresignedPost: vi.fn(),
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.session }));
vi.mock('../../lib/submissionUpload', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/submissionUpload')>()), uploadToPresignedPost: mocks.uploadToPresignedPost }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, attemptGrading: mocks.attemptGrading, attemptFiles: mocks.attemptFiles, createAttemptFile: mocks.createAttemptFile, completeAttemptFile: mocks.completeAttemptFile, removeAttemptFile: mocks.removeAttemptFile, attemptFileUrl: mocks.attemptFileUrl, attemptHistory: mocks.attemptHistory, createAttempt: mocks.createAttempt },
    assignmentApi: { ...actual.assignmentApi, detail: mocks.detail },
  };
});

import { AttachmentUploader } from './AttachmentUploader';
import { GradingFeedbackPanel } from './GradingFeedbackPanel';
import { StudentAssignmentDetail } from '../../pages/StudentAssignmentDetail';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

describe('D03 submission UI', () => {
  let root: Root; let container: HTMLDivElement;
  const render = async (ui: React.ReactElement, path = '/') => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={ui} /><Route path="/my-learning/:classroomAssignmentId" element={ui} /><Route path="/practice/:attemptId" element={<p>practice screen</p>} /></Routes></MemoryRouter></QueryClientProvider>); });
    await flush();
  };
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  describe('GradingFeedbackPanel', () => {
    it('shows only an awaiting-review notice before release (no score, rubric or feedback)', async () => {
      mocks.attemptGrading.mockResolvedValue({ attemptId: 'a1', released: false });
      await render(<GradingFeedbackPanel attemptId="a1" token="tok" submitted />);
      expect(container.textContent).toContain('Awaiting review');
      expect(container.textContent).not.toMatch(/Grade received|Safety|feedback text/i);
    });
    it('shows the grade, rubric rows and feedback once released', async () => {
      mocks.attemptGrading.mockResolvedValue({ attemptId: 'a1', released: true, releasedAt: '2026-11-12T10:00:00Z', score: null,
        assessment: { overallFeedback: 'Well done', reviewedAt: null, scores: [{ criterionId: 'c1', title: 'Safety', maxPoints: 10, awardedPoints: 8, comment: 'good stop' }] },
        feedback: [{ id: 'f1', feedbackType: 'comment', content: 'feedback text', createdAt: '2026-11-12T10:00:00Z' }] });
      await render(<GradingFeedbackPanel attemptId="a1" token="tok" submitted />);
      expect(container.textContent).toContain('Grade received');
      expect(container.querySelector('[aria-label="Score 8 out of 10"]')).not.toBeNull();
      expect(container.textContent).toContain('Well done'); expect(container.textContent).toContain('Safety'); expect(container.textContent).toContain('feedback text');
    });
    it('does not even request grading for an attempt that is not submitted', async () => {
      await render(<GradingFeedbackPanel attemptId="a1" token="tok" submitted={false} />);
      expect(mocks.attemptGrading).not.toHaveBeenCalled();
    });
    it('surfaces a load failure instead of an empty grade', async () => {
      mocks.attemptGrading.mockRejectedValue(new Error('boom'));
      await render(<GradingFeedbackPanel attemptId="a1" token="tok" submitted />);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    });
  });

  describe('AttachmentUploader', () => {
    const pdf = (over: Record<string, unknown> = {}) => ({ id: 'f1', attempt_id: 'a1', original_filename: 'report.pdf', mime_type: 'application/pdf', size_bytes: 2048, status: 'ready', created_at: '', ...over });
    it('lists files with download and remove while the attempt is open', async () => {
      mocks.attemptFiles.mockResolvedValue([pdf()]);
      await render(<AttachmentUploader attemptId="a1" token="tok" readOnly={false} />);
      expect(container.textContent).toContain('report.pdf'); expect(container.textContent).toContain('1 of 5 files');
      expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Download', 'Remove', 'Choose file']));
    });
    it('is read-only for a submitted attempt: download only, no upload or remove controls', async () => {
      mocks.attemptFiles.mockResolvedValue([pdf()]);
      await render(<AttachmentUploader attemptId="a1" token="tok" readOnly />);
      const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
      expect(labels).toContain('Download'); expect(labels).not.toContain('Remove'); expect(labels).not.toContain('Choose file');
    });
    it('rejects an unapproved file type before contacting the server', async () => {
      mocks.attemptFiles.mockResolvedValue([]);
      await render(<AttachmentUploader attemptId="a1" token="tok" readOnly={false} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'tool.exe', { type: 'application/x-msdownload' })], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();
      expect(mocks.createAttemptFile).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('not accepted');
    });
    it('uploads with a signed post, then asks the server to verify the file', async () => {
      mocks.attemptFiles.mockResolvedValue([]);
      mocks.createAttemptFile.mockResolvedValue({ file: pdf({ status: 'pending' }), upload: { url: 'https://s3.invalid', fields: { key: 'k' } } });
      mocks.uploadToPresignedPost.mockResolvedValue(undefined); mocks.completeAttemptFile.mockResolvedValue(pdf());
      await render(<AttachmentUploader attemptId="a1" token="tok" readOnly={false} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' })], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();
      expect(mocks.createAttemptFile).toHaveBeenCalledWith('a1', 'tok', { filename: 'report.pdf', contentType: 'application/pdf', sizeBytes: 8 });
      expect(mocks.uploadToPresignedPost).toHaveBeenCalled();
      expect(mocks.completeAttemptFile).toHaveBeenCalledWith('a1', 'f1', 'tok');
      expect(mocks.removeAttemptFile).not.toHaveBeenCalled();
    });
    it('removes the pending record when the browser upload fails', async () => {
      mocks.attemptFiles.mockResolvedValue([]);
      mocks.createAttemptFile.mockResolvedValue({ file: pdf({ status: 'pending' }), upload: { url: 'https://s3.invalid', fields: {} } });
      mocks.uploadToPresignedPost.mockRejectedValue(new Error('The file could not be uploaded. Please try again.')); mocks.removeAttemptFile.mockResolvedValue({ id: 'f1', status: 'removed' });
      await render(<AttachmentUploader attemptId="a1" token="tok" readOnly={false} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' })], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();
      expect(mocks.completeAttemptFile).not.toHaveBeenCalled();
      expect(mocks.removeAttemptFile).toHaveBeenCalledWith('a1', 'f1', 'tok');
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be uploaded');
    });
  });

  describe('StudentAssignmentDetail', () => {
    const item = (over: Record<string, unknown> = {}) => ({ id: 'ca1', classroom_id: 'c', assignment_id: 'as', lesson_id: 'l', lesson_title: 'Lesson 4', challenge_id: null, title: 'Pick and place', instructions: 'Build the program', status: 'published', constraints: { kind: 'symbolic_program' }, due_at: null, available_from: null, close_at: null, max_attempts: 3, ...over });
    const attempt = (over: Record<string, unknown> = {}) => ({ id: 'a1', classroom_assignment_id: 'ca1', attempt_number: 1, status: 'submitted', started_at: '2026-11-01T10:00:00Z', submitted_at: '2026-11-02T10:00:00Z', score: null, passed: null, has_draft: false, draft_saved_at: null, grading_released: false, grading_released_at: null, submission_id: 's1', submission_origin: 'original', file_count: 0, ...over });
    const open = () => render(<StudentAssignmentDetail />, '/my-learning/ca1');

    it('shows type, window, attempts used and every attempt with its own state', async () => {
      mocks.detail.mockResolvedValue(item());
      mocks.attemptHistory.mockResolvedValue([attempt({ id: 'a2', attempt_number: 2, grading_released: true, grading_released_at: '2026-11-03T10:00:00Z' }), attempt()]);
      await open();
      expect(container.textContent).toContain('Programming assignment'); expect(container.textContent).toContain('Pick and place');
      expect(container.textContent).toContain('2 of 3 used'); expect(container.textContent).toContain('Attempt 2'); expect(container.textContent).toContain('Graded');
      expect(container.textContent).toContain('Submitted · awaiting review');
      expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toContain('Start a new attempt');
    });
    it('resumes an open attempt instead of starting another', async () => {
      mocks.detail.mockResolvedValue(item());
      mocks.attemptHistory.mockResolvedValue([attempt({ id: 'a9', status: 'in_progress', submission_id: null, submitted_at: null, has_draft: true })]);
      await open();
      const primary = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Continue attempt')!;
      await act(async () => { primary.click(); });
      expect(container.textContent).toContain('practice screen');
      expect(mocks.createAttempt).not.toHaveBeenCalled();
    });
    it('starts a new attempt and opens the existing practice workspace', async () => {
      mocks.detail.mockResolvedValue(item({ max_attempts: null }));
      mocks.attemptHistory.mockResolvedValue([]);
      mocks.createAttempt.mockResolvedValue({ id: 'new1', status: 'in_progress' });
      await open();
      const primary = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Start attempt')!;
      await act(async () => { primary.click(); });
      await flush();
      expect(mocks.createAttempt).toHaveBeenCalledWith('ca1', 'tok');
      expect(container.textContent).toContain('practice screen');
    });
    it('blocks starting when the maximum attempts are used or the delivery is closed', async () => {
      mocks.detail.mockResolvedValue(item({ max_attempts: 1 })); mocks.attemptHistory.mockResolvedValue([attempt()]);
      await open();
      const blocked = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Maximum attempts reached.') as HTMLButtonElement;
      expect(blocked.disabled).toBe(true);
    });
    it('labels a closed assignment and never offers a start button', async () => {
      mocks.detail.mockResolvedValue(item({ close_at: '2020-01-01T00:00:00Z' })); mocks.attemptHistory.mockResolvedValue([]);
      await open();
      expect(container.textContent).toContain('Closed'); expect([...container.querySelectorAll('button')].every((b) => b.textContent !== 'Start attempt')).toBe(true);
    });
    it('marks a reconstructed historical attempt', async () => {
      mocks.detail.mockResolvedValue(item({ max_attempts: null })); mocks.attemptHistory.mockResolvedValue([attempt({ submission_origin: 'reconstructed' })]);
      await open();
      expect(container.textContent).toContain('Rebuilt from history');
    });
    it('shows an unavailable state instead of crashing when the assignment cannot be loaded', async () => {
      mocks.detail.mockRejectedValue(new Error('Assignment was not found.')); mocks.attemptHistory.mockResolvedValue([]);
      await open();
      expect(container.textContent).toContain('Assignment unavailable');
    });
    it('reveals read-only attachments and the grading panel when a finished attempt is expanded', async () => {
      mocks.detail.mockResolvedValue(item()); mocks.attemptHistory.mockResolvedValue([attempt({ file_count: 1 })]);
      mocks.attemptFiles.mockResolvedValue([{ id: 'f1', attempt_id: 'a1', original_filename: 'report.pdf', mime_type: 'application/pdf', size_bytes: 10, status: 'ready', created_at: '' }]);
      mocks.attemptGrading.mockResolvedValue({ attemptId: 'a1', released: false });
      await open();
      const toggle = [...container.querySelectorAll('button')].find((b) => b.textContent === 'View details')!;
      await act(async () => { toggle.click(); }); await flush();
      expect(container.textContent).toContain('report.pdf'); expect(container.textContent).toContain('Awaiting review');
      expect([...container.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Remove');
    });
  });
});
