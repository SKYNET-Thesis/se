// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeCheckAttempt, type PublicQuizSnapshot } from './KnowledgeCheckAttempt';

const weighted: PublicQuizSnapshot = {
  kind: 'question_bank_quiz', schemaVersion: 1, passPercent: 60,
  questions: [
    { questionVersionId: 'q1', type: 'single_choice', stem: 'Heavy question', points: 3, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
    { questionVersionId: 'q2', type: 'single_choice', stem: 'Light question', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
  ],
};

describe('Question Bank quiz points as the student sees them', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows each question\'s weight and the total before answering', async () => {
    await act(async () => { root.render(<KnowledgeCheckAttempt title="Weighted" snapshot={weighted} onSubmit={vi.fn()} />); });
    const labels = [...container.querySelectorAll('[data-testid="question-points"]')].map((el) => el.textContent);
    expect(labels).toEqual(['· 3 points', '· 1 point']);
    expect(container.querySelector('[data-testid="quiz-total-points"]')?.textContent).toBe('Total: 4 points · Pass at 60%');
  });

  it('shows earned and possible points per question after the server grades the attempt', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      attemptId: 'a1', passed: false, score: 25, passPercent: 60, completedLessonId: null, newlyUnlockedLessonIds: [], earnedPoints: 1, possiblePoints: 4,
      feedback: [{ questionVersionId: 'q1', correct: false, earnedPoints: 0, possiblePoints: 3 }, { questionVersionId: 'q2', correct: true, earnedPoints: 1, possiblePoints: 1, explanation: 'Because.' }],
    });
    await act(async () => { root.render(<KnowledgeCheckAttempt title="Weighted" snapshot={weighted} onSubmit={onSubmit} />); });
    for (const input of [...container.querySelectorAll<HTMLInputElement>('input')].filter((i) => i.value === 'a')) await act(async () => { input.click(); });
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Submit quiz')!.click(); });
    expect(container.querySelector('[data-testid="quiz-earned-points"]')?.textContent).toBe('1 of 4 points earned');
    expect([...container.querySelectorAll('[data-testid="question-result"]')].map((el) => el.textContent)).toEqual([
      'Question 1: not correct · 0 / 3', 'Question 2: correct · 1 / 1Because.',
    ]);
    expect(container.textContent).toContain('Score: 25% · Required: 60%');
  });

  it('does not invent points when the snapshot carries none (older quizzes)', async () => {
    const legacy = { ...weighted, questions: weighted.questions.map(({ points: _points, ...rest }) => rest) } as PublicQuizSnapshot;
    await act(async () => { root.render(<KnowledgeCheckAttempt title="Legacy" snapshot={legacy} onSubmit={vi.fn()} />); });
    expect(container.querySelector('[data-testid="question-points"]')).toBeNull();
    expect(container.querySelector('[data-testid="quiz-total-points"]')).toBeNull();
  });
});
