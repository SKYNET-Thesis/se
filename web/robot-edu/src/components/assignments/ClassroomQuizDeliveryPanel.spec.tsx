// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';
import { QUIZ_ACCESS_MESSAGE, deliveryPhase, formatWhen, isQuizAccessDenied, isStaleQuizError, quizDeliveryErrorMessage, scheduleBody, validateSchedule } from '../../queries/quizDeliveryModel';
import { ClassroomQuizDeliveryPanel } from './ClassroomQuizDeliveryPanel';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });

const api = vi.hoisted(() => ({ list: vi.fn(), publishedQuizzes: vi.fn(), createQuizDelivery: vi.fn(), publish: vi.fn(), toast: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), assignmentApi: api }));
vi.mock('sonner', () => ({ toast: { success: api.toast, error: vi.fn() } }));

const quiz = (id: string, title: string, extra = {}) => ({ canonical_assignment_id: id, quiz_title: title, instructions: '', lesson_id: 'l1', lesson_title: 'Sensors and safety', course_id: 'co1', course_title: 'Robotics Foundations', course_status: 'published', pass_percent: 80, question_count: 12, already_assigned: false, ...extra });
const delivery = (id: string, title: string, extra = {}) => ({ id, classroom_id: 'class-1', assignment_id: `a-${id}`, lesson_id: 'l1', lesson_title: 'Sensors and safety', challenge_id: null, title, instructions: '', constraints: { kind: 'knowledge_check' }, status: 'draft', available_from: null, due_at: null, close_at: null, max_attempts: null, ...extra });
const FUTURE = '2030-03-02T08:00:00.000Z';

let root: Root | undefined;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const render = async (props: Record<string, unknown> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(ClassroomQuizDeliveryPanel, { classroomId: 'class-1', token: 'token', classroomName: 'Robotics 8A', classroomStatus: 'active', ...props }))); });
  await flush();
  return host;
};
const buttons = (label: string) => [...document.body.querySelectorAll('button')].filter((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label) as HTMLButtonElement[];
const button = (label: string) => buttons(label).at(-1) as HTMLButtonElement;
const dialog = () => [...document.body.querySelectorAll('[role="dialog"]')].at(-1) as HTMLElement;
const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); await flush(); };
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const setValue = async (name: string, value: string) => {
  const input = dialog().querySelector(`[name="${name}"]`) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pickQuiz = async (id: string) => { await click(dialog().querySelector(`input[name="quiz"][value="${id}"]`) as HTMLInputElement); };
const submitAssign = async () => { await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); }); await flush(); };
const alertText = () => dialog().querySelector('[role="alert"]')?.textContent;

beforeEach(() => {
  api.publishedQuizzes.mockResolvedValue([quiz('q1', 'Sensor safety check'), quiz('q2', 'Motors and gears: a very long quiz title that has to wrap on a phone screen without overflowing', { question_count: 1, pass_percent: 70 })]);
  api.list.mockResolvedValue([
    delivery('d1', 'Safety basics'),
    delivery('d2', 'Line follower quiz', { status: 'published', available_from: FUTURE, due_at: '2030-03-09T08:00:00.000Z', max_attempts: 2 }),
    { ...delivery('d3', 'Gripper programming task'), constraints: {}, challenge_id: 'ch1' }, // a Blockly assignment, not a quiz
  ]);
});
afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });

describe('Classroom quiz list (A04)', () => {
  it('lists only quiz deliveries with their status in words, schedule and the right action', async () => {
    const host = await render();
    const text = host.textContent ?? '';
    expect(text).toContain('Assigned quizzes2');
    expect(text).not.toContain('Gripper programming task');
    const [draft, scheduled] = [...host.querySelectorAll('li')];
    expect(draft.textContent).toContain('Draft'); expect(draft.textContent).toContain('Students can’t see it yet.');
    expect(draft.textContent).toContain('OpensWhen published'); expect(draft.textContent).toContain('AttemptsUnlimited');
    expect(draft.querySelector('button[aria-label="Publish Safety basics"]')).not.toBeNull();
    expect(scheduled.textContent).toContain('Scheduled');
    expect(scheduled.textContent).toContain(`Opens${formatWhen(FUTURE)}`); expect(scheduled.textContent).toContain('Attempts2');
    expect(scheduled.querySelector('button')).toBeNull(); // already published: no Publish action
  });

  it('offers retry when the classroom’s quizzes fail to load', async () => {
    api.list.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce([]);
    const host = await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('VISTA couldn’t be reached.');
    await click(button('Try again'));
    expect(host.textContent).toContain('No quizzes assigned yet');
  });

  it('blocks assigning and publishing in an archived classroom, without asking for ready quizzes', async () => {
    const host = await render({ classroomStatus: 'archived' });
    expect(host.textContent).toContain('This classroom is archived. Its quizzes can’t be assigned or published');
    expect(button('Assign a quiz').disabled).toBe(true);
    expect(host.querySelector('button[aria-label^="Publish"]')).toBeNull();
    expect(api.publishedQuizzes).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Safety basics'); // existing quizzes stay visible
    expect([...host.querySelectorAll('li')][1].textContent).toContain('Unavailable'); // published, but the classroom is archived
  });

  it('explains a missing delivery permission from the server and hides the actions', async () => {
    api.publishedQuizzes.mockRejectedValue(new ApiError(403, 'Forbidden resource'));
    const host = await render();
    expect(host.textContent).toContain('You can see this classroom’s quizzes, but your account can’t assign or publish them.');
    expect(button('Assign a quiz').disabled).toBe(true);
    expect(host.querySelector('button[aria-label^="Publish"]')).toBeNull();
  });
});

describe('Quiz access denied by the classroom scope guard (A04 regression)', () => {
  it('explains missing quiz access instead of claiming a listed classroom was removed', async () => {
    api.list.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    api.publishedQuizzes.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    const onClassroomCheck = vi.fn();
    const host = await render({ onClassroomCheck });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(QUIZ_ACCESS_MESSAGE);
    expect(host.textContent).not.toMatch(/wasn’t found|removed/);
    expect(button('Assign a quiz').disabled).toBe(true);
    expect(host.querySelector('button[aria-label^="Publish"]')).toBeNull();
    expect(buttons('Try again')).toHaveLength(0); // retrying can't grant access
    expect(onClassroomCheck).toHaveBeenCalledTimes(1); // the page re-checks its authorized classroom list once
  });

  it('keeps the list usable when only assigning is denied', async () => {
    api.publishedQuizzes.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    const host = await render();
    expect(host.textContent).toContain('Safety basics');
    expect(host.textContent).toContain('You can see this classroom’s quizzes, but your account can’t assign or publish them.');
    expect(button('Assign a quiz').disabled).toBe(true);
  });

  it('does not treat a denied assign or publish as stale data', async () => {
    api.createQuizDelivery.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    await render();
    await click(button('Assign a quiz'));
    await pickQuiz('q1');
    const loads = api.publishedQuizzes.mock.calls.length;
    await submitAssign();
    expect(alertText()).toBe(QUIZ_ACCESS_MESSAGE);
    expect(button('Add as draft').disabled).toBe(false); // the choice is kept; nothing was removed
    expect(api.publishedQuizzes.mock.calls.length).toBe(loads);
  });
});

describe('Assign a quiz (A04)', () => {
  it('assigns the chosen quiz as a draft with the schedule the server accepts, then refreshes', async () => {
    api.createQuizDelivery.mockResolvedValue(delivery('d9', 'Sensor safety check'));
    await render();
    await click(button('Assign a quiz'));
    await wait(60);
    expect(document.activeElement?.getAttribute('value')).toBe('q1'); // focus lands on the first quiz once loaded
    expect(dialog().textContent).toContain('Robotics Foundations › Sensors and safety');
    expect(dialog().textContent).toContain('12 questions'); expect(dialog().textContent).toContain('1 question');
    expect(dialog().textContent).toContain('The quiz is added as a draft. Students see it once you publish it.');
    expect(button('Add as draft').disabled).toBe(true);
    await pickQuiz('q1');
    await setValue('availableFrom', '2030-03-02T09:00'); await setValue('dueAt', '2030-03-09T09:00'); await setValue('maxAttempts', '3');
    const loads = api.list.mock.calls.length;
    await submitAssign();
    expect(api.createQuizDelivery).toHaveBeenCalledTimes(1);
    expect(api.createQuizDelivery).toHaveBeenCalledWith('class-1', 'token', { canonicalAssignmentId: 'q1', availableFrom: new Date('2030-03-02T09:00').toISOString(), dueAt: new Date('2030-03-09T09:00').toISOString(), maxAttempts: 3 });
    expect(api.toast).toHaveBeenCalledWith('Quiz added as a draft', { description: 'Publish Sensor safety check when students in Robotics 8A should see it.' });
    expect(api.list.mock.calls.length).toBeGreaterThan(loads);
    expect(api.publishedQuizzes.mock.calls.length).toBeGreaterThan(1);
  });

  it('checks dates and attempts before sending anything', async () => {
    await render();
    await click(button('Assign a quiz'));
    await pickQuiz('q1');
    await setValue('availableFrom', '2030-03-09T09:00'); await setValue('dueAt', '2030-03-02T09:00'); await setValue('maxAttempts', '0');
    await submitAssign();
    expect(api.createQuizDelivery).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('The due date can’t be before the quiz opens.');
    expect(dialog().textContent).toContain('Enter a whole number from 1 to 100');
    expect(document.activeElement?.getAttribute('name')).toBe('dueAt');
    expect(dialog().querySelector('[name="dueAt"]')?.getAttribute('aria-invalid')).toBe('true');
    await setValue('dueAt', '2030-03-10T09:00'); // errors update once the teacher fixes them
    expect(dialog().textContent).not.toContain('The due date can’t be before the quiz opens.');
  });

  it('sends one request even when Add as draft is pressed repeatedly', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    api.createQuizDelivery.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await render();
    await click(button('Assign a quiz'));
    await pickQuiz('q1');
    await submitAssign(); await submitAssign();
    expect(button('Adding…').disabled).toBe(true);
    expect(api.createQuizDelivery).toHaveBeenCalledTimes(1);
    await act(async () => { resolve?.(delivery('d9', 'Sensor safety check')); }); await flush();
  });

  it('explains a quiz assigned elsewhere in the meantime, clears it and refreshes', async () => {
    api.createQuizDelivery.mockRejectedValue(new ApiError(409, 'This quiz is already assigned to the classroom.'));
    await render();
    await click(button('Assign a quiz'));
    await pickQuiz('q1');
    const loads = api.publishedQuizzes.mock.calls.length;
    await submitAssign();
    expect(alertText()).toBe('This quiz is already assigned to this classroom. The list has been refreshed.');
    expect(api.publishedQuizzes.mock.calls.length).toBeGreaterThan(loads);
    expect(button('Add as draft').disabled).toBe(true); // selection cleared
    expect(api.toast).not.toHaveBeenCalled();
  });

  it('maps unavailable quizzes, date, permission, session and network errors without losing a retryable choice', async () => {
    api.createQuizDelivery
      .mockRejectedValueOnce(new ApiError(400, 'Quiz delivery dates must be ordered: availability, due date, then close date.'))
      .mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'))
      .mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError(404, 'Published quiz was not found for this classroom course.'));
    await render();
    await click(button('Assign a quiz'));
    await pickQuiz('q2');
    await submitAssign(); expect(alertText()).toContain('Check the dates');
    await submitAssign(); expect(alertText()).toBe(QUIZ_ACCESS_MESSAGE);
    await submitAssign(); expect(alertText()).toBe('Your session has ended. Sign in again, then try again.');
    await submitAssign(); expect(alertText()).toBe('VISTA couldn’t be reached. Check your connection, then try again.');
    expect(button('Add as draft').disabled).toBe(false); // the choice is kept for a retry
    await wait(20); expect(document.activeElement?.textContent).toBe('Add as draft'); // focus on the retry, not the top of the list
    await submitAssign(); expect(alertText()).toContain('This quiz can’t be assigned any more.');
    expect(button('Add as draft').disabled).toBe(true);
    await wait(20); expect(document.activeElement?.getAttribute('name')).toBe('quiz'); // retry is gone: back to the list
    expect(api.createQuizDelivery).toHaveBeenCalledTimes(5);
  });

  it('offers retry when ready quizzes fail to load, and explains when none are ready', async () => {
    api.publishedQuizzes.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce([]);
    await render();
    await click(button('Assign a quiz'));
    expect(alertText()).toContain('Quizzes couldn’t be loaded');
    await click(button('Try again'));
    expect(dialog().textContent).toContain('No quizzes are ready to assign.');
    expect(button('Add as draft').disabled).toBe(true);
    expect(dialog().querySelector('input[name="availableFrom"]')).toBeNull(); // nothing to schedule without a quiz
  });
});

describe('Publish a quiz (A04)', () => {
  it('confirms with Cancel focused, explains what students get, and publishes after the server confirms', async () => {
    api.publish.mockResolvedValue({ ...delivery('d1', 'Safety basics'), status: 'published' });
    await render();
    await click(button('Publish Safety basics'));
    await wait(60);
    expect(document.activeElement?.textContent).toBe('Cancel');
    expect(dialog().textContent).toContain('Students in Robotics 8A will see this quiz straight away.');
    expect(dialog().textContent).toContain('can’t be moved back to draft');
    const loads = api.list.mock.calls.length;
    await click(button('Publish quiz'));
    expect(api.publish).toHaveBeenCalledWith('class-1', 'a-d1', 'token');
    expect(api.toast).toHaveBeenCalledWith('Quiz published', { description: 'Students in Robotics 8A can take Safety basics now.' });
    expect(api.list.mock.calls.length).toBeGreaterThan(loads);
  });

  it('explains archived classrooms and unpublished questions, keeps the dialog open and refreshes', async () => {
    api.publish
      .mockRejectedValueOnce(new ApiError(409, 'Assignments cannot be published to an inactive classroom.'))
      .mockRejectedValueOnce(new ApiError(409, 'Quiz requires published QuestionVersions before delivery.'));
    await render();
    await click(button('Publish Safety basics'));
    const loads = api.list.mock.calls.length;
    await click(button('Publish quiz'));
    expect(alertText()).toBe('This classroom is no longer active, so quizzes can’t be published. A school administrator can reactivate it.');
    expect(api.list.mock.calls.length).toBeGreaterThan(loads);
    await click(button('Publish quiz'));
    expect(alertText()).toContain('Some of this quiz’s questions are no longer published');
    expect(api.toast).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Publish quiz');
  });
});

describe('quiz delivery model (A04)', () => {
  const now = Date.parse('2030-03-05T00:00:00Z');
  it('derives what students experience from the server status and window', () => {
    expect(deliveryPhase({ status: 'draft', available_from: null, close_at: null }, now).label).toBe('Draft');
    expect(deliveryPhase({ status: 'published', available_from: '2030-03-06T00:00:00Z', close_at: null }, now).label).toBe('Scheduled');
    expect(deliveryPhase({ status: 'published', available_from: '2030-03-01T00:00:00Z', close_at: '2030-03-10T00:00:00Z' }, now).label).toBe('Open');
    expect(deliveryPhase({ status: 'published', available_from: null, close_at: '2030-03-04T00:00:00Z' }, now).label).toBe('Closed');
    expect(deliveryPhase({ status: 'closed', available_from: null, close_at: null }, now).label).toBe('Closed');
    expect(deliveryPhase({ status: 'archived', available_from: null, close_at: null }, now).label).toBe('Archived');
    // students can't start anything in an archived classroom, so a published quiz there is not 'Open'
    expect(deliveryPhase({ status: 'published', available_from: null, close_at: null }, now, false).label).toBe('Unavailable');
    expect(deliveryPhase({ status: 'draft', available_from: null, close_at: null }, now, false).label).toBe('Draft');
  });
  it('mirrors the server date-order and attempt rules', () => {
    const empty = { availableFrom: '', dueAt: '', closeAt: '', maxAttempts: '' };
    expect(validateSchedule(empty)).toEqual({});
    expect(validateSchedule({ ...empty, availableFrom: '2030-03-02T09:00', closeAt: '2030-03-02T09:00' }).closeAt).toBe('The quiz must close after it opens.');
    expect(validateSchedule({ ...empty, dueAt: '2030-03-05T09:00', closeAt: '2030-03-04T09:00' }).closeAt).toBe('The quiz can’t close before it’s due.');
    expect(validateSchedule({ ...empty, availableFrom: '2030-03-02T09:00', dueAt: '2030-03-02T09:00', closeAt: '2030-03-03T09:00' })).toEqual({}); // due may equal open
    for (const value of ['0', '101', '2.5', 'abc']) expect(validateSchedule({ ...empty, maxAttempts: value }).maxAttempts).toBeDefined();
    expect(validateSchedule({ ...empty, maxAttempts: '100' })).toEqual({});
    expect(scheduleBody('q1', empty)).toEqual({ canonicalAssignmentId: 'q1' });
  });
  it('uses plain messages and never shows a raw server error for 5xx', () => {
    expect(quizDeliveryErrorMessage(new ApiError(500, 'PrismaClientKnownRequestError: …'), 'assign')).toBe('VISTA couldn’t save this because of a problem on its side. Try again.');
    expect(quizDeliveryErrorMessage(new ApiError(409, 'Assignment cannot be published from its current state.'), 'publish')).toContain('can’t be published from its current status');
    expect(quizDeliveryErrorMessage(new ApiError(404, 'Assignment was not found.'), 'publish')).toContain('no longer in this classroom');
    // the scope guard's 404 means no quiz access, for every action; other 404s keep their own meaning
    for (const action of ['load', 'assign', 'publish'] as const) expect(quizDeliveryErrorMessage(new ApiError(404, 'Classroom was not found.'), action)).toBe(QUIZ_ACCESS_MESSAGE);
    expect(isQuizAccessDenied(new ApiError(404, 'Classroom was not found.'))).toBe(true);
    expect(isQuizAccessDenied(new ApiError(404, 'Published quiz was not found for this classroom course.'))).toBe(false);
    expect(isQuizAccessDenied(new ApiError(403, 'Classroom was not found.'))).toBe(false);
    expect(isStaleQuizError(new ApiError(404, 'Classroom was not found.'))).toBe(false);
    expect(isStaleQuizError(new ApiError(404, 'Published quiz was not found for this classroom course.'))).toBe(true);
    expect(quizDeliveryErrorMessage(new ApiError(404, 'Cannot GET /x'), 'load')).not.toMatch(/removed/);
  });
});
