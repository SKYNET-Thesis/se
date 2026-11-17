// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LearnerProgressTable } from './LearnerProgressTable';

const api = vi.hoisted(() => ({ learnerProgress: vi.fn(), learnerLessons: vi.fn() }));
vi.mock('../../lib/api', () => ({ instructorApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LearnerProgressTable', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(LearnerProgressTable, { classroomId: 'room', token: 't' }))); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  };
  it('renders progress, lessons, attempts and best score per learner', async () => {
    api.learnerProgress.mockResolvedValue([{ learnerUserId: 'u1', fullName: 'Ada', email: null, lessonCount: 2, lessonsCompleted: 1, progressPercent: 50, attemptsSubmitted: 2, bestScore: 75, lastActivityAt: null }, { learnerUserId: 'u2', fullName: 'Bo', email: null, lessonCount: 2, lessonsCompleted: 0, progressPercent: 0, attemptsSubmitted: 0, bestScore: null, lastActivityAt: null }]);
    await mount();
    expect(api.learnerProgress).toHaveBeenCalledWith('room', 't');
    expect(document.querySelector('[aria-label="Ada course progress"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(document.body.textContent).toContain('1 / 2'); expect(document.body.textContent).toContain('75%');
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  });
  it('drills down into one learner\'s lessons', async () => {
    api.learnerProgress.mockResolvedValue([{ learnerUserId: 'u1', fullName: 'Ada', email: null, lessonCount: 2, lessonsCompleted: 1, progressPercent: 50, attemptsSubmitted: 2, bestScore: 75, lastActivityAt: null }]);
    api.learnerLessons.mockResolvedValue({ learnerUserId: 'u1', fullName: 'Ada', lessons: [{ lessonId: 'l1', ordinal: 1, title: 'Safety', status: 'completed', completedAt: null, bestQuizScore: 75, attempts: 2 }, { lessonId: 'l2', ordinal: 2, title: 'Motion', status: 'not_started', completedAt: null, bestQuizScore: null, attempts: 0 }] });
    await mount();
    const toggle = document.querySelector('[aria-label="Show lessons for Ada"]') as HTMLButtonElement;
    await act(async () => { toggle.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(api.learnerLessons).toHaveBeenCalledWith('room', 'u1', 't');
    expect(document.querySelector('[aria-label="Lessons of Ada"]')?.textContent).toContain('1. Safety');
    expect(document.body.textContent).toContain('Best 75%'); expect(document.body.textContent).toContain('Not started');
    expect(document.querySelector('[aria-label="Hide lessons for Ada"]')?.getAttribute('aria-expanded')).toBe('true');
  });
  it('explains an empty classroom and a load failure', async () => {
    api.learnerProgress.mockResolvedValue([]); await mount(); expect(document.body.textContent).toContain('No enrolled students yet.');
    root?.unmount(); document.body.innerHTML = '';
    api.learnerProgress.mockRejectedValue(new Error('x')); await mount(); expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  });
});
