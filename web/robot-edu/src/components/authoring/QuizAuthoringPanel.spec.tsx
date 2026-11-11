// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuizAuthoringPanel } from './QuizAuthoringPanel';

const api = vi.hoisted(() => ({
  questions: vi.fn(), assignment: vi.fn(), preview: vi.fn(), createAssignment: vi.fn(), updateAssignment: vi.fn(), addQuestion: vi.fn(), removeQuestion: vi.fn(), reorderQuestions: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ quizAuthoringApi: api }));
const assignment = { id: 'as-1', title: 'Safety quiz', instructions: 'Read carefully.', constraints: { kind: 'knowledge_check', passPercent: 80 }, questions: [] };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('QuizAuthoringPanel', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const render = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => {
      root?.render(createElement(QueryClientProvider, { client }, createElement(QuizAuthoringPanel, { lessonId: 'lesson-1', token: 'token', title: assignment.title, instructions: assignment.instructions, assignmentId: assignment.id, onChange: vi.fn() })));
      await api.assignment.mock.results[0]?.value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return host;
  };
  it('searches persisted question bank and does not return answer keys in the selector', async () => {
    api.assignment.mockResolvedValue(assignment); api.questions.mockResolvedValue({ items: [{ id: 'v-1', questionId: 'q-1', code: 'SAFE-1', type: 'single_choice', stem: 'Which action is safe?', options: [{ id: 'a', text: 'Stop' }, { id: 'b', text: 'Continue' }], versionNumber: 1, objectives: [] }], total: 1, page: 1, pageSize: 20 });
    const host = await render();
    const questionsTab = [...host.querySelectorAll('button')].find((el) => el.textContent === 'Questions') as HTMLButtonElement;
    await act(async () => { questionsTab.click(); await api.questions.mock.results[0]?.value; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.questions).toHaveBeenCalled();
    expect(host.textContent).toContain('Which action is safe?');
    expect(host.textContent).not.toContain('Answer:');
  });
  it('previews answer keys only through the explicit authorized preview response', async () => {
    api.assignment.mockResolvedValue(assignment); api.preview.mockResolvedValue({ ...assignment, questions: [{ versionId: 'v-1', questionId: 'q-1', ordinal: 1, points: 1, type: 'single_choice', stem: 'Which action is safe?', options: [{ id: 'a', text: 'Stop' }, { id: 'b', text: 'Continue' }], code: 'SAFE-1', answerKey: ['a'] }] });
    const host = await render();
    await act(async () => {
      ( [...host.querySelectorAll('button')].find((el) => el.textContent === 'Preview') as HTMLButtonElement).click();
      await api.preview.mock.results[0]?.value;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.preview).toHaveBeenCalled();
    expect(host.textContent).toContain('Answer: a');
  });

  it('adds a question after the highest ordinal so removing a middle question cannot cause a collision', async () => {
    const q = (n: number) => ({ versionId: `v-${n}`, questionId: `q-${n}`, ordinal: n, points: 1, type: 'single_choice', stem: `Q${n}`, options: [{ id: 'a', text: 'A' }], code: `C${n}` });
    api.assignment.mockResolvedValue({ ...assignment, questions: [q(1), q(3)] });
    api.questions.mockResolvedValue({ items: [{ id: 'v-9', questionId: 'q-9', code: 'NEW', type: 'single_choice', stem: 'New question', options: [], versionNumber: 1, objectives: [] }], total: 1, page: 1, pageSize: 20 });
    api.addQuestion.mockResolvedValue({});
    const host = await render();
    await act(async () => { ([...host.querySelectorAll('button')].find((el) => el.textContent === 'Questions') as HTMLButtonElement).click(); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await act(async () => { ([...host.querySelectorAll('button')].find((el) => el.textContent === 'Add') as HTMLButtonElement).click(); });
    expect(api.addQuestion).toHaveBeenCalledWith('as-1', 'token', { questionVersionId: 'v-9', ordinal: 4, points: 1 });
  });
  it('does not send an out-of-range passing score to the server', async () => {
    api.assignment.mockResolvedValue(assignment);
    const host = await render();
    await vi.waitFor(() => expect(host.textContent).toContain('Draft assignment linked'));
    const input = host.querySelector('input[aria-label="Passing score"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, '150'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.updateAssignment).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Passing score must be a whole number from 1 to 100.');
  });
});
