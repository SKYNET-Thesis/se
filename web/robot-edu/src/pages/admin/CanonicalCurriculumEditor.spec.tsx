// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalCurriculumEditor, type CurriculumEditorDragRef } from './CanonicalCurriculumEditor';

vi.mock('../../components/authoring/QuizAuthoringPanel', () => ({
  QuizAuthoringPanel: ({ lessonId }: { lessonId: string }) => <div data-testid="quiz-authoring-panel">Question Bank quiz for {lessonId}</div>,
}));

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
  let dragRef: React.MutableRefObject<CurriculumEditorDragRef | null>;

  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    dragRef = { current: null };
    Object.values(api).forEach((mock) => (mock as ReturnType<typeof vi.fn>).mockReset());
    api.lessons.mockResolvedValue([lessonA, lessonB]);
    api.sections.mockResolvedValue([sectionA, sectionB]);
    Object.values(api)
      .filter((mock) => mock !== api.lessons && mock !== api.sections)
      .forEach((mock) => (mock as ReturnType<typeof vi.fn>).mockResolvedValue({}));

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={course} token="token" dragRef={dragRef} />
        </QueryClientProvider>,
      );
    });
    await tick();
    // The default view is the Content Editor; these tests exercise Curriculum Structure, so they select it explicitly.
    const structureTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent?.includes('Curriculum Structure')) as HTMLElement;
    await act(async () => { structureTab.click(); });
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
        const item = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text);
        if (!item) throw new Error(`Button "${text}" not found`);
        (item as HTMLButtonElement).click();
      }),
  });

  const input = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;

  const change = async (label: string, value: string) => {
    await act(async () => {
      const field = input(label);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
  };

  it('edits a lesson and persists selected prerequisites', async () => {
    button('Edit').click();
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
    await tick();
    (Array.from(container.querySelectorAll('button')).find((item) => item.getAttribute('aria-label') === 'Move Read down') as HTMLButtonElement).click();
    await tick();
    expect(api.reorderSections).toHaveBeenCalledWith('lesson-a', 'token', ['section-b', 'section-a']);
  });

  it('creates and edits a section', async () => {
    button('Intro').click();
    await tick();
    button('Add section').click();
    await tick();
    await change('Section title', 'New section');
    button('Save').click();
    await tick();
    expect(api.createSection).toHaveBeenCalledWith('lesson-a', 'token', { title: 'New section', ordinal: 3 });
    const read = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Read') as HTMLButtonElement;
    (read.parentElement?.querySelectorAll('button')[1] as HTMLButtonElement).click();
    await tick();
    await change('Section title', 'Reading');
    button('Save').click();
    await tick();
    expect(api.updateSection).toHaveBeenCalledWith('section-a', 'token', { title: 'Reading' });
  });

  it('creates an activity with its canonical content reference', async () => {
    button('Intro').click();
    await tick();
    await tick();
    button('Read').click();
    await tick();
    await tick();
    button('Add activity').click();
    await tick();
    await change('Activity title', 'Practice');
    await act(async () => {
      const field = document.querySelector('[aria-label="Activity type"]') as HTMLSelectElement;
      field.value = 'guided_practice';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    await change('Assignment ID', 'assignment-1');
    button('Save').click();
    await tick();
    expect(api.createActivity).toHaveBeenCalledWith(
      'section-a',
      'token',
      expect.objectContaining({ title: 'Practice', type: 'guided_practice', contentRef: { kind: 'assignment', id: 'assignment-1' } }),
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
    await tick();
    button('Read').click();
    await tick();
    await tick();

    // Activity Overview is draft -> button Publish Overview · reading
    const publishBtn = container.querySelector('button[aria-label="Publish Overview · reading"]') as HTMLButtonElement;
    expect(publishBtn).toBeDefined();
    await act(async () => { publishBtn.click(); });
    await tick();
    expect(api.setActivityStatus).toHaveBeenCalledWith('activity-a', 'token', 'published');

    // Activity Video is published -> button Unpublish Video · video
    const unpublishBtn = container.querySelector('button[aria-label="Unpublish Video · video"]') as HTMLButtonElement;
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

    const addLessonBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add lesson');
    expect(addLessonBtn).toBeDefined();
    expect((addLessonBtn as HTMLButtonElement).disabled).toBe(true);

    const moveDownBtn = container.querySelector('button[aria-label="Move Intro down"]') as HTMLButtonElement;
    expect(moveDownBtn.disabled).toBe(true);
  });

  // --- Regression Tests for Drag Performance, Single API Call, and Rollback ---

  it('does not send API calls during intermediate drag updates', async () => {
    expect(dragRef.current).toBeDefined();

    // Intermediate reorder updates as user drags item back and forth across siblings
    await act(async () => {
      dragRef.current?.reorderLessons([lessonB, lessonA]);
    });
    await tick();

    await act(async () => {
      dragRef.current?.reorderLessons([lessonA, lessonB]);
    });
    await tick();

    await act(async () => {
      dragRef.current?.reorderLessons([lessonB, lessonA]);
    });
    await tick();

    // No API calls during intermediate dragging!
    expect(api.reorderLessons).not.toHaveBeenCalled();
  });

  it('sends exactly one API request upon drag completion and preserves new order', async () => {
    // Intermediate drag update
    await act(async () => {
      dragRef.current?.reorderLessons([lessonB, lessonA]);
    });
    await tick();
    expect(api.reorderLessons).not.toHaveBeenCalled();

    // Drag completion (drop)
    await act(async () => {
      await dragRef.current?.endLessonDrag();
    });
    await tick();

    // Exactly one API request
    expect(api.reorderLessons).toHaveBeenCalledTimes(1);
    expect(api.reorderLessons).toHaveBeenCalledWith('course-1', 'token', ['lesson-b', 'lesson-a']);

    // Order is preserved: Motion appears before Intro
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    const motionIndex = buttons.indexOf('Motion');
    const introIndex = buttons.indexOf('Intro');
    expect(motionIndex).toBeLessThan(introIndex);
  });

  it('does not send an API request if drag ends in the original position', async () => {
    // User drags and drops back in original spot
    await act(async () => {
      dragRef.current?.reorderLessons([lessonB, lessonA]);
    });
    await tick();
    await act(async () => {
      dragRef.current?.reorderLessons([lessonA, lessonB]);
    });
    await tick();

    // Drag completion with no net order change
    await act(async () => {
      await dragRef.current?.endLessonDrag();
    });
    await tick();

    expect(api.reorderLessons).not.toHaveBeenCalled();
  });

  it('restores previous order when drag-end persistence fails', async () => {
    api.reorderLessons.mockRejectedValueOnce(
      new Error('Cannot POST /api/v1/admin/courses/course-1/lessons/order'),
    );

    await act(async () => {
      dragRef.current?.reorderLessons([lessonB, lessonA]);
    });
    await tick();

    await act(async () => {
      await dragRef.current?.endLessonDrag();
    });
    await tick();

    expect(api.reorderLessons).toHaveBeenCalledTimes(1);
    // Error is displayed
    expect(document.body.textContent).toContain('Cannot POST /api/v1/admin/courses/course-1/lessons/order');

    // Previous order is restored: Intro before Motion
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    const introIndex = buttons.indexOf('Intro');
    const motionIndex = buttons.indexOf('Motion');
    expect(introIndex).toBeLessThan(motionIndex);
  });
  describe('activity content workspace', () => {
    const openSection = async () => {
      button('Intro').click(); await tick(); await tick();
      button('Read').click(); await tick(); await tick();
    };
    const selectActivity = async (title: string) => {
      const row = Array.from(document.querySelectorAll('[role="button"], button')).find((el) => el.textContent?.includes(title) && !/Publish|Unpublish|Edit|Up|Down/.test(el.getAttribute('aria-label') ?? '')) as HTMLElement;
      if (!row) throw new Error(`Activity ${title} not found`);
      await act(async () => { row.click(); });
      await tick();
    };

    it('authors a knowledge check through the canonical Question Bank panel, not sample questions', async () => {
      api.sections.mockResolvedValue([{ ...sectionA, learning_activities: [
        { id: 'activity-q', title: 'Safety quiz', type: 'knowledge_check', ordinal: 1, required: true, status: 'draft', content_ref: { kind: 'none' } },
      ] }, sectionB]);
      await act(async () => { root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={{ ...course, id: 'course-2' }} token="token" dragRef={dragRef} />
        </QueryClientProvider>); });
      await tick();
      await openSection();
      await selectActivity('Safety quiz');
      button('Edit Activity').click(); await tick();
      expect(document.querySelector('[data-testid="quiz-authoring-panel"]')?.textContent).toContain('lesson-a');
      expect(document.body.textContent).not.toContain('deadman clutch');
    });

    it('persists reading content with the activity instead of dropping it', async () => {
      await openSection();
      await selectActivity('Overview');
      button('Edit Activity').click(); await tick();
      button('Add paragraph').click(); await tick();
      const text = document.querySelector('textarea[aria-label="Paragraph"], textarea') as HTMLTextAreaElement | null;
      if (text) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        await act(async () => { setter?.call(text, 'Wear safety glasses.'); text.dispatchEvent(new Event('input', { bubbles: true })); });
      }
      button('Save Draft').click(); await tick();
      expect(api.updateActivity).toHaveBeenCalledWith('activity-a', 'token', expect.objectContaining({
        content: expect.objectContaining({ version: 1, blocks: expect.any(Array) }),
      }));
    });
  });
  describe('metadata dialogs keep the draft until the API succeeds', () => {
    const openSectionDialog = async () => {
      button('Intro').click(); await tick();
      button('Add section').click(); await tick();
      await change('Section title', 'Draft section');
    };
    // the dialog leaves the DOM after its exit animation
    const dialogGone = () => vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull(), { timeout: 3000 });
    const saveButtons = () => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === 'Save' && !b.hasAttribute('disabled'));

    it('a failed save keeps the dialog open with the typed title and shows the API error inside it', async () => {
      api.createSection.mockRejectedValueOnce(new Error('Ordinal is already in use.'));
      await openSectionDialog();
      button('Save').click(); await tick(); await tick();
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Ordinal is already in use.');
      expect((input('Section title') as HTMLInputElement).value).toBe('Draft section');
      // retry succeeds and only then the dialog closes
      api.createSection.mockResolvedValueOnce({ id: 'section-new' });
      button('Save').click(); await tick(); await tick();
      expect(api.createSection).toHaveBeenCalledTimes(2);
      await dialogGone();
    });

    it('keeps the lesson and activity dialogs open with their drafts when saving fails', async () => {
      api.createLesson.mockRejectedValueOnce(new Error('Lesson service unavailable'));
      button('Add lesson').click(); await tick();
      await change('Lesson title', 'Draft lesson');
      button('Save').click(); await tick(); await tick();
      expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Lesson service unavailable');
      expect((input('Lesson title') as HTMLInputElement).value).toBe('Draft lesson');
      button('Cancel').click(); await tick();
      await dialogGone();

      api.createActivity.mockRejectedValueOnce(new Error('Activity rejected'));
      button('Intro').click(); await tick();
      button('Read').click(); await tick();
      button('Add activity').click(); await tick();
      await change('Activity title', 'Draft activity');
      button('Save').click(); await tick(); await tick();
      expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Activity rejected');
      expect((input('Activity title') as HTMLInputElement).value).toBe('Draft activity');
    });

    it('does not submit twice while the first request is still running', async () => {
      let release: (value: unknown) => void = () => undefined;
      api.createSection.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
      await openSectionDialog();
      button('Save').click(); await tick();
      for (const extra of saveButtons()) await act(async () => { extra.click(); });
      await act(async () => { (document.querySelector('[aria-label="Section title"]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(api.createSection).toHaveBeenCalledTimes(1);
      await act(async () => { release({ id: 'section-new' }); });
      await tick();
      await dialogGone();
    });
  });

  describe('default view', () => {
    it('is the Content Editor regardless of the drag-and-drop testing hook', async () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const second = createRoot(host);
      await act(async () => { second.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CanonicalCurriculumEditor course={{ ...course, id: 'course-view' }} token="token" dragRef={{ current: null }} />
        </QueryClientProvider>); });
      await tick();
      expect(host.querySelector('[data-testid="course-content-editor"]')).not.toBeNull();
      expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Content Editor');
      act(() => second.unmount()); host.remove();
    });
  });
});
