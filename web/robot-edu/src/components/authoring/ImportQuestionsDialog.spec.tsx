// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportQuestionsDialog } from './ImportQuestionsDialog';

const api = vi.hoisted(() => ({ objectives: vi.fn(), importPreview: vi.fn(), importCommit: vi.fn(), downloadTemplate: vi.fn() }));
vi.mock('../../lib/api', () => ({ quizAuthoringApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ImportQuestionsDialog', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const preview = { total: 3, valid: 1, invalid: 1, duplicates: 1, items: [
    { rowNumber: 2, status: 'valid', errors: [], stem: 'Good?' },
    { rowNumber: 3, status: 'invalid', errors: ['correct is required.'], stem: 'Bad?' },
    { rowNumber: 4, status: 'duplicate', errors: [], duplicateOf: { existingCode: 'Q-1' }, stem: 'Dup?' }] };
  const mount = async (onImported = vi.fn()) => {
    api.objectives.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(ImportQuestionsDialog, { open: true, onClose: vi.fn(), lessonId: 'l1', token: 't', onImported }))); await Promise.resolve(); });
    return onImported;
  };
  const pick = async () => { const input = document.querySelector('input[type="file"]') as HTMLInputElement; const file = new File(['x'], 'q.csv');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); }); return file; };
  const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text)) as HTMLButtonElement | undefined;

  it('shows row-level errors and duplicates, requires an outcome, then imports only after confirmation', async () => {
    api.importPreview.mockResolvedValue(preview);
    api.importCommit.mockResolvedValue({ ...preview, created: 1, failed: 0, results: [{ rowNumber: 2, status: 'created', versionId: 'v1', points: 3 }] });
    const onImported = await mount();
    const file = await pick();
    expect(api.importPreview).toHaveBeenCalledWith('l1', 't', file);
    expect(document.body.textContent).toContain('1 valid · 1 with errors · 1 duplicate');
    expect([...document.querySelectorAll('tbody td span')].map((el) => el.textContent)).toEqual(expect.arrayContaining(['valid', 'invalid', 'duplicate']));
    expect(document.body.textContent).toContain('correct is required.');
    expect(document.body.textContent).toContain('Already in Question Bank (Q-1)');
    expect(button('Import 1 valid')!.disabled).toBe(true);
    expect(api.importCommit).not.toHaveBeenCalled();
    const input = document.querySelector('input[maxlength="500"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Outcome'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { button('Import 1 valid')!.click(); await Promise.resolve(); });
    expect(api.importCommit).toHaveBeenCalledWith('l1', 't', file, { newObjective: 'Outcome' });
    expect(onImported).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Imported 1 question.');
  });

  it('surfaces a file-level rejection', async () => {
    api.importPreview.mockRejectedValue(new Error('Missing required column "stem".'));
    await mount(); await pick();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Missing required column');
  });
});
