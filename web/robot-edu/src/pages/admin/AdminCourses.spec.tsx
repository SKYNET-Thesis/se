// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCourses } from './AdminCourses';

const api = vi.hoisted(() => ({
  courses: vi.fn(),
  createGlobalCourse: vi.fn(),
  updateGlobalCourse: vi.fn(),
  publishGlobalCourse: vi.fn(),
  archiveGlobalCourse: vi.fn(),
  lessons: vi.fn(),
  sections: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      courses: api.courses,
      createGlobalCourse: api.createGlobalCourse,
      updateGlobalCourse: api.updateGlobalCourse,
      publishGlobalCourse: api.publishGlobalCourse,
      archiveGlobalCourse: api.archiveGlobalCourse,
      lessons: api.lessons,
    },
    curriculumApi: {
      ...actual.curriculumApi,
      sections: api.sections,
    },
  };
});

vi.mock('../../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({
    session: { access_token: 'test-admin-token', user: { email: 'admin@vista.io' } },
  }),
}));

const mockCourses = [
  { id: 'course-1', title: 'Robotics Fundamentals', description: 'Intro to robotics', status: 'draft' },
  { id: 'course-2', title: 'Advanced Kinematics', description: 'Kinematics course', status: 'published' },
  { id: 'course-3', title: 'Legacy Controls', description: 'Old control systems', status: 'archived' },
];

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function LocationProbe() { const location = useLocation(); return <output data-testid="route-path">{location.pathname}</output>; }

describe('AdminCourses', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.values(api).forEach((mock) => (mock as ReturnType<typeof vi.fn>).mockReset());
    api.courses.mockResolvedValue({ items: mockCourses, total: 3, page: 1, pageSize: 100 });
    api.lessons.mockResolvedValue([]);
    api.sections.mockResolvedValue([]);

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter><AdminCourses /><LocationProbe /></MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await tick();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders Course Management header and Create Course action', () => {
    expect(container.textContent).toContain('Course Management');
    expect(container.textContent).toContain('Manage courses and curriculum across the VISTA platform.');
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('create course'),
    );
    expect(createBtn).toBeDefined();
  });

  it('navigates to the dedicated new-course route from Create Course', async () => {
    const create = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Create Course'));
    await act(async () => { create?.click(); });
    expect(container.querySelector('[data-testid="route-path"]')?.textContent).toBe('/admin/courses/new');
  });

  it('renders summary statistics cards derived from API data', () => {
    const text = container.textContent || '';
    expect(text).toContain('Total Courses');
    expect(text).toContain('3');
    expect(text).toContain('Published');
    expect(text).toContain('1');
    expect(text).toContain('Draft');
    expect(text).toContain('Archived');
  });

  it('renders a management table with Course, Description, Status, and Actions', () => {
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('draft');
    expect(container.textContent).toContain('Advanced Kinematics');
    expect(container.textContent).toContain('published');
    expect(container.textContent).toContain('Legacy Controls');
    expect(container.textContent).toContain('archived');
  });

  it('filters courses by title via the search input', async () => {
    const searchInput = container.querySelector('input[aria-label="Search courses"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(searchInput, 'Kinematics');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick();

    expect(container.textContent).toContain('Advanced Kinematics');
    expect(container.textContent).not.toContain('Robotics Fundamentals');
    expect(container.textContent).not.toContain('Legacy Controls');
  });

  it('filters courses by status', async () => {
    const statusSelect = container.querySelector('select[aria-label="Filter by status"]') as HTMLSelectElement;
    expect(statusSelect).not.toBeNull();

    await act(async () => {
      statusSelect.value = 'draft';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick();

    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).not.toContain('Advanced Kinematics');
    expect(container.textContent).not.toContain('Legacy Controls');
  });

  it('keeps the catalogue separate from the Course Builder and links existing courses to edit routes', () => {
    expect(container.textContent).not.toContain('Start a course');
    expect(container.textContent).not.toContain('Canonical Curriculum');
    const edit = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit Course');
    expect(edit).toBeDefined();
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Manage curriculum')).toBe(false);
  });

  it('does NOT contain student-specific elements', () => {
    const text = container.textContent || '';
    expect(text).not.toContain('Teacher assigned');
    expect(text).not.toContain('How course access works');
    expect(text).not.toContain('Keep going');
    expect(text).not.toContain('courses available to you');
    expect(text).not.toContain('Learning updates');
  });
});
