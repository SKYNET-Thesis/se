// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssignmentConfigPanel } from './AssignmentConfigPanel';

const api = vi.hoisted(() => ({ getRubric: vi.fn(), replaceRubric: vi.fn(), updateSchedule: vi.fn() }));
vi.mock('../../lib/api', () => ({ assignmentApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AssignmentConfigPanel', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const rubric = (over = {}) => ({ assignmentId: 'a', criteria: [{ id: 'c1', title: 'Sequence', description: null, maxPoints: 6, ordinal: 1 }], editable: true, lockedReason: null, totalPoints: 6, ...over });
  const mount = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(AssignmentConfigPanel, { classroomId: 'room', assignmentId: 'a', token: 't', schedule: { maxAttempts: 2 } }))); });
    await new Promise((r) => setTimeout(r, 30)); await settle();
  };
  const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };
  const set = async (el: Element, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
  const byLabel = (l: string) => document.querySelector(`[aria-label="${l}"]`) as HTMLInputElement;

  it('edits and saves the rubric, computing the total and blocking invalid criteria', async () => {
    api.getRubric.mockResolvedValue(rubric()); api.replaceRubric.mockResolvedValue(rubric({ totalPoints: 10 }));
    await mount();
    expect(document.body.textContent).toContain('Total: 6 points');
    await act(async () => { button('Add criterion')!.click(); });
    expect(button('Save rubric')!.disabled).toBe(true); // new criterion has no title
    await set(byLabel('Criterion 2 title'), 'Safety'); await set(byLabel('Criterion 2 max points'), '4');
    expect(document.body.textContent).toContain('Total: 10 points');
    await act(async () => { button('Save rubric')!.click(); await Promise.resolve(); });
    expect(api.replaceRubric).toHaveBeenCalledWith('room', 'a', 't', [{ title: 'Sequence', maxPoints: 6 }, { title: 'Safety', maxPoints: 4 }]);
  });

  it('is read-only with the reason once submissions were scored', async () => {
    api.getRubric.mockResolvedValue(rubric({ editable: false, lockedReason: 'Submissions have already been scored against this rubric.' }));
    await mount();
    expect(document.body.textContent).toContain('already been scored');
    expect(button('Save rubric')).toBeUndefined();
    expect(byLabel('Criterion 1 title').disabled).toBe(true);
  });

  it('saves the schedule and shows the server validation error', async () => {
    api.getRubric.mockResolvedValue(rubric());
    api.updateSchedule.mockRejectedValueOnce(new Error('The due date must be after the opening date.')).mockResolvedValueOnce({});
    await mount();
    await act(async () => { button('Save schedule')!.click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(api.updateSchedule).toHaveBeenCalledWith('room', 'a', 't', { availableFrom: null, dueAt: null, closeAt: null, maxAttempts: 2 });
    expect(document.body.textContent).toContain('due date must be after');
    await act(async () => { button('Save schedule')!.click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(document.body.textContent).toContain('Schedule saved.');
  });
});
