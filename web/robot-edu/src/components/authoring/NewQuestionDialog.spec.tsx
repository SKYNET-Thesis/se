// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewQuestionDialog } from './NewQuestionDialog';

const api = vi.hoisted(() => ({ objectives: vi.fn(), authorQuestion: vi.fn() }));
vi.mock('../../lib/api', () => ({ quizAuthoringApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('NewQuestionDialog', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = async (onCreated = vi.fn(), onClose = vi.fn()) => {
    api.objectives.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(NewQuestionDialog, { open: true, onClose, lessonId: 'lesson-1', token: 'token', onCreated }))); await new Promise((r) => setTimeout(r, 0)); });
    return { onCreated, onClose };
  };
  const set = async (el: Element, value: string) => { await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
  }); };
  const byLabel = (text: string) => document.querySelector(`[aria-label="${text}"]`) as HTMLInputElement;
  const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
  const save = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save and publish question');

  it('refuses an incomplete question locally without calling the API', async () => {
    await mount();
    await click(save());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enter the question text.');
    expect(api.authorQuestion).not.toHaveBeenCalled();
  });

  it('requires two correct answers for multiple choice and an explanation before publishing', async () => {
    await mount();
    await set(document.querySelector('textarea')!, 'Pick the safe checks');
    await set(byLabel('Option 1'), 'Emergency stop'); await set(byLabel('Option 2'), 'Clear space');
    await click(byLabel('Correct answer 1'));
    await click(save());
    expect(api.authorQuestion).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sends one structured request with the server-derived school scope (no organization id) and closes on success', async () => {
    api.authorQuestion.mockResolvedValue({ questionId: 'q', versionId: 'v', status: 'published' });
    const { onCreated, onClose } = await mount();
    const [stem, explanation] = [...document.querySelectorAll('textarea')];
    await set(stem, 'Which command stops the robot?');
    await set(byLabel('Option 1'), 'Stop'); await set(byLabel('Option 2'), 'Go');
    await click(byLabel('Correct answer 1'));
    await set(explanation, 'Stop halts all joints.');
    await set(document.querySelector('input[placeholder="Learners can …"]')!, 'Learners can stop a robot.');
    await click(save());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(api.authorQuestion).toHaveBeenCalledTimes(1);
    const [lessonId, token, body] = api.authorQuestion.mock.calls[0];
    expect([lessonId, token]).toEqual(['lesson-1', 'token']);
    expect(body).toMatchObject({ newObjective: 'Learners can stop a robot.', content: { type: 'single_choice', answerKey: ['a'], stem: 'Which command stops the robot?' } });
    expect(JSON.stringify(body)).not.toMatch(/organization/i);
    expect(onCreated).toHaveBeenCalled(); expect(onClose).toHaveBeenCalled();
  });
});
