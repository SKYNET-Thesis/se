// @vitest-environment jsdom
import { act } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
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

  describe('drafts (D03)', () => {
    afterEach(() => { vi.useRealTimers(); });
    const ok = { attemptId: 'attempt-1', passed: true, score: 100, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] };
    const clickOption = async (value = 'stop') => { const option = [...container.querySelectorAll('input')].find((input) => input.value === value)!; await act(async () => { option.click(); }); };
    it('restores saved answers without saving again or showing an answer key', async () => {
      const onSaveDraft = vi.fn().mockResolvedValue(undefined);
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} initialDraft={[{ questionId: 'question-v1', optionId: 'stop' }]} draftSavedAt="2026-11-12T10:00:00Z" onSaveDraft={onSaveDraft} />); });
      expect((([...container.querySelectorAll('input')].find((i) => i.value === 'stop')) as HTMLInputElement).checked).toBe(true);
      expect(container.textContent).toContain('Draft saved');
      expect(onSaveDraft).not.toHaveBeenCalled();
    });
    it('autosaves a draft shortly after the learner stops changing answers, without grading', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockResolvedValue(undefined); const onSubmit = vi.fn();
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />); });
      await clickOption();
      expect(onSaveDraft).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Draft saved');
    });
    it('keeps the answers and says so when saving the draft fails', async () => {
      vi.useFakeTimers();
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={vi.fn().mockRejectedValue(new Error('x'))} />); });
      await clickOption();
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(container.textContent).toContain('Draft could not be saved');
      expect((([...container.querySelectorAll('input')].find((i) => i.value === 'stop')) as HTMLInputElement).checked).toBe(true);
    });
    it('is read-only for a finished attempt: no editing, no submit, no autosave', async () => {
      const onSaveDraft = vi.fn();
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} readOnly onSaveDraft={onSaveDraft} initialDraft={[{ questionId: 'question-v1', optionId: 'stop' }]} />); });
      expect(container.querySelector('fieldset')!.disabled).toBe(true);
      expect(([...container.querySelectorAll('button')].find((b) => b.textContent === 'Submit quiz') as HTMLButtonElement).disabled).toBe(true);
      expect(container.textContent).not.toContain('saved as a draft');
    });
    it('asks for a final confirmation before submitting when requested', async () => {
      const onSubmit = vi.fn().mockResolvedValue(ok);
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} confirmSubmit />); });
      await clickOption();
      await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent === 'Submit quiz')!).click(); });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('Submit this quiz?');
      const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Submit quiz').pop()!;
      await act(async () => { confirm.click(); });
      expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'stop' }]);
    });
  });

  describe('autosave and submission reliability (A06)', () => {
    afterEach(() => { vi.useRealTimers(); });
    const ok = { attemptId: 'attempt-1', passed: true, score: 100, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] };
    const clickOption = async (value: string) => {
      const option = [...container.querySelectorAll('input')].find((input) => input.value === value)!;
      await act(async () => { option.click(); });
    };
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      return { promise, resolve, reject };
    };

    it('serializes overlapping autosaves and writes the newest answers last', async () => {
      vi.useFakeTimers();
      const first = deferred<void>(); const second = deferred<void>();
      const saves: Array<{ answers: unknown; pending: ReturnType<typeof deferred<void>> }> = [];
      const onSaveDraft = vi.fn((answers) => {
        const pending = saves.length === 0 ? first : second;
        saves.push({ answers, pending });
        return pending.promise;
      });
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} />); });

      await clickOption('stop');
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      await clickOption('home');
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);

      await act(async () => { first.resolve(); await first.promise; });
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
      expect(onSaveDraft.mock.calls[1][0]).toEqual([{ questionId: 'question-v1', optionId: 'home' }]);
      await act(async () => { second.resolve(); await second.promise; });
    });

    it('flushes the latest draft before final submission and freezes answers while submitting', async () => {
      vi.useFakeTimers();
      const first = deferred<void>(); const latest = deferred<void>(); const submission = deferred<typeof ok>();
      const onSaveDraft = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
      const onSubmit = vi.fn(() => submission.promise);
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />); });

      await clickOption('stop');
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      await clickOption('home');
      await act(async () => { [...container.querySelectorAll('button')].find((button) => button.textContent === 'Submit quiz')!.click(); });

      expect(container.querySelector('fieldset')!.disabled).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
      await act(async () => { first.resolve(); await first.promise; });
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
      expect(onSaveDraft.mock.calls[1][0]).toEqual([{ questionId: 'question-v1', optionId: 'home' }]);
      await act(async () => { latest.resolve(); await latest.promise; });
      expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'home' }]);
      await act(async () => { submission.resolve(ok); await submission.promise; });
    });

    it('flushes the latest answer before same-tab navigation, even before the debounce fires', async () => {
      const save = deferred<void>();
      const onSaveDraft = vi.fn(() => save.promise);
      await act(async () => { root.render(<MemoryRouter initialEntries={['/quiz']}><Routes>
        <Route path="/quiz" element={<><KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} /><Link to="/next">Leave quiz</Link></>} />
        <Route path="/next" element={<p>Next page</p>} />
      </Routes></MemoryRouter>); });

      await clickOption('home');
      await act(async () => { (container.querySelector('a[href="/next"]') as HTMLAnchorElement).click(); });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft).toHaveBeenCalledWith([{ questionId: 'question-v1', optionId: 'home' }]);
      expect(container.textContent).not.toContain('Next page');

      await act(async () => { save.resolve(); await save.promise; });
      expect(container.textContent).toContain('Next page');
    });

    it('offers an explicit retry after autosave fails and keeps the latest answer', async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
      await act(async () => { root.render(<KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={vi.fn()} onSaveDraft={onSaveDraft} />); });
      await clickOption('stop');
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
      expect(container.textContent).toContain('Draft could not be saved');
      const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Retry save');
      expect(retry).toBeTruthy();
      await act(async () => { retry!.click(); });
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
      expect(onSaveDraft.mock.calls[1][0]).toEqual([{ questionId: 'question-v1', optionId: 'stop' }]);
      expect(container.textContent).toContain('Draft saved');
    });
  });
  it('links back to the quiz page after a result so the learner can see remaining attempts and retake', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ attemptId: 'attempt-1', passed: false, score: 0, passPercent: 80, completedLessonId: null, newlyUnlockedLessonIds: [] });
    await act(async () => { root.render(<MemoryRouter><KnowledgeCheckAttempt title="Robot Safety" snapshot={snapshot} onSubmit={onSubmit} backTo={{ to: '/my-learning/ca-1', label: 'Back to this quiz' }} /></MemoryRouter>); });
    expect(container.querySelector('a[href="/my-learning/ca-1"]')).toBeNull();
    await act(async () => { container.querySelector('input')!.click(); });
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Submit quiz')!.click(); });
    expect(container.querySelector('a[href="/my-learning/ca-1"]')?.textContent).toBe('Back to this quiz');
  });
});
