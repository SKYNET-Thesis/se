// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurriculumItemEditor } from './CurriculumItemEditor';

const api = vi.hoisted(() => ({ updateLesson: vi.fn(), setLessonPrerequisites: vi.fn(), updateSection: vi.fn() }));
vi.mock('../../lib/api', () => ({ catalogApi: api, curriculumApi: api }));
vi.mock('./AddContentMenu', () => ({ AddContentMenu: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CurriculumItemEditor unlock rule', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = async (extra: Record<string, unknown> = {}) => {
    const onSaved = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(QueryClientProvider, { client }, createElement(CurriculumItemEditor, { kind: 'module', id: 'm2', title: 'Two', content: {}, lessonCount: 1, token: 't', onDirtyChange: vi.fn(), onSaved, onAddLesson: vi.fn(), earlierModules: [{ id: 'm1', title: 'One' }], prerequisiteLessonIds: [], ...extra } as never))); });
    return onSaved;
  };
  const save = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save module') as HTMLButtonElement;

  it('explains that the first module is always open', async () => {
    await mount({ earlierModules: [] });
    expect(document.body.textContent).toContain('first module');
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('saves only the changed unlock rule through the prerequisites API', async () => {
    api.setLessonPrerequisites.mockResolvedValue({});
    const onSaved = await mount();
    expect(save().disabled).toBe(true);
    await act(async () => { (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
    expect(save().disabled).toBe(false);
    await act(async () => { save().click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(api.setLessonPrerequisites).toHaveBeenCalledWith('m2', 't', ['m1']);
    expect(api.updateLesson).not.toHaveBeenCalled(); // title/summary untouched
    expect(onSaved).toHaveBeenCalled();
  });

  it('reflects an existing rule and surfaces a server refusal', async () => {
    api.setLessonPrerequisites.mockRejectedValue(new Error('Prerequisites cannot create a circular dependency.'));
    await mount({ prerequisiteLessonIds: ['m1'] });
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => { box.click(); });
    await act(async () => { save().click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('circular');
  });
});
