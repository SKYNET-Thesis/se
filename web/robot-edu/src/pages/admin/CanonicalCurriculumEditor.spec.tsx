// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalCurriculumEditor } from './CanonicalCurriculumEditor';

const api = vi.hoisted(() => ({
  lessons: vi.fn(),
  updateLesson: vi.fn(),
  createLesson: vi.fn(),
  setLessonPrerequisites: vi.fn(),
  reorderLessons: vi.fn(),
  sections: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  reorderSections: vi.fn(),
  setSectionStatus: vi.fn(),
  createActivity: vi.fn(),
  updateActivity: vi.fn(),
  reorderActivities: vi.fn(),
  setActivityStatus: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      lessons: api.lessons,
      updateLesson: api.updateLesson,
      createLesson: api.createLesson,
      setLessonPrerequisites: api.setLessonPrerequisites,
      reorderLessons: api.reorderLessons,
    },
    curriculumApi: {
      ...actual.curriculumApi,
      sections: api.sections,
      createSection: api.createSection,
      updateSection: api.updateSection,
      reorderSections: api.reorderSections,
      setSectionStatus: api.setSectionStatus,
      createActivity: api.createActivity,
      updateActivity: api.updateActivity,
      reorderActivities: api.reorderActivities,
      setActivityStatus: api.setActivityStatus,
    },
  };
});

const course = { id: 'course-1', title: 'Robotics', description: null, status: 'draft' };
const lessonA = { id: 'lesson-a', title: 'Intro', ordinal: 1, content: { summary: 'Old' } };
const lessonB = { id: 'lesson-b', title: 'Motion', ordinal: 2, content: { summary: 'Move' }, prerequisiteLessonIds: [] };
const sectionA = {
  id: 'section-a',
  title: 'Read',
  ordinal: 1,
  status: 'draft' as const,
  learning_activities: [
    { id: 'activity-a', title: 'Overview', type: 'reading', ordinal: 1, required: true, status: 'draft' as const, content_ref: { kind: 'lesson_content' as const, key: 'summary' } },
    { id: 'activity-b', title: 'Video', type: 'video', ordinal: 2, required: true, status: 'published' as const, content_ref: { kind: 'lesson_content' as const, key: 'video' } },
  ],
};
const sectionB = { id: 'section-b', title: 'Practice', ordinal: 2, status: 'published' as const, learning_activities: [] };

const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('CanonicalCurriculumEditor', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.values(api).forEach((mock) => (mock as ReturnType<typeof vi.fn>).mockReset());
    api.lessons.mockResolvedValue([lessonA, lessonB]);
    api.sections.mockResolvedValue([sectionA, sectionB]);
    Object.values(api)
      .filter((mock) => mock !== api.lessons && mock !== api.sections)
      .forEach((mock) => (mock as ReturnType<typeof vi.fn>).mockResolvedValue({}));

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={course} token="token" />
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

  const button = (text: string) => ({
    click: () =>
      act(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const item = buttons.find((b) => b.textContent?.trim() === text) ?? buttons.find((b) => b.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
        if (!item) throw new Error(`Button "${text}" not found`);
        (item as HTMLButtonElement).click();
      }),
  });

  const input = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;

  const change = async (label: string, value: string) => {
    await act(async () => {
      const field = input(label);
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
  };

  it('edits a lesson and persists selected prerequisites', async () => {
    button('Intro').click();
    await tick();
    await change('Lesson title', 'Introduction');
    input('Require Motion').click();
    button('Save').click();
    await tick();
    expect(api.updateLesson).toHaveBeenCalledWith('lesson-a', 'token', { title: 'Introduction', content: { summary: 'Old' } });
    expect(api.setLessonPrerequisites).toHaveBeenCalledWith('lesson-a', 'token', ['lesson-b']);
  });

  it('persists lesson and section ordering', async () => {
    (Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === 'Move Intro down') as HTMLButtonElement).click();
    await tick();
    expect(api.reorderLessons).toHaveBeenCalledWith('course-1', 'token', ['lesson-b', 'lesson-a']);
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    await tick();
    (Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === 'Move Read down') as HTMLButtonElement).click();
    await tick();
    expect(api.reorderSections).toHaveBeenCalledWith('lesson-a', 'token', ['section-b', 'section-a']);
  });

  it('creates and edits a section', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    button('Add Section').click();
    await tick();
    await change('Section title', 'New section');
    button('Save').click();
    await tick();
    expect(api.createSection).toHaveBeenCalledWith('lesson-a', 'token', { title: 'New section', ordinal: 3 });
    button('Edit').click();
    await tick();
    await change('Section title', 'Reading');
    button('Save').click();
    await tick();
    expect(api.updateSection).toHaveBeenCalledWith('section-a', 'token', { title: 'Reading' });
  });

  it('creates an activity with its canonical content reference', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    await tick();
    (Array.from(container.querySelectorAll('button[aria-expanded]')).find((item) => item.textContent?.includes('Read') && item.textContent?.includes('draft')) as HTMLButtonElement).click();
    await tick();
    await tick();
    await act(async () => (container.querySelector('[aria-label="More content types"]') as HTMLButtonElement).click());
    await tick();
    button('Programming Assignment').click();
    await tick();
    await change('Activity title', 'Practice');
    await change('Assignment ID', '11111111-1111-4111-8111-111111111111');
    button('Save Draft').click();
    await tick();
    expect(api.createActivity).toHaveBeenCalledWith(
      'section-a',
      'token',
      expect.objectContaining({ title: 'Practice', type: 'guided_practice', contentRef: { kind: 'assignment', id: '11111111-1111-4111-8111-111111111111' } }),
    );
  });

  it('shows an API failure without claiming success', async () => {
    api.reorderLessons.mockRejectedValueOnce(new Error('Network unavailable'));
    (Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === 'Move Intro down') as HTMLButtonElement).click();
    await tick();
    expect(document.body.textContent).toContain('Network unavailable');
    expect(document.body.textContent).not.toContain('Order saved.');
  });

  it('reloads canonical lessons when the selected course prop changes', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={{ ...course, id: 'course-2', title: 'Second' }} token="token" />
        </QueryClientProvider>,
      );
    });
    await tick();
    expect(api.lessons).toHaveBeenLastCalledWith('course-2', 'token');
    expect(document.body.textContent).toContain('Second curriculum');
  });

  it('toggles section status between draft and published', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    await tick();

    // Section Read is draft -> button Publish Read
    const publishBtn = container.querySelector('button[aria-label="Publish Read"]') as HTMLButtonElement;
    expect(publishBtn).toBeDefined();
    await act(async () => { publishBtn.click(); });
    await tick();
    expect(api.setSectionStatus).toHaveBeenCalledWith('section-a', 'token', 'published');

    // Section Practice is published -> button Unpublish Practice
    const unpublishBtn = container.querySelector('button[aria-label="Unpublish Practice"]') as HTMLButtonElement;
    expect(unpublishBtn).toBeDefined();
    await act(async () => { unpublishBtn.click(); });
    await tick();
    expect(api.setSectionStatus).toHaveBeenCalledWith('section-b', 'token', 'draft');
  });

  it('toggles activity status between draft and published', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    await tick();
    (Array.from(container.querySelectorAll('button[aria-expanded]')).find((item) => item.textContent?.includes('Read') && item.textContent?.includes('draft')) as HTMLButtonElement).click();
    await tick();
    await tick();

    // Activity Overview is draft -> button Publish Overview
    const publishBtn = container.querySelector('button[aria-label="Publish Overview"]') as HTMLButtonElement;
    expect(publishBtn).toBeDefined();
    await act(async () => { publishBtn.click(); });
    await tick();
    expect(api.setActivityStatus).toHaveBeenCalledWith('activity-a', 'token', 'published');

    // Activity Video is published -> button Unpublish Video
    const unpublishBtn = container.querySelector('button[aria-label="Unpublish Video"]') as HTMLButtonElement;
    expect(unpublishBtn).toBeDefined();
    await act(async () => { unpublishBtn.click(); });
    await tick();
    expect(api.setActivityStatus).toHaveBeenCalledWith('activity-b', 'token', 'draft');
  });

  it('handles published course restriction and rollback on reorder failure', async () => {
    api.reorderLessons.mockRejectedValueOnce(
      new Error('Reordering lessons is not allowed because this published course already has learner delivery. Create a new course version instead of changing content learners are progressing through.'),
    );
    await act(async () => {
      (Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === 'Move Intro down') as HTMLButtonElement).click();
    });
    await tick();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('learner delivery');
    expect(alert?.textContent).toContain('Create a new course version');
  });

  it('disables mutation actions when course is archived', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={{ ...course, status: 'archived' }} token="token" />
        </QueryClientProvider>,
      );
    });
    await tick();

    const addLessonBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.toLowerCase().includes('add lesson'));
    expect(addLessonBtn).toBeDefined();
    expect((addLessonBtn as HTMLButtonElement).disabled).toBe(true);

    const moveDownBtn = container.querySelector('button[aria-label="Move Intro down"]') as HTMLButtonElement;
    expect(moveDownBtn.disabled).toBe(true);
  });

  it('creates a lesson inline and persists it without moving away from the outline', async () => {
    api.createLesson.mockResolvedValueOnce({ id: 'lesson-c', title: 'New unit', ordinal: 3 });
    button('Add Lesson').click();
    await tick();
    expect(container.querySelector('[aria-label="Lesson editor panel"]')).toBeTruthy();
    await change('Lesson title', 'New unit');
    await change('Lesson summary', 'First topics');
    button('Create Lesson').click();
    button('Create Lesson').click();
    await tick();
    expect(api.createLesson).toHaveBeenCalledTimes(1);
    expect(api.createLesson).toHaveBeenCalledWith('course-1', 'token', { title: 'New unit', content: { summary: 'First topics' } });
    expect(container.querySelector('[aria-label="Lesson editor panel"]')).toBeTruthy();
  });

  it('uses explicit move controls and has no drag handles', async () => {
    expect(container.querySelector('[title="Drag to reorder"]')).toBeNull();
    const moveDown = container.querySelector('button[aria-label="Move Intro down"]') as HTMLButtonElement;
    expect(moveDown).toBeTruthy();
    await act(async () => moveDown.click());
    await tick();
    expect(api.reorderLessons).toHaveBeenCalledWith('course-1', 'token', ['lesson-b', 'lesson-a']);
  });

  it('shows an API failure and restores the previous order after move failure', async () => {
    api.reorderLessons.mockRejectedValueOnce(new Error('Order endpoint unavailable'));
    const moveDown = container.querySelector('button[aria-label="Move Intro down"]') as HTMLButtonElement;
    await act(async () => moveDown.click());
    await tick();
    expect(api.reorderLessons).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Order endpoint unavailable');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.findIndex((label) => label.includes('Intro'))).toBeLessThan(labels.findIndex((label) => label.includes('Motion')));
  });
  it('opens the lesson editor beside the outline instead of below it', async () => {
    button('Add Lesson').click();
    await tick();
    const outline = container.querySelector('[aria-label="Course outline"]');
    const editor = container.querySelector('[aria-label="Lesson editor panel"]');
    expect(editor).toBeTruthy();
    expect(outline?.parentElement).toBe(editor?.parentElement);
    expect(editor?.querySelector('[aria-label="Lesson title"]')).toBeTruthy();
    expect(document.activeElement).toBe(editor?.querySelector('[aria-label="Lesson title"]'));
    expect(container.querySelector('[aria-label="Lesson editor panel"]')).toBeTruthy();
  });

  it('cancels a new lesson without calling the create API', async () => {
    button('Add Lesson').click();
    await tick();
    await change('Lesson title', 'Unsaved unit');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    button('Cancel').click();
    await tick();
    expect(api.createLesson).not.toHaveBeenCalled();
    confirm.mockRestore();
    expect(container.querySelector('[aria-label="Add lesson form"]')).toBeNull();
    expect(container.textContent).toContain('Select a lesson to begin');
  });

  it('opens existing lesson details from the outline', async () => {
    button('Intro').click();
    await tick();
    const editor = container.querySelector('[aria-label="Lesson editor panel"]');
    expect((editor?.querySelector('[aria-label="Lesson title"]') as HTMLInputElement).value).toBe('Intro');
    expect((editor?.querySelector('[aria-label="Lesson summary"]') as HTMLTextAreaElement).value).toBe('Old');
  });

  it('asks before switching away from an edited lesson and preserves edits when declined', async () => {
    button('Intro').click();
    await tick();
    await change('Lesson title', 'Changed title');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    button('Motion').click();
    await tick();
    expect(confirm).toHaveBeenCalled();
    expect((container.querySelector('[aria-label="Lesson title"]') as HTMLInputElement).value).toBe('Changed title');
    confirm.mockRestore();
  });

  it('offers API-supported content types and disables types without backend support', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    (Array.from(container.querySelectorAll('button[aria-expanded]')).find((item) => item.textContent?.includes('Read') && item.textContent?.includes('draft')) as HTMLButtonElement).click();
    await tick();
    await act(async () => (container.querySelector('[aria-label="More content types"]') as HTMLButtonElement).click());
    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain('Video');
    expect(menu?.textContent).not.toContain('Secure Learning Media upload is not configured.');
    expect((container.querySelector('[aria-label="Quick Add Video"]') as HTMLButtonElement).disabled).toBe(false);
    const demonstration = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).find((item) => item.textContent?.includes('Demonstration')) as HTMLButtonElement;
    expect(demonstration.disabled).toBe(false);
    expect(menu?.textContent).toContain('Peer Review');
    expect(Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).some((item) => item.textContent?.includes('Peer Review'))).toBe(false);
    expect(api.createActivity).not.toHaveBeenCalled();
  });

  it('does not expose sample media fields that the curriculum API cannot save', async () => {
    button('Intro').click();
    await tick();
    button('Learning Content').click();
    await tick();
    (Array.from(container.querySelectorAll('button[aria-expanded]')).find((item) => item.textContent?.includes('Read') && item.textContent?.includes('draft')) as HTMLButtonElement).click();
    await tick();
    await act(async () => (Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes('Overview')) as HTMLButtonElement).click());
    expect(container.textContent).toContain('No saved activity content.');
    expect(container.textContent).not.toContain('Simulated Video Player');
    expect(container.textContent).not.toContain('storage.vista.education/videos');
  });

});
