// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarNav } from './SidebarNav';
import type { Role } from '../../types/user';

let currentRole: Role | null = 'admin';

vi.mock('../../contexts/RoleContext', () => ({
  useRole: () => ({
    role: currentRole,
    loading: false,
    error: null,
    memberships: [],
  }),
}));

describe('SidebarNav role-based navigation', () => {
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

  const renderNav = async (role: Role) => {
    currentRole = role;
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarNav />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });
  };

  it('routes System Admin Course catalogue to /admin/courses', async () => {
    await renderNav('admin');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.includes('Course catalogue'));
    expect(courseLink).toBeDefined();
    expect(courseLink?.getAttribute('href')).toBe('/admin/courses');
  });

  it('routes Student Courses to /courses and My Learning to /my-learning', async () => {
    await renderNav('student');
    const links = Array.from(container.querySelectorAll('a'));
    const coursesLink = links.find((l) => l.textContent?.includes('Courses'));
    const myLearningLink = links.find((l) => l.textContent?.includes('My Learning'));
    expect(coursesLink?.getAttribute('href')).toBe('/courses');
    expect(myLearningLink?.getAttribute('href')).toBe('/my-learning');
  });

  it('preserves School Admin navigation to /courses', async () => {
    await renderNav('school_admin');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.includes('Course catalogue'));
    expect(courseLink?.getAttribute('href')).toBe('/courses');
  });

  it('preserves Teacher navigation with Student catalogue pointing to /courses', async () => {
    await renderNav('teacher');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.includes('Student catalogue'));
    expect(courseLink?.getAttribute('href')).toBe('/courses');
  });
});
