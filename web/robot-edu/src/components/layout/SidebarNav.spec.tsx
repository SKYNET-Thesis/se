// @vitest-environment jsdom
import { act } from 'react';
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

  const renderNav = async (role: Role, path = '/') => {
    currentRole = role;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
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

  it('routes School Admin courses to the organization course manager', async () => {
    await renderNav('school_admin');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.trim() === 'Courses');
    expect(courseLink?.getAttribute('href')).toBe('/school/courses');
  });

  it('preserves Teacher navigation with Student catalogue pointing to /courses', async () => {
    await renderNav('teacher');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.includes('Student catalogue'));
    expect(courseLink?.getAttribute('href')).toBe('/courses');
  });

  const current = () => Array.from(container.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent?.trim());

  it('keeps My Learning selected while a student studies a course, a lesson or a practice attempt, and Courses only on the list', async () => {
    await renderNav('student', '/courses/course-1/lessons/lesson-2');
    expect(current()).toEqual(['My Learning']);
    await act(async () => root.unmount()); root = createRoot(container);
    await renderNav('student', '/practice/attempt-1');
    expect(current()).toEqual(['My Learning']);
    await act(async () => root.unmount()); root = createRoot(container);
    await renderNav('student', '/courses');
    expect(current()).toEqual(['Courses']);
    await act(async () => root.unmount()); root = createRoot(container);
    await renderNav('student', '/my-learning/assignment-1');
    expect(current()).toEqual(['My Learning']);
  });
});
