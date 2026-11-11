// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeCheckAttempt, type PublicQuizSnapshot } from './KnowledgeCheckAttempt';

const snapshot: PublicQuizSnapshot = { kind: 'question_bank_quiz', schemaVersion: 1, passPercent: 80, questions: [{ questionVersionId: 'question-v1', type: 'single_choice', stem: 'Which command stops motion?', options: [{ id: 'stop', text: 'Stop' }, { id: 'home', text: 'Home' }] }] };

describe('KnowledgeCheckAttempt', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  it('collects answers and submits them to the server callback, then renders the persisted result', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ attemptId: 'attempt-1', passed: true, score: 100, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] });
    await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />); });
    const option = [...container.querySelectorAll('input')].find((input) => input.value === 'stop')!;
    await act(async () => { option.click(); });
    const submit = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Submit quiz')!;
    await act(async () => { submit.click(); });
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
    expect(container.textContent).toContain('Passed');
    expect(container.textContent).toContain('Score: 100% · Required: 80%');
  });
  it('shows a safe submission error without discarding the selected answer', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Answer every quiz question exactly once.'));
    await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />); });
    await act(async () => { container.querySelector('input')!.click(); });
    await act(async () => { [...container.querySelectorAll('button')][0].click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Answer every quiz question');
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(true);
  });
});
