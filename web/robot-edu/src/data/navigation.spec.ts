import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { navigationByRole } from './navigation';

describe('role-based course navigation', () => {
  it('routes System Admin to the administrative course catalogue', () => {
    const item = navigationByRole.admin.flatMap(section => section.items).find(entry => entry.label === 'Course catalogue');
    expect(item?.to).toBe('/admin/courses');
  });

  it('keeps the student catalogue on the learning route', () => {
    const item = navigationByRole.student.flatMap(section => section.items).find(entry => entry.label === 'Courses');
    expect(item?.to).toBe('/courses');
  });

  it('gives teachers separate Assignment and Quiz entries', () => {
    const items = navigationByRole.teacher.flatMap(section => section.items);
    expect(items.find(entry => entry.label === 'Assignments')?.to).toBe('/teacher/assignments');
    expect(items.find(entry => entry.label === 'Quizzes')?.to).toBe('/teacher/quizzes');
  });

  it('gives School Admins a Quizzes entry under Learning, so classroom quiz delivery is reachable without typing a URL', () => {
    const learning = navigationByRole.school_admin.find(section => section.title === 'Learning');
    expect(learning?.items.find(entry => entry.label === 'Quizzes')?.to).toBe('/school/quizzes');
  });
});

/** Routes declared in App.tsx, as path patterns. */
const appRoutes = [...readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').matchAll(/<Route [^>]*path="([^"]+)"/g)].map(match => `/${match[1]}`);
const matchesRoute = (target: string) => appRoutes.some(pattern => new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*')}$`).test(target.split('?')[0]));

describe('navigation integrity', () => {
  it('every navigation entry of every role leads to a declared route (no dead links)', () => {
    const dead = Object.entries(navigationByRole).flatMap(([role, sections]) => sections.flatMap(section => section.items).filter(item => item.to !== '/' && !matchesRoute(item.to)).map(item => `${role}: ${item.label} -> ${item.to}`));
    expect(dead).toEqual([]);
  });

  it('the old /digital-twin address still lands on a page (the 3D twin lives in the Robot Lab)', () => {
    expect(matchesRoute('/digital-twin')).toBe(true);
    expect(Object.values(navigationByRole).flatMap(sections => sections.flatMap(section => section.items)).some(item => item.to === '/digital-twin')).toBe(false);
  });

  it.each(['/school/quizzes', '/school/offerings', '/teacher/quizzes', '/admin/organizations', '/my-learning'])('%s is a declared route', (route) => {
    expect(matchesRoute(route)).toBe(true);
  });
});
