// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireRole } from './RequireRole';
import type { Role } from '../../types/user';

let currentRole: Role | null = 'student';

vi.mock('../../contexts/RoleContext', () => ({
  useRole: () => ({ role: currentRole, loading: false, error: null }),
}));

describe('RequireRole authorization boundary', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('allows admin access to admin-only routes', async () => {
    currentRole = 'admin';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/courses']}>
          <Routes>
            <Route
              path="/admin/courses"
              element={
                <RequireRole roles={['admin']}>
                  <div>Admin Courses Content</div>
                </RequireRole>
              }
            />
            <Route path="/" element={<div>Home Redirect</div>} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Admin Courses Content');
  });

  it('denies non-admin roles (student, teacher, school_admin) and redirects them to root', async () => {
    for (const unauthorizedRole of ['student', 'teacher', 'school_admin', 'teaching_assistant'] as Role[]) {
      currentRole = unauthorizedRole;
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/admin/courses']}>
            <Routes>
              <Route
                path="/admin/courses"
                element={
                  <RequireRole roles={['admin']}>
                    <div>Admin Courses Content</div>
                  </RequireRole>
                }
              />
              <Route path="/" element={<div>Home Redirect</div>} />
            </Routes>
          </MemoryRouter>,
        );
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Home Redirect');
      expect(container.textContent).not.toContain('Admin Courses Content');
    }
  });
});
