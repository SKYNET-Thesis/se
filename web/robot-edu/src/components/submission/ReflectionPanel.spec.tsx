// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFLECTION_PROMPT, REFLECTION_PROMPT_KEY, ReflectionPanel } from './ReflectionPanel';

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), reflectionApi: api }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
async function mount(unlocked: boolean) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReflectionPanel submissionId="sub-1" token="t" unlocked={unlocked} /></QueryClientProvider>));
  await wait();
  return { container, unmount: () => act(() => root.unmount()) };
}
const type = async (el: HTMLTextAreaElement, value: string) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!; set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); };

describe('ReflectionPanel', () => {
  beforeEach(() => { api.list.mockResolvedValue([]); api.create.mockResolvedValue({}); });
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('stays closed until the instructor has released feedback, but still shows what was saved', async () => {
    api.list.mockResolvedValue([{ id: 'r1', submission_id: 'sub-1', prompt_key: 'k', prompt_text: 'p', response_text: 'I would test the gripper first.', created_at: '2026-11-23T10:00:00Z' }]);
    const view = await mount(false);
    expect(view.container.textContent).toContain('once your instructor has released feedback');
    expect(view.container.querySelector('textarea')).toBeNull();
    expect(view.container.textContent).toContain('I would test the gripper first.');
    await view.unmount();
  });

  it('saves one reflection with the post-assessment prompt, clears the box and reloads the list', async () => {
    const view = await mount(true);
    const form = view.container.querySelector('form')!;
    const box = view.container.querySelector('textarea') as HTMLTextAreaElement;
    const save = [...view.container.querySelectorAll('button')].find((b) => /Save reflection/.test(b.textContent ?? ''))!;
    expect(save.disabled).toBe(true);                                   // nothing to save yet
    await type(box, '  I would check the safety limits first.  ');
    expect(save.disabled).toBe(false);
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    await wait();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create).toHaveBeenCalledWith('sub-1', 't', { promptKey: REFLECTION_PROMPT_KEY, promptText: REFLECTION_PROMPT, responseText: 'I would check the safety limits first.' });
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(2);       // refreshed after the server confirmed
    await view.unmount();
  });

  it('shows the server refusal in words and keeps what the learner wrote', async () => {
    api.create.mockRejectedValueOnce(new Error('You can write a reflection once your instructor has assessed this submission.'));
    const view = await mount(true);
    await type(view.container.querySelector('textarea') as HTMLTextAreaElement, 'My notes');
    await act(async () => { view.container.querySelector('form')!.requestSubmit(); });
    await wait();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('once your instructor has assessed');
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('My notes');
    await view.unmount();
  });
});
