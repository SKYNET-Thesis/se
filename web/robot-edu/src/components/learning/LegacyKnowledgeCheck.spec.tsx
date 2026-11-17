// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAttempt: vi.fn(), submit: vi.fn() }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok', user: { id: 'u1' } }, loading: false, sessionRevision: 0 }) }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, learnerApi: { ...actual.learnerApi, createAttempt: mocks.createAttempt, submitKnowledgeCheck: mocks.submit } };
});

import { ApiError, type LessonDetailResponse } from '../../lib/api';
import { LegacyKnowledgeCheck } from './LegacyKnowledgeCheck';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Course 1 seed: five single-answer questions whose option ids are snake_case words.
const questions = [
  { id: 'q1', prompt: 'Which robot component connects links and allows rotational motion?', options: ['joint', 'linkage', 'chassis'] },
  { id: 'q2', prompt: 'What is the primary role of the camera in the workspace?', options: ['visual_inspection', 'power_supply', 'joint_braking'] },
  { id: 'q3', prompt: 'Before commanding the gripper to grasp, what workspace condition must be confirmed?', options: ['clear_workspace', 'blind_approach', 'maximum_speed'] },
  { id: 'q4', prompt: 'Which command returns all robot arm joints to a known safe configuration?', options: ['home', 'emergency_power', 'open_gripper'] },
  { id: 'q5', prompt: 'What is the required immediate safety response to unexpected motion in the workspace?', options: ['stop', 'continue', 'ignore'] },
];
const lesson = (over: Partial<LessonDetailResponse> = {}) => ({
  id: 'l1', course_id: 'c1', course_title: 'Robotics Fundamentals', title: 'Meet Your Robot', ordinal: 1, status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], objectives: [], qualification: null, created_at: '',
  content: { version: 1, summary: '', learningObjectives: [], conceptSections: [], robotConcept: '', taskPreview: '', safetyNotes: [], completionCriteria: 'Pass the safety knowledge check with a score of at least 80%.' },
  assignment: { id: 'a1', classroomAssignmentId: 'ca1', title: 'Safety Knowledge Check', instructions: 'Answer every question. The server calculates the result.', allowedBlocks: [], constraints: { kind: 'knowledge_check', questions }, challengeTitle: null, challengeDescription: null },
  activeAttempt: null, priorAttempt: null, ...over,
}) as unknown as LessonDetailResponse;
const failed = { attemptId: 'att-1', passed: false, score: 20, completedLessonId: null, newlyUnlockedLessonIds: [] };

describe('LegacyKnowledgeCheck (Course 1)', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const render = async (ui: ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>); });
  };
  const button = (text: string) => [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text).pop() as HTMLButtonElement | undefined;
  const click = async (element?: HTMLElement) => { await act(async () => { element?.click(); await Promise.resolve(); }); };
  const answerAll = async () => {
    for (let i = 0; i < questions.length; i += 1) {
      await click(container.querySelector('main fieldset input') as HTMLInputElement); // first option of each question
      if (i < questions.length - 1) await click(button('Next'));
    }
  };

  it('opens with a short start panel: question count, the pass rule as authored, and no internal wording', async () => {
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} />);
    expect([...container.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])).toEqual([['Questions', '5'], ['To pass', 'Pass the safety knowledge check with a score of at least 80%.']]);
    expect(container.textContent).toContain('Answer every question.');
    expect(container.textContent).not.toMatch(/server/i);
    expect(button('Start quiz')).toBeDefined();
  });

  it('keeps the question as the focal point, shows readable options and the answered state', async () => {
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} />);
    await click(button('Start quiz'));
    expect(container.querySelector('h2')?.textContent).toBe(questions[0].prompt);
    expect(document.activeElement?.textContent).toBe(questions[0].prompt); // focus is not lost when the Start button goes away
    expect(container.querySelector('h1')?.className).toMatch(/text-base/); // the quiz title is context, smaller than the question
    await click(button('Next'));
    expect([...container.querySelectorAll('label')].map((l) => l.textContent)).toEqual(['Visual inspection', 'Power supply', 'Joint braking']);
    await click(container.querySelector('main fieldset input') as HTMLInputElement);
    expect([...container.querySelectorAll('nav[aria-label="Questions"] button')].map((b) => b.getAttribute('aria-label')).slice(0, 2)).toEqual(['Question 1, not answered', 'Question 2, answered']);
  });

  it('lists unanswered questions instead of sending an incomplete quiz', async () => {
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} />);
    await click(button('Start quiz'));
    for (let i = 0; i < 4; i += 1) await click(button('Next'));
    await click(button('Submit quiz'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('5 questions still need an answer.');
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('confirms, submits every answer once, and shows learning feedback without technical wording', async () => {
    mocks.createAttempt.mockResolvedValue({ id: 'att-1', status: 'in_progress' });
    mocks.submit.mockResolvedValue(failed);
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} reviewHref="/courses/c1/lessons/l1/activities/l1-reading-1" />);
    await click(button('Start quiz'));
    await answerAll();
    await click(button('Submit quiz'));
    expect(document.body.textContent).toContain('Submit your answers?');
    await click(button('Submit answers'));
    expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledWith('att-1', { answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0] })) }, 'tok');
    expect(container.textContent).toContain('Not passed yet');
    expect(container.textContent).not.toContain('questions correct'); // Course 1 returns no per-question results, so no count is shown
    expect(container.textContent).toContain('This quiz reports your score only, not which answers were right.');
    expect(container.textContent).toContain('To pass: Pass the safety knowledge check');
    expect(container.textContent).not.toMatch(/verified by the server/i);
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Review the lesson')?.getAttribute('href')).toBe('/courses/c1/lessons/l1/activities/l1-reading-1');
    expect(document.activeElement?.textContent).toBe('This attemptNot passed yet');
  });

  it('starts a new attempt for a retry instead of resubmitting the graded one', async () => {
    mocks.createAttempt.mockResolvedValueOnce({ id: 'att-2', status: 'in_progress' });
    mocks.submit.mockResolvedValue(failed);
    // Lesson detail still lists the first attempt as active from before it was graded.
    await render(<LegacyKnowledgeCheck lesson={lesson({ activeAttempt: { id: 'att-1', status: 'in_progress', score: null } } as never)} courseId="c1" previouslyPassed={false} />);
    await click(button('Start quiz')); await answerAll(); await click(button('Submit quiz')); await click(button('Submit answers'));
    expect(mocks.submit.mock.calls[0][0]).toBe('att-1');
    expect(mocks.createAttempt).not.toHaveBeenCalled();
    await click(button('Try again')); await answerAll(); await click(button('Submit quiz')); await click(button('Submit answers'));
    expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[1][0]).toBe('att-2');
  });

  it('explains that an earlier pass keeps the lesson complete after a failed retake', async () => {
    mocks.createAttempt.mockResolvedValue({ id: 'att-3', status: 'in_progress' });
    mocks.submit.mockResolvedValue(failed);
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed />);
    expect(container.textContent).toContain('Quiz status: Passed');
    await click(button('Practice again')); await answerAll(); await click(button('Submit quiz')); await click(button('Submit answers'));
    // This attempt failed; the quiz itself stays passed, and that is stated apart from the verdict.
    expect(container.textContent).toContain('This attemptNot passed yet');
    expect(container.textContent).toContain('Quiz status: Passed on an earlier attempt. A passing attempt is kept, so the lesson stays complete.');
    const actions = [...container.querySelectorAll('section[aria-labelledby="quiz-result-heading"] a, section[aria-labelledby="quiz-result-heading"] button')].map((el) => el.textContent?.trim());
    expect(actions).toEqual(['Continue course', 'Practice again']); // the lesson is done, so continuing is the one primary action
  });

  it('shows progress and continues the course after a pass', async () => {
    mocks.createAttempt.mockResolvedValue({ id: 'att-4', status: 'in_progress' });
    mocks.submit.mockResolvedValue({ attemptId: 'att-4', passed: true, score: 100, completedLessonId: 'l1', newlyUnlockedLessonIds: ['l2'] });
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} />);
    await click(button('Start quiz')); await answerAll(); await click(button('Submit quiz')); await click(button('Submit answers'));
    expect(container.textContent).toContain('You passed');
    expect(container.textContent).toContain('This completes the lesson and unlocks the next lesson.');
    expect([...container.querySelectorAll('section[aria-labelledby="quiz-result-heading"] a')].map((a) => a.textContent?.trim())).toEqual(['Continue course', 'Back to lesson']);
  });

  it('after an unconfirmed submission that the server already graded, says so instead of repeating the error', async () => {
    mocks.createAttempt.mockResolvedValue({ id: 'att-5', status: 'in_progress' });
    mocks.submit.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(new ApiError(404, 'Knowledge check was not found.'));
    await render(<LegacyKnowledgeCheck lesson={lesson()} courseId="c1" previouslyPassed={false} />);
    await click(button('Start quiz')); await answerAll(); await click(button('Submit quiz')); await click(button('Submit answers'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('VISTA couldn’t be reached');
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('submitting again is safe');
    expect((container.querySelector('main fieldset input') as HTMLInputElement).checked).toBe(true); // answers kept
    await click(button('Try again'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('may already have been graded');
    expect(container.textContent).not.toContain('Knowledge check was not found.');
  });
});
