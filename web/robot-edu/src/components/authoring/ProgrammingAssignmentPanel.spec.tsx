// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgrammingAssignmentPanel } from './ProgrammingAssignmentPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('../../lib/api', () => ({ curriculumApi: { programmingAssignment: api.get, saveProgrammingAssignment: api.save } }));

const saved = { id: 'as-1', lessonId: 'l1', title: 'Reach Target A', instructions: 'Move the arm.', allowedBlocks: ['arm.select', 'home'], challengeId: null, kind: 'symbolic_program' };
const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });

describe('ProgrammingAssignmentPanel', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const render = async (props: Partial<Parameters<typeof ProgrammingAssignmentPanel>[0]> = {}) => {
    const onLinked = vi.fn(); const onDirtyChange = vi.fn();
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root!.render(createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(ProgrammingAssignmentPanel, { activityId: 'act-1', token: 'tok', activityTitle: 'Program the arm', onLinked, onDirtyChange, ...props }))); });
    await wait();
    return { host, onLinked, onDirtyChange };
  };
  const type = async (el: Element, value: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const btn = (host: HTMLElement, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
  const box = (host: HTMLElement, label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(label))!.querySelector('input') as HTMLInputElement;

  it('starts empty with the activity title and creates + links the assignment on first save', async () => {
    api.get.mockResolvedValue(null); api.save.mockResolvedValue(saved);
    const { host, onLinked } = await render();
    expect((host.querySelector('input[maxlength="200"]') as HTMLInputElement).value).toBe('Program the arm');
    expect(host.textContent).toContain('Not created yet');
    await act(async () => { box(host, 'Move to home').click(); box(host, 'Wait').click(); });
    await type(host.querySelector('textarea')!, '  Move the arm home, then wait.  ');
    await act(async () => { btn(host, 'Create programming assignment')!.click(); });
    await wait();
    expect(api.save).toHaveBeenCalledWith('act-1', 'tok', { title: 'Program the arm', instructions: 'Move the arm home, then wait.', allowedBlocks: ['home', 'wait'] });
    expect(onLinked).toHaveBeenCalledWith('as-1');
    expect(host.textContent).toContain('Linked to this activity');
  });

  it('does not call the API without a title or without any block, and shows why', async () => {
    api.get.mockResolvedValue(null);
    const { host } = await render();
    await act(async () => { btn(host, 'Create programming assignment')!.click(); });
    await wait();
    expect(api.save).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Choose at least one block');
    await type(host.querySelector('input[maxlength="200"]')!, '   ');
    await act(async () => { box(host, 'Wait').click(); btn(host, 'Create programming assignment')!.click(); });
    await wait();
    expect(api.save).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('title is required');
  });

  it('loads the saved configuration (reload) and edits it in place', async () => {
    api.get.mockResolvedValue(saved); api.save.mockResolvedValue({ ...saved, title: 'Reach Target B', allowedBlocks: ['arm.select', 'home', 'wait'] });
    const { host, onDirtyChange } = await render();
    expect((host.querySelector('input[maxlength="200"]') as HTMLInputElement).value).toBe('Reach Target A');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Move the arm.');
    expect(box(host, 'Select arm').checked && box(host, 'Move to home').checked && !box(host, 'Wait').checked).toBe(true);
    expect(btn(host, 'Save programming assignment')!.disabled).toBe(true); // nothing to save yet
    await type(host.querySelector('input[maxlength="200"]')!, 'Reach Target B');
    await act(async () => { box(host, 'Wait').click(); });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => { btn(host, 'Save programming assignment')!.click(); });
    await wait();
    expect(api.save).toHaveBeenCalledWith('act-1', 'tok', { title: 'Reach Target B', instructions: 'Move the arm.', allowedBlocks: ['arm.select', 'home', 'wait'] });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the author\'s edits and shows the server reason when saving is refused', async () => {
    api.get.mockResolvedValue(saved); api.save.mockRejectedValue(new Error('A delivered programming assignment cannot be edited.'));
    const { host } = await render();
    await type(host.querySelector('input[maxlength="200"]')!, 'Edited');
    await act(async () => { btn(host, 'Save programming assignment')!.click(); });
    await wait();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('delivered programming assignment cannot be edited');
    expect((host.querySelector('input[maxlength="200"]') as HTMLInputElement).value).toBe('Edited');
  });

  it('shows a live student view of the task', async () => {
    api.get.mockResolvedValue(saved);
    const { host } = await render();
    const view = host.querySelector('[aria-label="Student view"]')!.textContent;
    expect(view).toContain('Reach Target A'); expect(view).toContain('Move the arm.'); expect(view).toContain('Select arm, Move to home');
  });

  it('is read-only for an archived course and for an assignment not created in Course Builder', async () => {
    api.get.mockResolvedValue(saved);
    let r = await render({ readOnly: true });
    expect(r.host.textContent).toContain('archived'); expect(btn(r.host, 'Save programming assignment')).toBeUndefined();
    expect((r.host.querySelector('input[maxlength="200"]') as HTMLInputElement).disabled).toBe(true);
    root!.unmount(); document.body.innerHTML = '';
    api.get.mockResolvedValue({ ...saved, kind: null });
    r = await render();
    expect(r.host.textContent).toContain('not created in Course Builder'); expect(btn(r.host, 'Save programming assignment')).toBeUndefined();
  });

  it('surfaces a load failure instead of an empty form', async () => {
    api.get.mockRejectedValue(new Error('Referenced assignment must belong to the activity lesson.'));
    const { host } = await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('must belong to the activity lesson');
  });
});
