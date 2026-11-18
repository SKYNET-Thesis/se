// @vitest-environment jsdom
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types/user';

const mocks = vi.hoisted(() => ({
  role: 'student' as Role,
  courses: vi.fn(),
  lessons: vi.fn(),
  enrollments: vi.fn(),
  attempts: vi.fn(),
  coursePaths: vi.fn(),
}));

vi.mock('../contexts/RoleContext', () => ({
  useRole: () => ({ role: mocks.role, loading: false }),
}));

const mockSession = { access_token: 'fake-token', user: { email: 'student@vista.io' } };

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({
    session: mockSession,
  }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      courses: mocks.courses,
      lessons: mocks.lessons,
    },
    learnerApi: {
      ...actual.learnerApi,
      enrollments: mocks.enrollments,
      attempts: mocks.attempts,
    },
    progressionApi: {
      ...actual.progressionApi,
      coursePaths: mocks.coursePaths,
    },
  };
});

import { Courses } from './Courses';

describe('Courses role routing defense', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.courses.mockResolvedValue({ items: [] });
    mocks.lessons.mockResolvedValue([]);
    mocks.enrollments.mockResolvedValue([]);
    mocks.attempts.mockResolvedValue([]);
    mocks.coursePaths.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const renderAt = async (routes: React.ReactNode) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/courses']}><Routes>{routes}</Routes></MemoryRouter></QueryClientProvider>); });
    for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  it('redirects System Admin away from /courses to /admin/courses', async () => {
    mocks.role = 'admin';
    await renderAt(<><Route path="/courses" element={<Courses />} /><Route path="/admin/courses" element={<div data-testid="admin-page">Admin Courses Page</div>} /></>);

    expect(container.textContent).toContain('Admin Courses Page');
    expect(container.textContent).not.toContain('My learning');
    expect(container.textContent).not.toContain('Teacher assigned');
  });

  it('renders student course page for student role', async () => {
    mocks.role = 'student';
    await renderAt(<Route path="/courses" element={<Courses />} />);

    expect(container.querySelector('h1')?.textContent).toBe('Courses');
    expect(container.querySelectorAll('h2')).toHaveLength(0); // one heading, no repeated "Your courses"
    for (const text of ['Hi student', 'Keep going', 'How course access works']) expect(container.textContent).not.toContain(text);
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/my-learning')).toBe(false);
  });

  it('lists enrolled courses with progress and links an unfinished practice mission only when the API returns one', async () => {
    mocks.role = 'student';
    mocks.courses.mockResolvedValue({ items: [{ id: 'c1', title: 'Robotics Fundamentals', description: 'Robot arm basics', status: 'published' }] });
    mocks.enrollments.mockResolvedValue([{ course_id: 'c1', status: 'active' }]);
    mocks.coursePaths.mockResolvedValue([{ course: { id: 'c1' }, progressPercent: 40 }]);
    mocks.lessons.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    mocks.attempts.mockResolvedValue([{ id: 'a1', classroom_assignment_id: 'ca1', status: 'in_progress' }]);
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(container.textContent).toContain('1 enrolled course');
    expect(container.querySelector('input[aria-label="Search courses"]')).not.toBeNull();
    expect(container.textContent).toContain('40%');
    expect(container.textContent).toContain('2 lessons');
    expect(container.querySelector('a[aria-label="Open course: Robotics Fundamentals"]')?.getAttribute('href')).toBe('/courses/c1');
    expect(container.textContent).toContain('You have a practice mission in progress.');
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Open assignments')?.getAttribute('href')).toBe('/assignments');
  });

  // A05 regression: a failed request must never read as "No courses yet".
  const course = { id: 'c1', title: 'Robotics Fundamentals', description: 'Robot arm basics', status: 'published' };
  const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? '';
  const tryAgain = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement | undefined;

  it('shows a plain error with Try again instead of an empty list when a required request fails (HTTP 500)', async () => {
    mocks.role = 'student';
    const { ApiError } = await import('../lib/api');
    mocks.enrollments.mockRejectedValue(new ApiError(500, 'FATAL: (EMAXCONNSESSION) max clients reached in session mode'));
    mocks.courses.mockResolvedValue({ items: [course] });
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(alertText()).toContain('Your courses couldn’t be loaded.');
    expect(container.textContent).not.toContain('EMAXCONNSESSION');
    expect(container.textContent).not.toContain('No courses yet');
    expect(container.textContent).not.toContain('0 enrolled courses');
    expect(container.textContent).toContain('Course list unavailable');
    mocks.enrollments.mockResolvedValue([]); // the pool recovers
    await act(async () => { tryAgain()?.click(); });
    for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('1 enrolled course');
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('distinguishes network, session and permission failures, and only offers Try again when it can help', async () => {
    mocks.role = 'student';
    const { ApiError } = await import('../lib/api');
    mocks.courses.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(alertText()).toContain('VISTA couldn’t be reached.'); expect(tryAgain()).toBeDefined();
    act(() => root.unmount()); root = createRoot(container);
    mocks.courses.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'));
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(alertText()).toContain('Your session has ended.'); expect(tryAgain()).toBeUndefined();
    act(() => root.unmount()); root = createRoot(container);
    mocks.courses.mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(alertText()).toContain('Your account can’t open courses right now.'); expect(tryAgain()).toBeUndefined();
  });

  it('keeps a genuine empty list distinct from a failure', async () => {
    mocks.role = 'student';
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(container.textContent).toContain('No courses yet');
    expect(container.textContent).toContain('0 enrolled courses');
    expect(container.textContent).not.toContain('practice mission');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('A07: gives teachers and school admins a catalogue with course details, not student enrollment or progress', async () => {
    for (const role of ['teacher', 'school_admin'] as const) {
      mocks.role = role;
      mocks.courses.mockResolvedValue({ items: [course] });
      mocks.enrollments.mockResolvedValue([]);
      await renderAt(<Route path="/courses" element={<Courses />} />);
      expect(container.textContent).toContain('1 course available to you');
      expect(container.textContent).not.toContain('enrolled');
      expect(container.textContent).not.toContain('Teacher assigned');
      expect(container.textContent).not.toContain('Progress unavailable');
      // The student course path needs an enrollment; staff go to the course details page instead.
      expect(container.querySelector('a[aria-label="View course details: Robotics Fundamentals"]')?.getAttribute('href')).toBe('/courses/c1/info');
      expect(mocks.coursePaths).not.toHaveBeenCalled();
      act(() => root.unmount()); root = createRoot(container); vi.clearAllMocks();
    }
  });

  it('shows courses when only progress or lesson counts fail, without inventing 0% or 0 lessons', async () => {
    mocks.role = 'student';
    mocks.courses.mockResolvedValue({ items: [course] });
    mocks.enrollments.mockResolvedValue([{ course_id: 'c1', status: 'active' }]);
    mocks.coursePaths.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.lessons.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderAt(<Route path="/courses" element={<Courses />} />);
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('Progress unavailable right now');
    expect(container.textContent).toContain('Progress couldn’t be loaded.');
    expect(container.textContent).not.toContain('0%');
    expect(container.textContent).not.toContain('0 lessons');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
