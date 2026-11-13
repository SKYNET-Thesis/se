// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./SidebarNav', () => ({
  SidebarNav: () => <nav aria-label="Global navigation">Dashboard Courses My Learning</nav>,
}));
vi.mock('./VistaMark', () => ({
  VistaMark: () => <span>VISTA</span>,
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({
    client: { auth: { signOut: vi.fn() } },
    session: { user: { email: 'student@example.com', user_metadata: { full_name: 'Student' } } },
  }),
}));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: 'student' }) }));

describe('AppShell focused learning navigation', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="courses/:courseId/lessons/:lessonId/activities/:activityId" element={<p>Activity content</p>} />
              <Route path="courses/:courseId" element={<p>Course path</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it('hides the persistent global sidebar on focused activity routes and opens it as a temporary drawer', async () => {
    await renderAt('/courses/course-1/lessons/lesson-2/activities/reading-1');

    const persistentSidebar = container.querySelector('aside');
    expect(persistentSidebar?.className).not.toContain('w-[240px]');
    expect(persistentSidebar?.className).not.toContain('lg:flex');
    expect(container.querySelector('button[aria-label="Open navigation"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Activity content');

    await act(async () => { (container.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Open navigation"]')?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });
    expect(container.querySelector('button[aria-label="Open navigation"]')?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => { (container.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector('div.fixed > div[aria-hidden="true"]') as HTMLDivElement).click(); });
    expect(container.querySelector('button[aria-label="Open navigation"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('places the notification bell before Settings and the account avatar in the global header', async () => {
    await renderAt('/courses/course-1');
    const header = container.querySelector('header') as HTMLElement;
    const controls = [...header.querySelectorAll('[data-testid="notification-bell"], a[aria-label="Web settings"], button[aria-label="Account menu"]')].map((el) => el.getAttribute('data-testid') ?? el.getAttribute('aria-label'));
    expect(controls).toEqual(['notification-bell', 'Web settings', 'Account menu']);
    expect(header.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label')).toMatch(/^Notifications/);
    expect(container.querySelectorAll('[data-testid="notification-bell"]').length).toBe(2); // desktop header + compact top bar, one visible per breakpoint
  });

  it('keeps the persistent global sidebar on a normal course route', async () => {
    await renderAt('/courses/course-1');

    expect(container.querySelector('aside')?.className).toContain('w-[240px]');
    expect(container.textContent).toContain('Course path');
  });
});
