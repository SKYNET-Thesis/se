// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalCurriculumEditor } from './CanonicalCurriculumEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ lessons: vi.fn(), sections: vi.fn(), publishGlobalCourse: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    catalogApi: { ...actual.catalogApi, lessons: api.lessons, publishGlobalCourse: api.publishGlobalCourse },
    curriculumApi: { ...actual.curriculumApi, sections: api.sections },
  };
});

const snapshotRef = vi.hoisted(() => ({ current: null as unknown }));
/** The Content Editor is stubbed: it only reports dirtiness and asks the parent to open Preview/Publish. */
const deliverableSections = [{ id: 's1', title: 'Lesson 1', ordinal: 1, status: 'published', learning_activities: [{ id: 'a1', title: 'Read', type: 'reading', ordinal: 1, required: true, status: 'published' }] }];
const snapshot = { lessons: [{ id: 'l-snap', title: 'Snapshot lesson', ordinal: 1 }], sections: deliverableSections, selectedLessonId: 'l-snap' };
vi.mock('../../components/authoring/CourseContentEditor', () => ({
  CourseContentEditor: ({ onDirtyChange, onOpenPreview, onOpenPublish }: { onDirtyChange?: (dirty: boolean) => void; onOpenPreview?: (s: typeof snapshot) => void; onOpenPublish?: (s: typeof snapshot) => void }) => (
    <div data-testid="course-content-editor">
      <button type="button" onClick={() => onDirtyChange?.(true)}>Mark dirty</button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>Mark saved</button>
      <button type="button" onClick={() => onOpenPublish?.((snapshotRef.current ?? snapshot) as typeof snapshot)}>Stub publish</button>
      <button type="button" onClick={() => onOpenPreview?.(snapshot)}>Stub preview</button>
    </div>
  ),
}));

const course = { id: 'course-1', title: 'Robotics', description: 'Course description', status: 'draft' };

describe('CanonicalCurriculumEditor: one publish flow', () => {
  let root: Root; let container: HTMLDivElement;
  const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const press = async (label: string) => {
    const target = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
    if (!target) throw new Error(`Button "${label}" not found`);
    await act(async () => { target.click(); });
    await tick();
  };
  const publishHeader = () => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Review & Publish')) as HTMLButtonElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    snapshotRef.current = null;
    api.lessons.mockResolvedValue([{ id: 'l1', title: 'Intro', ordinal: 1 }]);
    api.sections.mockResolvedValue(deliverableSections);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CanonicalCurriculumEditor course={course} token="token" /></QueryClientProvider>); });
    await tick();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const openChecklistAndPublish = async () => {
    await press('Stub publish');
    expect(document.body.textContent).toContain('Course Readiness Checklist');
    await press('Proceed to Review');
    await press('Publish Course');
  };

  it('blocks publishing while the Content Editor has unsaved changes and explains why', async () => {
    await press('Mark dirty');
    expect(publishHeader().disabled).toBe(true);
    await press('Stub publish');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('unsaved changes');
    expect(document.body.textContent).not.toContain('Course Readiness Checklist');
    expect(api.publishGlobalCourse).not.toHaveBeenCalled();
  });

  it('allows publishing again once the changes are saved, through the same single flow', async () => {
    await press('Mark dirty');
    await press('Mark saved');
    expect(publishHeader().disabled).toBe(false);
    api.publishGlobalCourse.mockResolvedValue({ ...course, status: 'published', enrollmentSync: { classrooms: 3, enrolled: 6 } });
    await openChecklistAndPublish();
    expect(api.publishGlobalCourse).toHaveBeenCalledTimes(1);
    expect(api.publishGlobalCourse).toHaveBeenCalledWith('course-1', 'token');
  });

  it('shows the server enrollment synchronization after a successful publish', async () => {
    api.publishGlobalCourse.mockResolvedValue({ ...course, status: 'published', enrollmentSync: { classrooms: 3, enrolled: 6 } });
    await openChecklistAndPublish();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Course published. 6 student enrollments synchronized across 3 classrooms.');
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('Review & Publish Course'));
  });

  it('shows the publish error, does not claim success, and leaves the course editable for a retry', async () => {
    api.publishGlobalCourse.mockRejectedValueOnce(new Error('Enrollment synchronization failed on classroom 2 of 3.'));
    await openChecklistAndPublish();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enrollment synchronization failed on classroom 2 of 3.');
    expect(document.body.textContent).not.toContain('Course published.');
    expect(publishHeader().disabled).toBe(false);
    api.publishGlobalCourse.mockResolvedValueOnce({ ...course, status: 'published', enrollmentSync: { classrooms: 0, enrolled: 0 } });
    await openChecklistAndPublish();
    expect(api.publishGlobalCourse).toHaveBeenCalledTimes(2);
  });

  it('previews and checks readiness against the curriculum the Content Editor has open', async () => {
    await press('Stub preview');
    expect(document.body.textContent).toContain('Snapshot lesson');
  });

  it('does not report Ready to Publish while a module has no published lesson with a published activity', async () => {
    const draftOnly = [{ ...deliverableSections[0], status: 'draft' }];
    const stubbed = { ...snapshot, lessons: [{ id: 'l-snap', title: 'Snapshot lesson', ordinal: 1 }, { id: 'l-other', title: 'Empty module', ordinal: 2 }], sections: deliverableSections };
    api.sections.mockImplementation(async (id: string) => (id === 'l-other' ? draftOnly : deliverableSections));
    // the stub reports the 2-module snapshot
    snapshotRef.current = stubbed;
    await press('Stub publish');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Missing in: Empty module'));
    expect(document.body.textContent).toContain('Requirements Incomplete');
    expect(document.body.textContent).not.toContain('Ready to Publish');
    expect(([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Proceed to Review') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports Ready to Publish once every module has published content', async () => {
    const stubbed = { ...snapshot, lessons: [{ id: 'l-snap', title: 'Snapshot lesson', ordinal: 1 }, { id: 'l-other', title: 'Second module', ordinal: 2 }] };
    api.sections.mockResolvedValue(deliverableSections);
    snapshotRef.current = stubbed;
    await press('Stub publish');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Ready to Publish'));
    expect(([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Proceed to Review') as HTMLButtonElement).disabled).toBe(false);
  });
});
