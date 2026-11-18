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
const roleState = vi.hoisted(() => ({ role: 'student' as string | null }));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: roleState.role }) }));

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
    roleState.role = 'student';
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

  it('A07: moves focus into the mobile navigation, offers account controls there, and returns focus on close', async () => {
    await renderAt('/courses/course-1');
    const opener = container.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement;
    opener.focus();
    await act(async () => { opener.click(); await new Promise((resolve) => window.setTimeout(resolve, 60)); });
    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close navigation');
    // Phones have no header account menu, so these must be reachable from the drawer.
    expect([...drawer.querySelectorAll('a, button')].map((el) => el.textContent?.trim()).filter(Boolean)).toEqual(expect.arrayContaining(['Account settings', 'Web settings', 'Sign out']));
    expect(drawer.textContent).toContain('Student');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await new Promise((resolve) => window.setTimeout(resolve, 250)); });
    expect(document.activeElement).toBe(opener);
  });

  it('A07: closes the account menu with Escape (focus back on the avatar) and with a click outside', async () => {
    await renderAt('/courses/course-1');
    const avatar = container.querySelector('button[aria-label="Account menu"]') as HTMLButtonElement;
    await act(async () => { avatar.click(); });
    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Sign out');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(avatar);
    await act(async () => { avatar.click(); });
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the persistent global sidebar on a normal course route', async () => {
    await renderAt('/courses/course-1');

    expect(container.querySelector('aside')?.className).toContain('w-[240px]');
    expect(container.textContent).toContain('Course path');
  });

  it('gives every role the same VISTA identity: no role palette class, shared accent tokens', async () => {
    for (const role of ['student', 'teacher', 'teaching_assistant', 'school_admin', 'admin', null]) {
      roleState.role = role;
      await renderAt('/courses/course-1'); // same root: the shell re-renders with each role
      expect(document.body.className).toBe('');
      const avatar = container.querySelector('button[aria-label="Account menu"]')?.className ?? '';
      expect(avatar).toContain('bg-accent'); expect(avatar).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });
});
