// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sessionState = vi.hoisted(() => ({ value: { session: { access_token: 't', user: { id: 'u1', email: 'student@vista.io' } }, loading: false, sessionRevision: 0 } }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => sessionState.value }));
vi.mock('../contexts/RoleContext', () => ({ useRole: () => ({ role: 'student', loading: false }) }));

import { MyLearning } from './MyLearning';
import { Courses } from './Courses';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
let fetchMock: ReturnType<typeof vi.fn>; let root: Root; let container: HTMLDivElement;
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
const answer = (overrides: Record<string, () => Promise<Response>>) => fetchMock.mockImplementation((url: string) => {
  const text = String(url);
  for (const [fragment, reply] of Object.entries(overrides)) if (text.includes(fragment)) return reply();
  if (text.includes('/me/quizzes')) return json(200, []);
  if (text.includes('/me/attempts')) return json(200, []);
  if (text.includes('/courses?')) return json(200, { items: [], page: 1, pageSize: 100 });
  return json(200, []);
});
const mount = async (page: 'my-learning' | 'courses') => { await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page === 'my-learning' ? <MyLearning /> : <Courses />}</MemoryRouter></QueryClientProvider>); }); await flush(); };
const text = () => container.textContent ?? '';

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

describe('My Learning: failures are never shown as "no courses"', () => {
  it('network failure: a clear message and Retry, no empty state', async () => {
    answer({ '/me/enrollments': () => Promise.reject(new TypeError('Failed to fetch')) });
    await mount('my-learning');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('couldn’t be reached');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true);
    expect(text()).not.toMatch(/no courses|not enrolled|nothing here yet/i);
  });
  it('expired session (401): says so, offers Sign in again and no pointless Retry', async () => {
    answer({ '/me/enrollments': () => json(401, { message: 'Unauthorized' }) });
    await mount('my-learning');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('session has expired');
    expect(container.querySelector('a[href="/login"]')?.textContent).toBe('Sign in again');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(false);
  });
  it('permission failure (403): explains it without Retry', async () => {
    answer({ '/me/enrollments': () => json(403, { message: 'Forbidden resource' }) });
    await mount('my-learning');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('isn’t allowed');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(false);
  });
  it('server failure: plain wording, never the raw database text', async () => {
    answer({ '/me/enrollments': () => json(500, { message: 'FATAL: (EMAXCONNSESSION) max clients reached' }) });
    await mount('my-learning');
    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('couldn’t be loaded'); expect(alert).not.toContain('EMAXCONN');
  });
  it('a genuinely empty enrolment list still shows the empty state, with no error', async () => {
    answer({ '/me/enrollments': () => json(200, []) });
    await mount('my-learning');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toMatch(/no courses|not enrolled|nothing|enrolled/i);
  });
});

describe('Courses: a failed load is an error, not "No courses yet"', () => {
  it('shows the explained error and no empty-state card when the learning requests fail', async () => {
    answer({ '/me/enrollments': () => Promise.reject(new TypeError('Failed to fetch')) });
    await mount('courses');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('couldn’t be reached');
    expect(text()).not.toContain('No courses yet');
  });
  it('still shows "No courses yet" when the lists really are empty', async () => {
    answer({ '/me/enrollments': () => json(200, []) });
    await mount('courses');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('No courses yet');
  });
});
