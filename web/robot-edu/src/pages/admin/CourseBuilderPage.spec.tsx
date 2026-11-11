// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseBuilderPage } from './CourseBuilderPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = vi.hoisted(() => ({ value: 'draft' }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 't' } }) }));
vi.mock('../../lib/api', () => ({
  catalogApi: { courses: vi.fn(async () => ({ items: [{ id: 'c1', title: 'Robotics', description: null, status: status.value }], page: 1, pageSize: 100 })) },
}));
vi.mock('./CanonicalCurriculumEditor', () => ({
  CanonicalCurriculumEditor: ({ modalRequest }: { modalRequest?: { kind: string } | null }) => <div>editor modal:{modalRequest?.kind ?? 'none'}</div>,
}));
vi.mock('../../components/authoring/MediaAssetLibraryModal', () => ({ MediaAssetLibraryModal: () => null }));

describe('Course Builder Preview and Publish tabs', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { status.value = 'draft'; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  async function mount() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/admin/courses/c1/edit']}>
          <Routes><Route element={<Outlet context={{ toggleGlobalNavigation: vi.fn(), globalNavigationOpen: false, registerNavigationGuard: () => vi.fn() }} />}>
            <Route path="/admin/courses/:courseId/edit" element={<CourseBuilderPage />} />
          </Route></Routes>
        </MemoryRouter>
      </QueryClientProvider>));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  const tab = (label: string) => [...container.querySelectorAll('nav button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  it('opens the learner preview modal from the Preview tab', async () => {
    await mount();
    await act(async () => tab('Preview').click());
    expect(container.textContent).toContain('editor modal:preview');
  });

  it('routes Publish for a draft course through the readiness checklist', async () => {
    await mount();
    await act(async () => tab('Publish').click());
    expect(container.textContent).toContain('editor modal:readiness');
  });

  it('does not offer publishing for a non-draft course', async () => {
    status.value = 'published';
    await mount();
    await act(async () => tab('Publish').click());
    expect(container.textContent).toContain('Only draft courses can be published');
    expect(container.textContent).not.toContain('editor modal:readiness');
  });
});
