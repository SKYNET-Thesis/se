// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const signOut = vi.hoisted(() => vi.fn());
vi.mock('./SidebarNav', () => ({ SidebarNav: ({ onNavigate }: { onNavigate?: () => void }) => <nav aria-label="Global navigation"><a href="#x" onClick={onNavigate}>Courses</a></nav> }));
vi.mock('./VistaMark', () => ({ VistaMark: () => <span>VISTA</span> }));
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ client: { auth: { signOut } }, session: { user: { email: 'ada@school.edu', user_metadata: { full_name: 'Ada Lovelace' } } } }) }));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: 'school_admin' }) }));

let root: Root; let container: HTMLDivElement;
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const render = async (path = '/courses') => {
  await act(async () => {
    root.render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}>
      <Route path="courses" element={<Where />} /><Route path="account" element={<Where />} /><Route path="settings" element={<Where />} /><Route path="login" element={<Where />} /></Route>
      <Route path="login" element={<Where />} /></Routes></MemoryRouter></QueryClientProvider>);
    await Promise.resolve();
  });
};
const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };
const gone = async () => { for (let i = 0; i < 60 && drawer(); i += 1) await tick(); };
const openDrawer = async () => { await act(async () => { (document.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement).click(); }); await tick(); };
const drawer = () => document.querySelector('[role="dialog"][aria-label="Navigation"]') as HTMLElement | null;

beforeEach(() => { signOut.mockReset().mockResolvedValue({ error: null }); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('mobile navigation drawer: account and sign-out', () => {
  it('offers identity, Account Settings, Settings and Logout inside the drawer, which is the only account surface below the desktop breakpoint', async () => {
    await render(); await openDrawer();
    const account = drawer()!.querySelector('section[aria-label="Account"]') as HTMLElement;
    expect(account.textContent).toContain('Ada Lovelace'); expect(account.textContent).toContain('ada@school.edu'); expect(account.textContent).toContain('school admin');
    expect([...account.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['Account Settings', '/account'], ['Settings', '/settings']]);
    expect([...account.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Logout']);
  });
  it('signs out, closes the drawer and sends the user to the sign-in page', async () => {
    await render(); await openDrawer();
    const logout = [...drawer()!.querySelectorAll('button')].find((button) => button.textContent === 'Logout') as HTMLButtonElement;
    await act(async () => { logout.click(); }); await gone();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="where"]')?.textContent).toBe('/login');
    expect(drawer()).toBeNull();
  });
  it('Account Settings navigates and closes the drawer without signing out', async () => {
    await render(); await openDrawer();
    await act(async () => { (drawer()!.querySelector('a[href="/account"]') as HTMLAnchorElement).click(); }); await gone();
    expect(document.querySelector('[data-testid="where"]')?.textContent).toBe('/account');
    expect(drawer()).toBeNull(); expect(signOut).not.toHaveBeenCalled();
  });
  it('moves focus into the drawer when it opens and back to the menu button when Escape, the close button or the backdrop dismisses it', async () => {
    await render();
    const menu = document.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement;
    await openDrawer();
    expect(document.activeElement).toBe(document.querySelector('button[aria-label="Close navigation"]'));
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await gone(); await tick();
    expect(drawer()).toBeNull(); expect(document.activeElement).toBe(menu);
    await openDrawer();
    await act(async () => { (document.querySelector('button[aria-label="Close navigation"]') as HTMLButtonElement).click(); }); await gone(); await tick();
    expect(drawer()).toBeNull(); expect(document.activeElement).toBe(menu);
  });
  it('keeps the existing drawer behaviour: navigation links still close it and the drawer stays hidden until opened', async () => {
    await render();
    expect(drawer()).toBeNull();
    await openDrawer();
    await act(async () => { (drawer()!.querySelector('nav a') as HTMLAnchorElement).click(); }); await gone();
    expect(drawer()).toBeNull();
  });
  it('leaves the desktop header account menu untouched (it still carries Logout)', async () => {
    await render();
    const avatar = document.querySelector('button[aria-label="Account menu"]') as HTMLButtonElement;
    await act(async () => { avatar.click(); });
    expect(document.body.textContent).toContain('Logout');
    expect(drawer()).toBeNull();
  });
});
