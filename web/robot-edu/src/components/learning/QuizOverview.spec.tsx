// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { session: { access_token: 'tok', user: { id: 'u1' } }, loading: false, sessionRevision: 0 },
  detail: vi.fn(), attemptHistory: vi.fn(), createAttempt: vi.fn(), lessonDetail: vi.fn(),
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.session }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    learnerApi: { ...actual.learnerApi, attemptHistory: mocks.attemptHistory, createAttempt: mocks.createAttempt },
    assignmentApi: { ...actual.assignmentApi, detail: mocks.detail },
    catalogApi: { ...actual.catalogApi, lessonDetail: mocks.lessonDetail },
  };
});

import { ApiError } from '../../lib/api';
import { StudentAssignmentDetail } from '../../pages/StudentAssignmentDetail';
import { QuizResultActions } from './QuizResultActions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const quiz = (over: Record<string, unknown> = {}) => ({ id: 'ca1', classroom_id: 'c', assignment_id: 'as', lesson_id: 'l2', lesson_title: 'Move the robot', challenge_id: null, title: 'Movement basics', instructions: 'Five questions about moving the arm.', status: 'published', constraints: { kind: 'knowledge_check', passPercent: 80 }, due_at: null, available_from: null, close_at: null, max_attempts: 2, ...over });
const attempt = (over: Record<string, unknown> = {}) => ({ id: 'a1', classroom_assignment_id: 'ca1', attempt_number: 1, status: 'evaluated', started_at: '2026-11-10T10:00:00Z', submitted_at: '2026-11-10T10:20:00Z', score: 60, passed: false, has_draft: false, draft_saved_at: null, grading_released: true, grading_released_at: '2026-11-10T10:20:00Z', submission_id: null, submission_origin: null, file_count: 0, ...over });

describe('A06 quiz page (/my-learning/:classroomAssignmentId)', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.lessonDetail.mockResolvedValue({ id: 'l2', course_id: 'co1', course_title: 'Robotics Foundations', title: 'Move the robot' });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const open = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/my-learning/ca1']}><Routes><Route path="/my-learning/:classroomAssignmentId" element={<StudentAssignmentDetail />} /><Route path="/practice/:attemptId" element={<p>attempt player</p>} /></Routes></MemoryRouter></QueryClientProvider>); });
    await flush();
  };
  const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());

  it('shows the quiz in its learning context with pass mark, attempts and one Start action', async () => {
    mocks.detail.mockResolvedValue(quiz({ due_at: '2099-01-10T10:00:00Z', close_at: '2099-01-11T10:00:00Z' })); mocks.attemptHistory.mockResolvedValue([]);
    await open();
    expect([...container.querySelectorAll('nav[aria-label="Breadcrumb"] a')].map((a) => a.getAttribute('href'))).toEqual(['/my-learning?tab=quizzes', '/courses/co1', '/courses/co1/lessons/l2']);
    expect(container.querySelector('h1')?.textContent).toBe('Movement basics');
    expect(container.textContent).toMatch(/Due .*, closes /);
    expect(container.textContent).toContain('80%'); expect(container.textContent).toContain('Attempts0 of 2 used');
    expect(buttons()).toEqual(['Start quiz']);
  });

  it('starts an attempt once, even when pressed twice, and opens the player', async () => {
    mocks.detail.mockResolvedValue(quiz()); mocks.attemptHistory.mockResolvedValue([]);
    let resolve: (value: unknown) => void = () => undefined;
    mocks.createAttempt.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await open();
    const start = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start quiz') as HTMLButtonElement;
    await act(async () => { start.click(); start.click(); });
    expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ id: 'new1', status: 'in_progress' }); }); await flush();
    expect(container.textContent).toContain('attempt player');
  });

  it('resumes the open attempt instead of creating another', async () => {
    mocks.detail.mockResolvedValue(quiz()); mocks.attemptHistory.mockResolvedValue([attempt({ id: 'a2', attempt_number: 2, status: 'in_progress', submitted_at: null, score: null, passed: null, has_draft: true }), attempt()]);
    await open();
    expect(container.textContent).toContain('answers saved');
    await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Continue quiz') as HTMLButtonElement).click(); }); await flush();
    expect(mocks.createAttempt).not.toHaveBeenCalled();
    expect(container.textContent).toContain('attempt player');
  });

  it('offers Try again after a failed attempt while attempts remain, with the latest result', async () => {
    mocks.detail.mockResolvedValue(quiz()); mocks.attemptHistory.mockResolvedValue([attempt()]);
    await open();
    expect(buttons()).toEqual(['Try again']);
    expect(container.textContent).toContain('Your best score so far is 60%. You need 80% to pass.');
    expect(container.querySelector('a[aria-label="View result of attempt 1"]')?.getAttribute('href')).toBe('/practice/a1');
  });

  it('says why a quiz cannot be taken: attempts used, scheduled or closed', async () => {
    mocks.detail.mockResolvedValue(quiz({ max_attempts: 1 })); mocks.attemptHistory.mockResolvedValue([attempt()]);
    await open();
    expect(container.textContent).toContain('You’ve used your only attempt.'); expect(buttons()).toEqual([]);
    expect([...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Back to course'))?.getAttribute('href')).toBe('/courses/co1'); // the next useful step
    act(() => root.unmount()); root = createRoot(container);
    mocks.detail.mockResolvedValue(quiz({ available_from: '2099-01-01T08:00:00Z' })); mocks.attemptHistory.mockResolvedValue([]);
    await open();
    expect(container.textContent).toMatch(/Opens /); expect(container.textContent).toContain('This quiz isn’t open yet.'); expect(buttons()).toEqual([]);
    act(() => root.unmount()); root = createRoot(container);
    mocks.detail.mockResolvedValue(quiz({ close_at: '2020-01-01T08:00:00Z' })); mocks.attemptHistory.mockResolvedValue([]);
    await open();
    expect(container.textContent).toContain('This quiz is closed.'); expect(buttons()).toEqual([]);
  });

  it('reports a refused start in plain words and does not retry by itself', async () => {
    mocks.detail.mockResolvedValue(quiz()); mocks.attemptHistory.mockResolvedValue([]);
    mocks.createAttempt.mockRejectedValue(new ApiError(404, 'Assignment was not found.'));
    await open();
    await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start quiz') as HTMLButtonElement).click(); }); await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/can’t be started right now/);
    expect(container.textContent).not.toContain('Assignment was not found.');
    expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('shows an unavailable state for a quiz the student may not open', async () => {
    mocks.detail.mockRejectedValue(new ApiError(404, 'Assignment was not found.')); mocks.attemptHistory.mockResolvedValue([]);
    await open();
    expect(container.textContent).toContain('Assignment unavailable');
    expect(container.textContent).not.toContain('Assignment was not found.');
  });

  it('sends a lesson knowledge check back to its lesson instead of starting an attempt here', async () => {
    mocks.detail.mockResolvedValue(quiz({ constraints: { kind: 'knowledge_check', questions: [{ id: 'q1', prompt: 'x', options: ['a', 'b'] }] } })); mocks.attemptHistory.mockResolvedValue([]);
    await open();
    expect([...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Open in lesson'))?.getAttribute('href')).toBe('/courses/co1/lessons/l2/activities/l2-knowledge-check');
    expect(buttons()).toEqual([]);
  });

  it('says Practice again once the quiz is passed and a retake is still allowed', async () => {
    mocks.detail.mockResolvedValue(quiz({ max_attempts: 3 })); mocks.attemptHistory.mockResolvedValue([attempt({ score: 90, passed: true })]);
    await open();
    expect(container.textContent).toContain('Quiz status: Passed with 90%');
    expect(buttons()).toEqual(['Practice again']);
  });

  describe('result actions', () => {
    const result = { attemptId: 'a1', passed: false, score: 60, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] };
    const show = async (ui: React.ReactElement) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/practice/a1']}><Routes><Route path="/practice/a1" element={ui} /><Route path="/practice/:attemptId" element={<p>new attempt</p>} /></Routes></MemoryRouter></QueryClientProvider>); });
      await flush();
    };
    it('offers Try again only while the delivery allows another attempt, and starts it once', async () => {
      mocks.attemptHistory.mockResolvedValue([attempt()]); mocks.createAttempt.mockResolvedValue({ id: 'a2', status: 'in_progress' });
      await show(<QuizResultActions result={result} assignment={quiz() as never} token="tok" courseId="co1" />);
      const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again') as HTMLButtonElement;
      await act(async () => { retry.click(); retry.click(); }); await flush();
      expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('new attempt');
    });
    it('explains when no attempts are left and still links back to the quiz and course', async () => {
      mocks.attemptHistory.mockResolvedValue([attempt(), attempt({ id: 'a0' })]);
      await show(<QuizResultActions result={result} assignment={quiz() as never} token="tok" courseId="co1" />);
      expect(container.textContent).toContain('You’ve used all 2 attempts.');
      // No retake: going back to the course is the one primary action, the quiz page the secondary one.
      expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/courses/co1', '/my-learning/ca1']);
    });
    it('separates a failed retake from an earlier pass and continues the course', async () => {
      mocks.attemptHistory.mockResolvedValue([attempt({ id: 'a1' }), attempt({ id: 'a0', attempt_number: 1, score: 90, passed: true })]); mocks.createAttempt.mockResolvedValue({ id: 'a3', status: 'in_progress' });
      await show(<QuizResultActions result={result} assignment={quiz({ max_attempts: 3 }) as never} token="tok" courseId="co1" />);
      expect(container.textContent).toContain('Quiz status: Passed on attempt 1.');
      expect([...container.querySelectorAll('a, button')].map((el) => el.textContent?.trim())).toEqual(['Continue course', 'Practice again']);
    });
    it('continues the course after a pass without asking for attempt history', async () => {
      await show(<QuizResultActions result={{ ...result, passed: true, score: 90 }} assignment={quiz() as never} token="tok" courseId="co1" />);
      expect([...container.querySelectorAll('a')].map((a) => a.textContent?.trim())).toEqual(['Continue course', 'Back to quiz']);
      expect(mocks.attemptHistory).not.toHaveBeenCalled();
    });
  });
});
