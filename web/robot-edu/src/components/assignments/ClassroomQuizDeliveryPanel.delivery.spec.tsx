// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassroomQuizDeliveryPanel } from './ClassroomQuizDeliveryPanel';

const api = vi.hoisted(() => ({ publishedQuizzes: vi.fn(), list: vi.fn(), publish: vi.fn(), createQuizDelivery: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), assignmentApi: api }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const delivery = (over: Record<string, unknown> = {}) => ({ id: 'cls-asg-1', assignment_id: 'asg-1', title: 'Safety quiz', lesson_title: 'Lesson 1', status: 'draft', constraints: { kind: 'knowledge_check' }, available_from: '2026-11-03T09:00:00Z', due_at: null, close_at: null, max_attempts: 2, ...over });

async function mount() {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}><ClassroomQuizDeliveryPanel classroomId="room-1" token="t" /></QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  return { container, unmount: () => act(() => root.unmount()) };
}
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); await new Promise((resolve) => setTimeout(resolve, 10)); }); };
const button = (label: RegExp) => [...document.querySelectorAll('button')].find((b) => label.test(b.textContent ?? ''));

describe('ClassroomQuizDeliveryPanel delivery list, confirmation and retry', () => {
  beforeEach(() => { api.publishedQuizzes.mockResolvedValue([]); api.list.mockResolvedValue([delivery()]); api.publish.mockResolvedValue({}); });
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('shows each delivery with its status in words, schedule and attempt limit', async () => {
    const view = await mount();
    const text = view.container.textContent ?? '';
    expect(text).toContain('Draft — not visible to students');
    expect(text).toMatch(/Opens .*2026/);
    expect(text).toContain('2 attempts');
    await view.unmount();
  });

  it('asks before publishing: Cancel is focused and publishes nothing; confirming publishes exactly once', async () => {
    const view = await mount();
    await click(button(/Publish to learners/));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Students in this classroom will see “Safety quiz” immediately');
    expect(document.activeElement?.textContent).toBe('Cancel');
    await click(button(/^Cancel$/));
    expect(api.publish).not.toHaveBeenCalled();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });   // the dialog leaves with its exit transition
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await click(button(/Publish to learners/));
    const confirm = button(/Publish to students/)!;
    await click(confirm); await click(confirm);
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(api.publish).toHaveBeenCalledWith('room-1', 'asg-1', 't');
    await view.unmount();
  });

  it('keeps the page usable when loading fails and offers Try again', async () => {
    api.list.mockRejectedValueOnce(new Error('The service is temporarily unavailable. Please try again shortly.'));
    const view = await mount();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('temporarily unavailable');
    api.list.mockResolvedValue([delivery()]);
    await click(button(/Try again/));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.container.textContent).toContain('Safety quiz');
    await view.unmount();
  });
});
