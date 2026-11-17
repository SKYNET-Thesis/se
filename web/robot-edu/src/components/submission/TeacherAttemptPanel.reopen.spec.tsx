// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ attemptFiles: vi.fn(), attemptFileUrl: vi.fn(), releaseGrading: vi.fn(), reopenGrading: vi.fn() }));
vi.mock('../../lib/api', () => ({ instructorApi: api }));
import { TeacherAttemptPanel } from './TeacherAttemptPanel';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TeacherAttemptPanel grade correction', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = async (released: boolean, onReleased = vi.fn()) => {
    api.attemptFiles.mockResolvedValue([]);
    const item = { origin: 'live', attempt: { id: 'att-1', attemptNumber: 1, gradingReleasedAt: released ? '2026-11-16T10:00:00Z' : null } } as never;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(TeacherAttemptPanel, { item, submissionId: 's1', token: 't', onReleased }))); });
    return onReleased;
  };
  const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;

  it('offers no reopen before release', async () => { await mount(false); expect(button('Reopen grading')).toBeUndefined(); });

  it('requires a reason, then withdraws the release through the API and refreshes', async () => {
    api.reopenGrading.mockResolvedValue({ reopened: true });
    const onReleased = await mount(true);
    await act(async () => { button('Reopen grading')!.click(); });
    expect(button('Withdraw release')!.disabled).toBe(true);
    const box = document.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'Mis-scored criterion 1'); box.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { button('Withdraw release')!.click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(api.reopenGrading).toHaveBeenCalledWith('att-1', 't', 'Mis-scored criterion 1');
    expect(onReleased).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Release withdrawn');
  });

  it('shows the server refusal (e.g. auto-graded results)', async () => {
    api.reopenGrading.mockRejectedValue(new Error('Automatically graded results cannot be reopened.'));
    await mount(true);
    await act(async () => { button('Reopen grading')!.click(); });
    const box = document.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'because reasons'); box.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { button('Withdraw release')!.click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(document.body.textContent).toContain('cannot be reopened');
  });
});
