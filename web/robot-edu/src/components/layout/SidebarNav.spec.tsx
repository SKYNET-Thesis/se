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

  it('gives School Admin one Quizzes entry under Learning, selected on the list and on classroom quiz links', async () => {
    currentRole = 'school_admin';
    for (const route of ['/school/quizzes', '/school/quizzes?classroomId=c1']) {
      await act(async () => { root.render(<MemoryRouter key={route} initialEntries={[route]}><SidebarNav /></MemoryRouter>); await Promise.resolve(); });
      const quizzes = Array.from(container.querySelectorAll('a')).filter((l) => l.textContent === 'Quizzes');
      expect(quizzes).toHaveLength(1);
      expect(quizzes[0].getAttribute('href')).toBe('/school/quizzes');
      expect(quizzes[0].getAttribute('aria-current')).toBe('page');
      expect(quizzes[0].className).toContain('vista-nav-active');
    }
    const learning = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Learning')?.parentElement;
    expect(Array.from(learning?.querySelectorAll('a') ?? []).map((l) => l.textContent)).toEqual(['Course catalogue', 'Quizzes', 'Robot Lab']);
  });

  it('keeps My Learning selected while a student studies a course or lesson, and Courses only on the list', async () => {
    currentRole = 'student';
    const selected = () => Array.from(container.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent);
    for (const [route, expected] of [['/courses/c1/lessons/l2/activities/l2-reading-1', 'My Learning'], ['/courses/c1', 'My Learning'], ['/my-learning', 'My Learning'], ['/courses', 'Courses']] as const) {
      await act(async () => { root.render(<MemoryRouter key={route} initialEntries={[route]}><SidebarNav /></MemoryRouter>); await Promise.resolve(); });
      expect(selected()).toEqual([expected]);
    }
  });

  it('A07: has no student item that only redirects, and keeps My Learning selected on quiz pages and attempts', async () => {
    await renderNav('student');
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/'); // "/" redirects a student to /my-learning, so a "Dashboard" item duplicated My Learning
    expect(hrefs).toEqual(['/courses', '/my-learning', '/assignments', '/studio', '/lab']);
    const selected = () => Array.from(container.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent);
    for (const route of ['/my-learning/ca1', '/practice/att-1']) {
      await act(async () => { root.render(<MemoryRouter key={route} initialEntries={[route]}><SidebarNav /></MemoryRouter>); await Promise.resolve(); });
      expect(selected()).toEqual(['My Learning']);
    }
  });

  it('preserves Teacher navigation with Student catalogue pointing to /courses', async () => {
    await renderNav('teacher');
    const links = Array.from(container.querySelectorAll('a'));
    const courseLink = links.find((l) => l.textContent?.includes('Student catalogue'));
    expect(courseLink?.getAttribute('href')).toBe('/courses');
  });
});
