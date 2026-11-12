// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LearnerPreviewModal } from './LearnerPreviewModal';

const api = vi.hoisted(() => ({ sections: vi.fn() }));
vi.mock('../../lib/api', () => ({ curriculumApi: { sections: api.sections } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const course = { id: 'c1', title: 'Robot Vision', description: 'Overview', status: 'draft' } as never;
const lessons = [{ id: 'l1', title: 'Module A', ordinal: 1 }, { id: 'l2', title: 'Module B', ordinal: 2 }] as never;
const sectionsOf = (lessonId: string, activity: string) => [{ id: `s-${lessonId}`, title: `Lesson of ${lessonId}`, ordinal: 1, status: 'draft', learning_activities: [{ id: `a-${lessonId}`, title: activity, type: 'reading', ordinal: 1, required: true }] }];

describe('LearnerPreviewModal', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; vi.clearAllMocks(); document.body.innerHTML = ''; });
  const mount = () => { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return (open: boolean, selectedLessonId?: string, sections: unknown[] = []) => act(async () => { root!.render(createElement(QueryClientProvider, { client }, createElement(LearnerPreviewModal, { open, onClose: vi.fn(), course, lessons, sections: sections as never, selectedLessonId, token: 'token-1' }))); }); };
  const text = () => document.body.textContent ?? '';
  const lessonButton = (title: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(title) && /\d\./.test(b.textContent ?? '')) as HTMLButtonElement;

  it('opens on the lesson selected in the editor even when that selection changed after the modal mounted', async () => {
    const render = mount();
    await render(false, undefined, []); // mounted closed while nothing was selected
    await render(true, 'l2', sectionsOf('l2', 'Hand-eye reading'));
    expect(text()).toMatch(/Current Lesson\s*Module B/i);
    expect(text()).toContain('Hand-eye reading');
    expect(api.sections).not.toHaveBeenCalled(); // the editor's own sections are used, no extra request
  });

  it('loads the saved sections of another lesson instead of showing the selected lesson\'s sections under it', async () => {
    api.sections.mockResolvedValue(sectionsOf('l1', 'Camera models'));
    const render = mount();
    await render(true, 'l2', sectionsOf('l2', 'Hand-eye reading'));
    await act(async () => { lessonButton('Module A').click(); });
    await vi.waitFor(() => expect(text()).toContain('Camera models'));
    expect(api.sections).toHaveBeenCalledWith('l1', 'token-1');
    expect(text()).toMatch(/Current Lesson\s*Module A/i);
    expect(text()).not.toContain('Hand-eye reading');
  });
});
