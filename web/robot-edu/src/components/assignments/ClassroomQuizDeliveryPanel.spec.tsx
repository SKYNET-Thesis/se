// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassroomQuizDeliveryPanel } from './ClassroomQuizDeliveryPanel';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });

const api = vi.hoisted(() => ({ list: vi.fn(), publishedQuizzes: vi.fn(), createQuizDelivery: vi.fn(), publish: vi.fn() }));
vi.mock('../../lib/api', () => ({ assignmentApi: api }));

describe('ClassroomQuizDeliveryPanel', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const render = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(ClassroomQuizDeliveryPanel, { classroomId: 'class-1', token: 'token' }))); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)); });
    return host;
  };
  it('selects an eligible published quiz and creates a classroom draft delivery', async () => {
    api.publishedQuizzes.mockResolvedValue([{ canonical_assignment_id: 'quiz-1', quiz_title: 'Safety Quiz', instructions: 'Read carefully', lesson_id: 'lesson-1', lesson_title: 'Safety', course_id: 'course-1', course_title: 'Robotics', course_status: 'published', pass_percent: 80, question_count: 3, already_assigned: false }]);
    api.list.mockResolvedValue([]); api.createQuizDelivery.mockResolvedValue({ id: 'delivery-1' });
    const host = await render();
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'quiz-1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Save quiz as draft')) as HTMLButtonElement;
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(api.createQuizDelivery).toHaveBeenCalledWith('class-1', 'token', { canonicalAssignmentId: 'quiz-1' });
  });
  it('shows an explicit empty state when no eligible canonical quizzes exist', async () => {
    api.publishedQuizzes.mockResolvedValue([]); api.list.mockResolvedValue([]);
    const host = await render();
    expect(host.textContent).toContain('Select a quiz');
    expect(host.textContent).toContain('No quiz deliveries yet.');
  });
});
