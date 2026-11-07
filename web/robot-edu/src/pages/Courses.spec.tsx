// @vitest-environment jsdom
import React, { act } from 'react';
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

  it('redirects System Admin away from /courses to /admin/courses', async () => {
    mocks.role = 'admin';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/courses']}>
          <Routes>
            <Route path="/courses" element={<Courses />} />
            <Route path="/admin/courses" element={<div data-testid="admin-page">Admin Courses Page</div>} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Admin Courses Page');
    expect(container.textContent).not.toContain('My learning');
    expect(container.textContent).not.toContain('Teacher assigned');
  });

  it('renders student course page for student role', async () => {
    mocks.role = 'student';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/courses']}>
          <Routes>
            <Route path="/courses" element={<Courses />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('My learning');
    expect(container.textContent).toContain('Welcome back, student.');
  });
});
