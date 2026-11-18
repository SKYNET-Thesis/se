// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'teacher' as string, coursePath: vi.fn(), course: vi.fn(), lessons: vi.fn() }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok', user: { id: 'u1' } }, sessionRevision: 0 }) }));
vi.mock('../contexts/RoleContext', () => ({ useRole: () => ({ role: mocks.role, loading: false }) }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, progressionApi: { ...actual.progressionApi, coursePath: mocks.coursePath }, catalogApi: { ...actual.catalogApi, course: mocks.course, lessons: mocks.lessons } };
});

import { CourseInfo } from './CourseInfo';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const course = { id: 'co1', title: 'Robotics Fundamentals', description: 'Robot arm basics.', status: 'published' };

describe('CourseInfo (A07)', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const open = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/courses/co1/info']}><Routes><Route path="/courses/:courseId/info" element={<CourseInfo />} /></Routes></MemoryRouter></QueryClientProvider>); });
    await flush();
  };

  it('works for staff without an enrollment: catalogue lessons, no dead lesson links, nothing invented', async () => {
    mocks.role = 'teacher';
    mocks.course.mockResolvedValue(course);
    mocks.lessons.mockResolvedValue([{ id: 'l1', title: 'Meet Your Robot', ordinal: 1 }, { id: 'l2', title: 'Move the Robot', ordinal: 2 }]);
    await open();
    expect(mocks.coursePath).not.toHaveBeenCalled(); // the student path needs an enrollment
    expect(container.querySelector('h1')?.textContent).toBe('Robotics Fundamentals');
    expect(container.textContent).toContain('Meet Your Robot');
    expect(container.querySelectorAll('a[href^="/courses/co1/lessons/"]')).toHaveLength(0);
    expect(container.querySelector('nav[aria-label="Breadcrumb"] a')?.getAttribute('href')).toBe('/courses');
    expect(container.textContent).toContain('Lessons2');
    expect(container.textContent).not.toContain('Beginner'); // no default level when the API gives none
  });

  it('links students to their lessons through the course path', async () => {
    mocks.role = 'student';
    mocks.coursePath.mockResolvedValue({ course: { ...course, level: 'Beginner' }, lessons: [{ id: 'l1', title: 'Meet Your Robot', ordinal: 1 }] });
    mocks.course.mockResolvedValue(course);
    await open();
    expect(mocks.lessons).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/courses/co1/lessons/l1"]')).not.toBeNull();
    expect(container.textContent).toContain('LevelBeginner');
  });

  it('explains a failure instead of loading forever', async () => {
    mocks.role = 'teacher';
    mocks.course.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.lessons.mockResolvedValue([]);
    await open();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Try again');
  });
});
