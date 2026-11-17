// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuizResultsTable } from './QuizResultsTable';

const api = vi.hoisted(() => ({ quizResults: vi.fn() }));
vi.mock('../../lib/api', () => ({ instructorApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('QuizResultsTable', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(QuizResultsTable, { classroomId: 'room', token: 't' }))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  };
  it('shows weighted points, score against the threshold and pass/fail', async () => {
    api.quizResults.mockResolvedValue([{ attemptId: 'a2', learnerUserId: 'u1', fullName: 'Ada', quizTitle: 'Safety quiz', attemptNumber: 2, score: 100, passed: true, passPercent: 60, earnedPoints: 4, possiblePoints: 4, submittedAt: null },
      { attemptId: 'a1', learnerUserId: 'u1', fullName: 'Ada', quizTitle: 'Safety quiz', attemptNumber: 1, score: 25, passed: false, passPercent: 60, earnedPoints: 1, possiblePoints: 4, submittedAt: null }]);
    await mount();
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent);
    expect(rows[0]).toContain('4 / 4'); expect(rows[0]).toContain('Passed');
    expect(rows[1]).toContain('1 / 4'); expect(rows[1]).toContain('25% (pass 60%)'); expect(rows[1]).toContain('Not passed');
  });
  it('explains empty and error states', async () => {
    api.quizResults.mockResolvedValue([]); await mount(); expect(document.body.textContent).toContain('No quiz attempts have been completed yet.');
    root?.unmount(); document.body.innerHTML = '';
    api.quizResults.mockRejectedValue(new Error('x')); await mount(); expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  });
});
