// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { KnowledgeCheckAttempt, type PublicQuizSnapshot } from './KnowledgeCheckAttempt';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot: PublicQuizSnapshot = { kind: 'question_bank_quiz', schemaVersion: 1, passPercent: 80, questions: [{ questionVersionId: 'question-v1', type: 'single_choice', stem: 'Which command stops motion?', options: [{ id: 'stop', text: 'Stop' }, { id: 'home', text: 'Home' }] }] };
const three: PublicQuizSnapshot = { kind: 'question_bank_quiz', schemaVersion: 1, passPercent: 60, questions: [
  { questionVersionId: 'q1', type: 'single_choice', stem: 'Which command stops motion?', options: [{ id: 'stop', text: 'Stop' }, { id: 'home', text: 'Home' }] },
  { questionVersionId: 'q2', type: 'multiple_choice', stem: 'Which parts move the arm?', options: [{ id: 'shoulder', text: 'Shoulder joint' }, { id: 'elbow', text: 'Elbow joint' }, { id: 'camera', text: 'Camera' }] },
  { questionVersionId: 'q3', type: 'true_false', stem: 'The gripper can close.', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] },
] };
const ok = { attemptId: 'attempt-1', passed: true, score: 100, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] };

describe('KnowledgeCheckAttempt', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });
  const render = async (ui: ReactElement) => { await act(async () => { root.render(<MemoryRouter>{ui}</MemoryRouter>); }); };
  const input = (value: string) => [...container.querySelectorAll('input')].find((item) => item.value === value) as HTMLInputElement;
  const button = (text: string) => [...document.querySelectorAll('button')].filter((item) => item.textContent?.trim() === text).pop() as HTMLButtonElement;
  const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); };

  it('collects answers and submits them to the server callback, then renders the server result', async () => {
    const onSubmit = vi.fn().mockResolvedValue(ok);
    await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />);
    await click(input('stop'));
    await click(button('Submit quiz'));
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
    expect(container.textContent).toContain('You passed');
    expect(container.textContent).toContain('100%You needed 80% to pass.');
    expect(document.activeElement?.textContent).toBe('This attemptYou passed'); // focus moves to the result after submitting; the verdict is labelled as this attempt's
  });

  it('shows one question at a time and keeps answers while moving between questions', async () => {
    await render(<KnowledgeCheckAttempt title="Robot basics" snapshot={three} onSubmit={vi.fn()} />);
    expect(container.textContent).toContain('Question 1 of 3');
    expect(container.textContent).toContain('Choose one answer.');
    await click(input('stop'));
    await click(button('Next'));
    expect(container.textContent).toContain('Which parts move the arm?');
    expect(container.textContent).toContain('Choose all that apply.');
    expect(input('shoulder').type).toBe('checkbox');
    await click(input('shoulder')); await click(input('elbow'));
    await click(button('Previous'));
    expect(input('stop').checked).toBe(true);
    const map = [...container.querySelectorAll('nav[aria-label="Questions"] button')].map((item) => item.getAttribute('aria-label'));
    expect(map).toEqual(['Question 1, answered', 'Question 2, answered', 'Question 3, not answered']);
    expect(document.activeElement?.textContent).toBe('Which command stops motion?'); // focus follows the question
    await click(container.querySelector('nav[aria-label="Questions"] button[aria-label^="Question 2"]') as HTMLButtonElement);
    expect(input('shoulder').checked).toBe(true); expect(input('elbow').checked).toBe(true);
  });

  it('points to unanswered questions instead of sending an incomplete quiz the server would reject', async () => {
    const onSubmit = vi.fn();
    await render(<KnowledgeCheckAttempt title="Robot basics" snapshot={three} onSubmit={onSubmit} confirmSubmit />);
    await click(input('stop'));
    await click(container.querySelector('nav[aria-label="Questions"] button[aria-label^="Question 3"]') as HTMLButtonElement);
    await click(button('Submit quiz'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Submit your answers?');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('2 questions still need an answer.');
    await click(button('Go to question 2'));
    expect(container.textContent).toContain('Which parts move the arm?');
  });

  it('confirms before the final submission and submits once however often it is pressed', async () => {
    let resolve: (value: typeof ok) => void = () => undefined;
    const onSubmit = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} confirmSubmit />);
    await click(input('stop'));
    await click(button('Submit quiz'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Submit your answers?');
    expect(document.body.textContent).toContain('You’ve answered all 1 question.');
    const confirm = button('Submit answers');
    await click(confirm); await click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(ok); });
    expect(container.textContent).toContain('You passed');
  });

  it('keeps answers after a network failure and lets the student submit again (the server grades an attempt once)', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ ...ok, passed: false, score: 0 });
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />);
    await click(input('stop'));
    await click(button('Submit quiz'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('We couldn’t confirm your submission');
    expect(input('stop').checked).toBe(true);
    // The autosave that submitting cancelled runs straight away, so the answers are also kept on the server.
    expect(onSaveDraft).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
    expect(container.textContent).toContain('All answers saved');
    await click(button('Try again'));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1][0]).toEqual([{ questionId: 'question-v1', optionId: 'stop' }]);
    expect(container.textContent).toContain('Not passed yet');
  });

  it('explains a closed quiz without offering a retry and without showing raw server text', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'This assignment is closed for submissions.', 'ASSIGNMENT_CLOSED'));
    await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />);
    await click(input('stop'));
    await click(button('Submit quiz'));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('This quiz closed before your answers were submitted.');
    expect(button('Try again')).toBeUndefined();
    expect(input('stop').checked).toBe(true);
  });

  it('reviews each question with the server feedback and never shows correct options', async () => {
    const result = { ...ok, passed: false, score: 50, passPercent: 60, earnedPoints: 1, possiblePoints: 2, feedback: [
      { questionVersionId: 'q1', correct: true, earnedPoints: 1, possiblePoints: 1, explanation: 'Stop halts every joint.' },
      { questionVersionId: 'q2', correct: false, earnedPoints: 0, possiblePoints: 1, explanation: null },
    ] };
    const two = { ...three, questions: three.questions.slice(0, 2) };
    await render(<KnowledgeCheckAttempt title="Robot basics" snapshot={two} onSubmit={vi.fn()} result={result} readOnly context={{ submittedAt: '2026-11-17T09:00:00Z' }} />);
    expect(container.textContent).toContain('Not passed yet');
    expect(container.textContent).toContain('You needed 60% to pass.');
    expect(container.textContent).toContain('1 of 2 questions correct'); // points equal questions here, so they are not repeated
    const items = [...container.querySelectorAll('section[aria-labelledby="quiz-review-heading"] li')];
    expect(items[0].textContent).toContain('Correct'); expect(items[0].textContent).toContain('Stop halts every joint.');
    expect(items[1].textContent).toContain('Incorrect');
    expect(container.textContent).not.toContain('Your answer'); // the server clears the draft on grading, so a reload can't show it
    expect(container.textContent).toContain('Correct options aren’t shown');
  });

  describe('autosave and submit races (A06)', () => {
    const deferred = () => { let resolve: () => void = () => undefined; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

    it('sends one draft at a time and always the newest answers last, so an older save cannot overwrite a newer one', async () => {
      vi.useFakeTimers();
      const first = deferred();
      let inFlight = 0; let maxInFlight = 0;
      const onSaveDraft = vi.fn().mockImplementation(async () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); if (onSaveDraft.mock.calls.length === 1) await first.promise; inFlight -= 1; });
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} />);
      await click(input('stop'));
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1); // first save is slow and still in flight
      await click(input('home')); await click(input('stop')); await click(input('home'));
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1); // nothing overlaps it
      await act(async () => { first.resolve(); await vi.advanceTimersByTimeAsync(0); });
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
      expect(onSaveDraft.mock.calls[1][0]).toEqual([{ questionId: 'question-v1', optionId: 'home' }]);
      expect(maxInFlight).toBe(1);
      expect(container.textContent).toContain('All answers saved');
    });

    it('submits the answer changed a moment ago and sends no draft after the submission', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockResolvedValue(undefined); const onSubmit = vi.fn().mockResolvedValue(ok);
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />);
      await click(input('home')); await click(input('stop'));
      await click(button('Submit quiz')); // inside the autosave pause
      expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(onSaveDraft).not.toHaveBeenCalled();
      expect(container.textContent).toContain('You passed');
    });

    it('saves the last change when the student leaves during the autosave pause', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockResolvedValue(undefined);
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} />);
      await click(input('home'));
      act(() => root.unmount());
      expect(onSaveDraft).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'home' }]);
      root = createRoot(container); // afterEach unmounts again
    });

    it('freezes the answers while a submission is in flight, so the graded answers are the ones on screen', async () => {
      let resolve: (value: typeof ok) => void = () => undefined;
      const onSubmit = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />);
      await click(input('stop'));
      await click(button('Submit quiz'));
      expect(container.querySelector('fieldset')?.disabled).toBe(true);
      await click(input('home'));
      expect(input('stop').checked).toBe(true);
      await act(async () => { resolve(ok); });
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('keeps the answers when the server rejects the submission as invalid', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'Answer every quiz question exactly once.'));
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} />);
      await click(input('stop'));
      await click(button('Submit quiz'));
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('Answer every question before submitting.');
      expect(input('stop').checked).toBe(true);
      expect(container.querySelector('fieldset')?.disabled).toBe(false);
      expect(button('Try again')).toBeUndefined(); // the same request would be refused again
    });
  });

  describe('drafts (D03)', () => {
    it('restores saved answers without saving again or showing an answer key', async () => {
      const onSaveDraft = vi.fn().mockResolvedValue(undefined);
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} initialDraft={[{ questionId: 'question-v1', optionId: 'stop' }]} draftSavedAt="2026-11-12T10:00:00Z" onSaveDraft={onSaveDraft} />);
      expect(input('stop').checked).toBe(true);
      expect(container.textContent).toContain('All answers saved');
      expect(onSaveDraft).not.toHaveBeenCalled();
    });
    it('autosaves a draft shortly after the learner stops changing answers, without grading', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockResolvedValue(undefined); const onSubmit = vi.fn();
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />);
      await click(input('stop'));
      expect(onSaveDraft).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(container.textContent).toContain('All answers saved');
    });
    it('keeps the answers and says so when saving the draft fails', async () => {
      vi.useFakeTimers();
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))} />);
      await click(input('stop'));
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(container.textContent).toContain('Your latest answers aren’t saved yet.');
      expect(button('Save now')).toBeDefined(); // a failed autosave can be retried by hand
      expect(input('stop').checked).toBe(true);
    });
    it('Save now retries a failed autosave with the current answers, and a closed quiz offers no pointless retry', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockRejectedValueOnce(new ApiError(503, 'Service unavailable')).mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ApiError(409, 'closed', 'ASSIGNMENT_CLOSED'));
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} />);
      await click(input('home'));
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      await click(button('Save now'));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(onSaveDraft).toHaveBeenNthCalledWith(2, [{ questionId: 'question-v1', optionId: 'home' }]);
      expect(container.textContent).toContain('All answers saved');
      await click(input('stop'));
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(container.textContent).toContain('This quiz has closed, so answers can no longer be saved.');
      expect(button('Save now')).toBeUndefined();
    });
    it('is read-only for a finished attempt: no editing, no submit, no autosave', async () => {
      const onSaveDraft = vi.fn();
      await render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} readOnly onSaveDraft={onSaveDraft} initialDraft={[{ questionId: 'question-v1', optionId: 'stop' }]} />);
      expect(container.querySelector('fieldset')!.disabled).toBe(true);
      expect(button('Submit quiz').disabled).toBe(true);
      expect(container.textContent).toContain('This attempt is closed');
      expect(container.textContent).not.toContain('save as you go');
    });
  });
});
