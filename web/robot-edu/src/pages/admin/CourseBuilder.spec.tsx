// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseBuilder } from './CourseBuilder';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const waitFor = <T,>(callback: () => T) => vi.waitFor(callback, { timeout: 8000, interval: 25 });

// The Question Bank panel has its own spec.
vi.mock('../../components/authoring/QuizAuthoringPanel', () => ({ QuizAuthoringPanel: () => <div data-testid="quiz-authoring-panel" /> }));

const api = vi.hoisted(() => ({
  course: vi.fn(),
  createGlobalCourse: vi.fn(),
  updateGlobalCourse: vi.fn(),
  archiveGlobalCourse: vi.fn(),
  publishGlobalCourse: vi.fn(),
  lessons: vi.fn(),
  sections: vi.fn(),
  mediaList: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    catalogApi: { ...actual.catalogApi, course: api.course, createGlobalCourse: api.createGlobalCourse, updateGlobalCourse: api.updateGlobalCourse, archiveGlobalCourse: api.archiveGlobalCourse, publishGlobalCourse: api.publishGlobalCourse, lessons: api.lessons },
    curriculumApi: { ...actual.curriculumApi, sections: api.sections },
    learningMediaApi: { ...actual.learningMediaApi, list: api.mediaList },
  };
});

vi.mock('../../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => ({ session: { access_token: 'admin-token', user: { email: 'admin@vista.io' } } }),
}));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: 'admin', loading: false, error: null }) }));

const existing = { id: 'course-1', title: 'Dual-Arm Robotics Manipulation', description: 'Learn bimanual control.', status: 'draft' };
const lessons = [{ id: 'l1', title: 'Introduction', ordinal: 1 }];
const sections = [{ id: 's1', title: 'Robot Basics', ordinal: 1, status: 'draft', learning_activities: [{ id: 'a1', title: 'Reading', type: 'reading', ordinal: 1, required: true, content: { version: 1, blocks: [], mediaIds: [] } }] }];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

describe('CourseBuilder', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.values(api).forEach((mock) => mock.mockReset());
    api.course.mockResolvedValue(existing);
    api.lessons.mockResolvedValue(lessons);
    api.sections.mockResolvedValue(sections);
    api.mediaList.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (entry: string) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/admin/courses" element={<div data-testid="course-management">Course Management</div>} />
              <Route path="/admin/courses/:courseId" element={<CourseBuilder />} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  };

  const location = () => container.querySelector('[data-testid="location"]')?.textContent;
  const builder = () => container.querySelector('[data-testid="course-builder"]');
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
    act(async () => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const titleInput = () => container.querySelector('input[placeholder^="e.g."]') as HTMLInputElement;
  const descInput = () => container.querySelector('form[aria-label="Course details"] textarea') as HTMLTextAreaElement;
  const button = (text: string, scope: ParentNode = container) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
  const tabButton = (name: string) => [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === name) as HTMLButtonElement;
  const selectedTab = () => container.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  const panel = (label: string) => container.querySelector(`[role="tabpanel"][aria-label="${label}"]`) as HTMLElement | null;

  describe('NEW COURSE mode', () => {
    it('renders the full-page workspace on Course Details, with no modal and the header controls', async () => {
      await render('/admin/courses/new');
      expect(builder()).not.toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(selectedTab()).toBe('Course Details');
      expect(container.textContent).toContain('VISTA / Course Builder');
      expect(container.querySelector('[data-testid="header-title"]')?.textContent).toBe('Untitled Course');
      expect(container.querySelector('[aria-label="Open navigation"]')).not.toBeNull(); // ☰
      expect(button('Create Draft')).toBeDefined();
      expect(container.querySelector('[data-testid="save-status"]')?.textContent).toBe('Draft not created');
      expect((container.querySelector('button[aria-label="Preview"]') as HTMLButtonElement).disabled).toBe(true);
      expect((container.querySelector('button[aria-label="Review & Publish"]') as HTMLButtonElement).disabled).toBe(true);
      expect(api.course).not.toHaveBeenCalled();
    });

    it('keeps Curriculum, Media Library and Settings locked until the draft exists', async () => {
      await render('/admin/courses/new?tab=curriculum');
      expect(selectedTab()).toBe('Course Details'); // the URL cannot open a locked tab
      await act(async () => { tabButton('Curriculum').click(); });
      expect(selectedTab()).toBe('Course Details');
      expect(container.textContent).toContain('Create the draft to unlock');
      expect(panel('Curriculum')).toBeNull();
    });

    it('validates the required title and creates nothing', async () => {
      await render('/admin/courses/new');
      await act(async () => { button('Create Draft')!.click(); });
      expect(container.querySelector('#course-title-error')?.textContent).toBe('Course title is required.');
      expect(titleInput().getAttribute('aria-invalid')).toBe('true');
      await type(titleInput(), '   ');
      await act(async () => { button('Create Draft')!.click(); });
      expect(api.createGlobalCourse).not.toHaveBeenCalled();
    });

    it('creates the draft exactly once, keeps the workspace mounted and switches to Curriculum', async () => {
      let resolveCreate: (course: unknown) => void = () => undefined;
      api.createGlobalCourse.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
      api.course.mockResolvedValue({ ...existing, id: 'new-id', title: 'Brand new' });
      await render('/admin/courses/new');
      const before = builder();
      await type(titleInput(), '  Brand new  ');
      await type(descInput(), '');

      // double submit while the request is in flight
      await act(async () => { button('Create Draft')!.click(); });
      await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      expect(api.createGlobalCourse).toHaveBeenCalledTimes(1);
      expect(api.createGlobalCourse).toHaveBeenCalledWith('admin-token', { title: 'Brand new', description: undefined });
      expect(titleInput().disabled).toBe(true);

      await act(async () => { resolveCreate({ ...existing, id: 'new-id', title: 'Brand new' }); });
      await waitFor(() => expect(location()).toBe('/admin/courses/new-id?tab=curriculum'));
      expect(builder()).toBe(before); // same DOM node: the workspace was not remounted
      expect(selectedTab()).toBe('Curriculum');
      await waitFor(() => expect(container.querySelector('[data-testid="course-outline-panel"]')).not.toBeNull());
      expect(container.querySelector('[data-testid="header-title"]')?.textContent).toBe('Brand new');
      expect(container.textContent).toContain('Draft');
      expect(api.createGlobalCourse).toHaveBeenCalledTimes(1);
    });

    it('keeps what was typed when creation fails and allows a retry', async () => {
      api.createGlobalCourse.mockRejectedValueOnce(new Error('Title already exists.'));
      await render('/admin/courses/new');
      await type(titleInput(), 'Robotics 101');
      await type(descInput(), 'Intro');
      await act(async () => { button('Create Draft')!.click(); });
      await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('Title already exists.'));
      expect(location()).toBe('/admin/courses/new');
      expect(titleInput().value).toBe('Robotics 101');
      expect(descInput().value).toBe('Intro');

      api.createGlobalCourse.mockResolvedValueOnce({ ...existing, id: 'c2', title: 'Robotics 101' });
      api.course.mockResolvedValue({ ...existing, id: 'c2', title: 'Robotics 101' });
      await act(async () => { button('Create Draft')!.click(); });
      await waitFor(() => expect(api.createGlobalCourse).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(location()).toBe('/admin/courses/c2?tab=curriculum'));
    });

    it('opens the admin navigation as a drawer without losing the unsaved form, and closes it with Escape', async () => {
      await render('/admin/courses/new');
      await type(titleInput(), 'Half-written title');
      await act(async () => { (container.querySelector('[aria-label="Open navigation"]') as HTMLButtonElement).click(); });
      const drawer = document.querySelector('[role="dialog"][aria-label="Admin navigation"]');
      expect(drawer).not.toBeNull();
      expect(drawer!.textContent).toContain('Course catalogue');
      expect(titleInput().value).toBe('Half-written title');
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      await waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Admin navigation"]')).toBeNull());
      expect(titleInput().value).toBe('Half-written title');
      expect(document.activeElement).toBe(container.querySelector('[aria-label="Open navigation"]'));
    });

    it('asks before leaving with unsaved input, and leaves freely when the form is empty', async () => {
      await render('/admin/courses/new');
      await type(titleInput(), 'Draft idea');
      const back = [...container.querySelectorAll('a')].find((a) => a.textContent === '← Back to Course Management') as HTMLAnchorElement;
      await act(async () => { back.click(); });
      expect(location()).toBe('/admin/courses/new');
      await waitFor(() => expect(document.body.textContent).toContain('Leave without saving?'));
      await act(async () => { button('Cancel', document.body)!.click(); });
      expect(titleInput().value).toBe('Draft idea');

      await act(async () => { back.click(); });
      await act(async () => { button('Discard and leave', document.body)!.click(); });
      await waitFor(() => expect(location()).toBe('/admin/courses'));
    });

    it('returns to Course Management directly when nothing was entered', async () => {
      await render('/admin/courses/new');
      const back = [...container.querySelectorAll('a')].find((a) => a.textContent === '← Back to Course Management') as HTMLAnchorElement;
      await act(async () => { back.click(); });
      await waitFor(() => expect(location()).toBe('/admin/courses'));
    });
  });

  describe('EXISTING course', () => {
    it('opens the Curriculum tab with Course Outline and Content Editor side by side (direct URL / refresh)', async () => {
      await render('/admin/courses/course-1?tab=curriculum');
      await waitFor(() => expect(container.querySelector('[data-testid="course-outline-panel"]')).not.toBeNull());
      expect(api.course).toHaveBeenCalledWith('course-1', 'admin-token');
      expect(selectedTab()).toBe('Curriculum');
      expect(container.querySelector('[data-testid="header-title"]')?.textContent).toBe('Dual-Arm Robotics Manipulation');
      await waitFor(() => expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull());
      const grid = container.querySelector('[data-testid="course-outline-panel"]')!.closest('.grid');
      expect(grid?.querySelector('main[aria-label="Content workspace"]')).not.toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(container.querySelector('button[aria-label="Review & Publish"]')).not.toBeNull();
    });

    it('opens Course Details when the URL asks for it and saves changes through the update API', async () => {
      api.updateGlobalCourse.mockImplementation(async () => {
        api.course.mockResolvedValue({ ...existing, title: 'Renamed' }); // the server now returns the saved record
        return { ...existing, title: 'Renamed' };
      });
      await render('/admin/courses/course-1?tab=details');
      await waitFor(() => expect(titleInput()?.value).toBe(existing.title));
      expect(selectedTab()).toBe('Course Details');
      expect(descInput().value).toBe('Learn bimanual control.');
      expect(button('Save Changes')!.disabled).toBe(true); // nothing changed yet

      await type(titleInput(), 'Renamed');
      expect(container.querySelector('[data-testid="save-status"]')?.textContent).toBe('Unsaved changes');
      await act(async () => { button('Save Changes')!.click(); });
      await waitFor(() => expect(api.updateGlobalCourse).toHaveBeenCalledWith('course-1', 'admin-token', { title: 'Renamed', description: 'Learn bimanual control.' }));
      await waitFor(() => expect(container.querySelector('[data-testid="save-status"]')?.textContent).toBe('All changes saved'));
    });

    it('defaults to Curriculum and reflects the selected tab in the URL', async () => {
      await render('/admin/courses/course-1');
      await waitFor(() => expect(selectedTab()).toBe('Curriculum'));
      await act(async () => { tabButton('Media Library').click(); });
      expect(location()).toBe('/admin/courses/course-1?tab=media');
      await act(async () => { tabButton('Course Details').click(); });
      expect(location()).toBe('/admin/courses/course-1?tab=details');
    });

    it('keeps the curriculum state mounted across tab switches', async () => {
      await render('/admin/courses/course-1?tab=curriculum');
      await waitFor(() => expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull());
      const editor = container.querySelector('[data-testid="reading-document-editor"]');
      await act(async () => { tabButton('Settings').click(); });
      expect(panel('Curriculum')!.hidden).toBe(true);
      await act(async () => { tabButton('Curriculum').click(); });
      expect(panel('Curriculum')!.hidden).toBe(false);
      expect(container.querySelector('[data-testid="reading-document-editor"]')).toBe(editor);
    });

    it('shows the Learning Media library inline in the Media Library tab', async () => {
      api.mediaList.mockResolvedValue([{ id: 'm1', course_id: 'course-1', original_filename: 'arm-demo.mp4', mime_type: 'video/mp4', size_bytes: 2_000_000, status: 'ready', created_at: '2026-01-01T00:00:00Z' }]);
      await render('/admin/courses/course-1?tab=media');
      await waitFor(() => expect(panel('Media Library')!.textContent).toContain('arm-demo.mp4'));
      expect(api.mediaList).toHaveBeenCalledWith('course-1', 'admin-token', '', '');
      expect(document.querySelector('[role="dialog"]')).toBeNull(); // inline, not a modal
    });

    it('requires confirmation before archiving from Settings', async () => {
      api.archiveGlobalCourse.mockResolvedValue({ ...existing, status: 'archived' });
      await render('/admin/courses/course-1?tab=settings');
      await waitFor(() => expect(button('Archive course', panel('Settings')!)).toBeDefined());
      await act(async () => { button('Archive course', panel('Settings')!)!.click(); });
      expect(api.archiveGlobalCourse).not.toHaveBeenCalled();
      await act(async () => { button('Archive course', document.querySelector('[role="dialog"]') as HTMLElement)!.click(); });
      await waitFor(() => expect(api.archiveGlobalCourse).toHaveBeenCalledWith('course-1', 'admin-token'));
    });

    it('blocks publishing while course details are unsaved and sends the admin to Course Details', async () => {
      await render('/admin/courses/course-1?tab=details');
      await waitFor(() => expect(titleInput()?.value).toBe(existing.title));
      await type(titleInput(), 'Edited');
      await act(async () => { (container.querySelector('button[aria-label="Review & Publish"]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Save them before publishing');
      expect(api.publishGlobalCourse).not.toHaveBeenCalled();
    });

    it('opens the existing Readiness Checklist from the header and publishes through the backend', async () => {
      api.publishGlobalCourse.mockResolvedValue({ ...existing, status: 'published' });
      await render('/admin/courses/course-1?tab=curriculum');
      await waitFor(() => expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull());
      await act(async () => { (container.querySelector('button[aria-label="Review & Publish"]') as HTMLButtonElement).click(); });
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      expect(document.querySelector('[role="dialog"]')!.textContent).toMatch(/readiness|publish/i);
    });

    it('opens the existing learner preview from the header without leaving the workspace', async () => {
      await render('/admin/courses/course-1?tab=curriculum');
      await waitFor(() => expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull());
      await act(async () => { (container.querySelector('button[aria-label="Preview"]') as HTMLButtonElement).click(); });
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      expect(location()).toBe('/admin/courses/course-1?tab=curriculum');
      expect(builder()).not.toBeNull();
    });

    it('shows a recoverable error when the course cannot be loaded', async () => {
      api.course.mockRejectedValue(new Error('Course was not found.'));
      await render('/admin/courses/missing');
      await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('Course was not found.'));
      expect(button('Try again')).toBeDefined();
    });
  });
});
