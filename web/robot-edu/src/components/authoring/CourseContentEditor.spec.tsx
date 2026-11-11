// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseContentEditor } from './CourseContentEditor';

// The Question Bank panel has its own spec; here it is a stub that exposes what the editor passes to it.
vi.mock('./QuizAuthoringPanel', () => ({
  QuizAuthoringPanel: ({ lessonId, assignmentId, readOnly, onChange }: { lessonId: string; assignmentId?: string; readOnly?: boolean; onChange: (patch: { contentRef?: { kind: 'assignment'; id: string } }) => void }) => (
    <div data-testid="quiz-authoring-panel" data-lesson={lessonId} data-assignment={assignmentId ?? ''} data-readonly={String(Boolean(readOnly))}>
      <button type="button" disabled={readOnly} onClick={() => onChange({ contentRef: { kind: 'assignment', id: '99999999-9999-4999-8999-999999999999' } })}>Create quiz draft</button>
    </div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The full suite runs many jsdom files in parallel; give UI assertions generous time instead of racing the 1 s default.
const waitFor = <T,>(callback: () => T) => vi.waitFor(callback, { timeout: 8000, interval: 25 });

const mockApi = vi.hoisted(() => ({
  lessons: vi.fn(),
  sections: vi.fn(),
  updateActivity: vi.fn(),
  createLesson: vi.fn(),
  createSection: vi.fn(),
  createActivity: vi.fn(),
  reorderLessons: vi.fn(),
  reorderSections: vi.fn(),
  reorderActivities: vi.fn(),
  publishGlobalCourse: vi.fn(),
  updateLesson: vi.fn(),
  updateSection: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      lessons: mockApi.lessons,
      createLesson: mockApi.createLesson,
      reorderLessons: mockApi.reorderLessons,
      publishGlobalCourse: mockApi.publishGlobalCourse,
      updateLesson: mockApi.updateLesson,
    },
    curriculumApi: {
      ...actual.curriculumApi,
      sections: mockApi.sections,
      createSection: mockApi.createSection,
      updateActivity: mockApi.updateActivity,
      createActivity: mockApi.createActivity,
      reorderSections: mockApi.reorderSections,
      reorderActivities: mockApi.reorderActivities,
      updateSection: mockApi.updateSection,
    },
  };
});

const course = { id: 'course-c1', title: 'Robotics Fundamentals', description: 'C1', status: 'draft' as const };
const sampleLessons = [
  { id: 'l1', title: 'Introduction', ordinal: 1 },
  { id: 'l2', title: 'Robot Kinematics', ordinal: 2 },
];
const sampleSections = [
  {
    id: 's1',
    title: 'Basics',
    ordinal: 1,
    status: 'draft' as const,
    learning_activities: [
      { id: 'a1', title: 'What is Robotics?', type: 'reading', ordinal: 1, required: true, content: { version: 1, blocks: [] } },
      { id: 'a2', title: 'Arm Motion Video', type: 'video', ordinal: 2, required: true, content: { version: 1, videoMediaId: '' } },
    ],
  },
];

describe('CourseContentEditor', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mockApi.lessons.mockResolvedValue(sampleLessons);
    mockApi.sections.mockResolvedValue(sampleSections);
    mockApi.updateActivity.mockResolvedValue({});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const renderComponent = async (props: Partial<Parameters<typeof CourseContentEditor>[0]> = {}) => {
    const onDirtyChange = props.onDirtyChange ?? vi.fn();

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <CourseContentEditor
            course={course}
            token="token-xyz"
            onDirtyChange={onDirtyChange}
            {...props}
          />
        </QueryClientProvider>,
      );
    });

    // Wait for queries to resolve and first activity to be auto-selected
    await waitFor(() => {
      expect(container.textContent).toContain('What is Robotics?');
      expect(container.textContent).toContain('Reading · Editing');
    });

    return { onDirtyChange };
  };

  it('renders two-panel layout with outline on left and active reading editor on right', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="course-outline-panel"]')).not.toBeNull();
      expect(container.textContent).toContain('What is Robotics?');
      expect(container.textContent).toContain('Reading · Editing');
      expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull();
    });
  });

  it('switches between activities and shows appropriate content editor', async () => {
    await renderComponent();

    // Click on "Arm Motion Video"
    const videoItem = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Arm Motion Video');
    expect(videoItem).toBeDefined();

    await act(async () => {
      videoItem?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="video-lesson-editor"]')).not.toBeNull();
      expect(container.textContent).toContain('Video · Editing');
    });
  });

  it('triggers unsaved changes modal when navigating with dirty content', async () => {
    await renderComponent();

    // Click "Insert Paragraph" to dirty the activity content
    let addParaBtn: HTMLButtonElement | null = null;
    await waitFor(() => {
      addParaBtn = container.querySelector('[aria-label="Insert Paragraph"]') as HTMLButtonElement;
      expect(addParaBtn).not.toBeNull();
    });

    await act(async () => {
      addParaBtn!.click();
    });

    // Try navigating to Video activity
    const videoItem = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Arm Motion Video');
    await act(async () => {
      videoItem?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Confirm that the Unsaved Changes warning modal appeared
    await waitFor(() => {
      expect(container.textContent).toContain('Unsaved Changes');
      expect(container.textContent).toContain('Stay Here');
      expect(container.textContent).toContain('Discard Changes');
      expect(container.textContent).toContain('Save & Continue');
    });

    // Click "Stay Here" to cancel navigation
    const stayBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Stay Here');
    await act(async () => {
      stayBtn?.click();
    });

    // Modal closes, still on Reading editor
    expect(container.querySelector('[data-testid="reading-document-editor"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Unsaved Changes');
  });
  describe('Add Quiz flow (Add → Create activity → Configure → Save → Reload)', () => {
    const QUIZ_UUID = '99999999-9999-4999-8999-999999999999';
    let sectionsNow: typeof sampleSections;
    const quiz = (contentRef: unknown) => ({ id: 'a3', title: 'Safety quiz', type: 'knowledge_check', ordinal: 3, required: true, status: 'draft', content_ref: contentRef, content: {} });
    const withQuiz = (contentRef: unknown) => [{ ...sampleSections[0], learning_activities: [...sampleSections[0].learning_activities, quiz(contentRef)] }] as unknown as typeof sampleSections;
    const quickAddQuiz = async () => {
      const add = container.querySelector('[aria-label="Quick Add Quiz"]') as HTMLButtonElement;
      expect(add).not.toBeNull();
      await act(async () => { add.click(); });
      // naming dialog (replaces window.prompt)
      await waitFor(() => expect(document.querySelector('#curriculum-name-form input')).not.toBeNull());
      const input = document.querySelector('#curriculum-name-form input') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Safety quiz');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const confirm = [...document.querySelectorAll('button')].find((b) => b.getAttribute('form') === 'curriculum-name-form') as HTMLButtonElement;
      await act(async () => { confirm.click(); });
    };
    const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

    beforeEach(() => {
      sectionsNow = sampleSections;
      mockApi.sections.mockImplementation(async () => sectionsNow);
      mockApi.createActivity.mockImplementation(async () => { sectionsNow = withQuiz({ kind: 'none' }); return { id: 'a3' }; });
    });

    it('creates the quiz activity with `none` as its content reference and the next free ordinal, never an empty assignment id', async () => {
      await renderComponent();
      await quickAddQuiz();
      await waitFor(() => expect(mockApi.createActivity).toHaveBeenCalledTimes(1));
      const [sectionId, token, body] = mockApi.createActivity.mock.calls[0];
      expect([sectionId, token]).toEqual(['s1', 'token-xyz']);
      expect(body).toMatchObject({ title: 'Safety quiz', type: 'knowledge_check', ordinal: 3, required: true, contentRef: { kind: 'none' } });
      expect(JSON.stringify(body)).not.toContain('"id":""');
    });

    it('opens the new quiz in the Question Bank panel, links the created assignment on Save, and keeps it after reload', async () => {
      mockApi.updateActivity.mockImplementation(async () => { sectionsNow = withQuiz({ kind: 'assignment', id: QUIZ_UUID }); return {}; });
      await renderComponent();
      await quickAddQuiz();
      await waitFor(() => expect(container.querySelector('[data-testid="quiz-authoring-panel"]')).not.toBeNull());
      const panel = () => container.querySelector('[data-testid="quiz-authoring-panel"]') as HTMLElement;
      expect(panel().dataset.lesson).toBe('l1');
      expect(panel().dataset.assignment).toBe(''); // not linked yet

      await act(async () => { button('Create quiz draft')?.click(); }); // the panel creates the canonical assignment and reports its UUID
      await waitFor(() => expect(panel().dataset.assignment).toBe(QUIZ_UUID));
      expect(container.textContent).toContain('Unsaved changes');

      await act(async () => { button('Save Quiz Activity')?.click(); });
      await waitFor(() => expect(mockApi.updateActivity).toHaveBeenCalledTimes(1));
      expect(mockApi.updateActivity).toHaveBeenCalledWith('a3', 'token-xyz', expect.objectContaining({ type: 'knowledge_check', contentRef: { kind: 'assignment', id: QUIZ_UUID } }));
      await waitFor(() => expect(container.textContent).toContain('Saved'));

      // Reload: a fresh mount reads the persisted reference back from the API
      act(() => root.unmount());
      root = createRoot(container);
      sectionsNow = withQuiz({ kind: 'assignment', id: QUIZ_UUID });
      await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CourseContentEditor course={course} token="token-xyz" /></QueryClientProvider>); });
      await waitFor(() => expect(container.textContent).toContain('What is Robotics?'));
      const quizRow = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Safety quiz');
      await act(async () => { quizRow?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await waitFor(() => expect(panel().dataset.assignment).toBe(QUIZ_UUID));
    });

    it('shows the API error and does not select an activity when creating the quiz fails', async () => {
      mockApi.createActivity.mockRejectedValueOnce(new Error('Content reference is invalid.'));
      await renderComponent();
      await quickAddQuiz();
      await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('Content reference is invalid.'));
      expect(container.querySelector('[data-testid="quiz-authoring-panel"]')).toBeNull();
    });

    it('shows the API error under the quiz Save button when linking the assignment fails, keeping the unsaved draft', async () => {
      mockApi.updateActivity.mockRejectedValueOnce(new Error('Assignment was not found.'));
      await renderComponent();
      await quickAddQuiz();
      await waitFor(() => expect(container.querySelector('[data-testid="quiz-authoring-panel"]')).not.toBeNull());
      await act(async () => { button('Create quiz draft')?.click(); });
      await act(async () => { button('Save Quiz Activity')?.click(); });
      await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('Assignment was not found.'));
      expect(container.textContent).toContain('Unsaved changes');
    });

    it('makes the quiz read-only for an archived course: panel locked, Save disabled, no add controls', async () => {
      sectionsNow = withQuiz({ kind: 'assignment', id: QUIZ_UUID });
      await renderComponent({ course: { ...course, status: 'archived' } as never, isArchived: true });
      const quizRow = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Safety quiz');
      await act(async () => { quizRow?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await waitFor(() => expect(container.querySelector('[data-testid="quiz-authoring-panel"]')).not.toBeNull());
      expect((container.querySelector('[data-testid="quiz-authoring-panel"]') as HTMLElement).dataset.readonly).toBe('true');
      expect(button('Save Quiz Activity')?.disabled).toBe(true);
      expect(button('Create quiz draft')?.disabled).toBe(true);
    });
  });

  describe('single publish flow owned by the parent', () => {
    it('renders no Preview/Publish buttons unless the parent provides handlers, so there is no second publish flow', async () => {
      await renderComponent();
      expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Publish')).toBe(false);
      expect(container.textContent).not.toContain('Readiness');
    });

    it('hands the current curriculum to the parent when Preview or Publish is pressed', async () => {
      const onOpenPreview = vi.fn();
      const onOpenPublish = vi.fn();
      await renderComponent({ onOpenPreview, onOpenPublish });
      const press = async (label: string) => act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement).click(); });
      await press('Preview');
      await press('Publish');
      expect(onOpenPreview).toHaveBeenCalledWith(expect.objectContaining({ lessons: sampleLessons, selectedLessonId: 'l1' }));
      expect(onOpenPublish).toHaveBeenCalledWith(expect.objectContaining({ selectedLessonId: 'l1' }));
    });

    it('does not allow publishing stale content while the open activity has unsaved changes', async () => {
      const onOpenPublish = vi.fn();
      await renderComponent({ onOpenPublish });
      const publish = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Publish') as HTMLButtonElement;
      expect(publish().disabled).toBe(false);
      await waitFor(() => expect(container.querySelector('[aria-label="Insert Paragraph"]')).not.toBeNull());
      await act(async () => { (container.querySelector('[aria-label="Insert Paragraph"]') as HTMLButtonElement).click(); });
      await waitFor(() => expect(publish().disabled).toBe(true));
      expect(container.textContent).toContain('Save or discard changes to publish');
      await act(async () => { publish().click(); });
      expect(onOpenPublish).not.toHaveBeenCalled();
    });

    it('does not offer Publish for a course that is archived or already published', async () => {
      await renderComponent({ onOpenPublish: vi.fn(), isArchived: true, course: { ...course, status: 'archived' } as never });
      expect(([...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Publish') as HTMLButtonElement).disabled).toBe(true);
    });
  });
  describe('Reading save and error recovery', () => {
    const dirtyReading = async () => {
      await waitFor(() => expect(container.querySelector('[aria-label="Insert Paragraph"]')).not.toBeNull());
      await act(async () => { (container.querySelector('[aria-label="Insert Paragraph"]') as HTMLButtonElement).click(); });
      await waitFor(() => expect(container.textContent).toContain('Unsaved changes'));
    };
    const saveDraft = async () => act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save Draft')) as HTMLButtonElement).click(); });

    it('keeps the draft and shows the API error when saving fails, then saves on retry', async () => {
      mockApi.updateActivity.mockRejectedValueOnce(new Error('Reading content is invalid.'));
      await renderComponent();
      await dirtyReading();
      await saveDraft();
      await waitFor(() => expect(container.textContent).toContain('Reading content is invalid.'));
      expect(container.textContent).toContain('Unsaved changes'); // the draft was not discarded

      mockApi.updateActivity.mockResolvedValueOnce({});
      await saveDraft();
      await waitFor(() => expect(mockApi.updateActivity).toHaveBeenCalledTimes(2));
      expect(mockApi.updateActivity).toHaveBeenLastCalledWith('a1', 'token-xyz', expect.objectContaining({ type: 'reading', contentRef: { kind: 'none' } }));
      await waitFor(() => expect(container.textContent).not.toContain('Reading content is invalid.'));
    });

    it('does not carry a failed save over to the next selected activity', async () => {
      mockApi.updateActivity.mockRejectedValueOnce(new Error('Reading content is invalid.'));
      await renderComponent();
      await dirtyReading();
      await saveDraft();
      await waitFor(() => expect(container.textContent).toContain('Reading content is invalid.'));
      // discard and move to the video activity
      const videoItem = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Arm Motion Video');
      await act(async () => { videoItem?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await waitFor(() => expect(container.textContent).toContain('Unsaved Changes'));
      await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Discard Changes')) as HTMLButtonElement).click(); });
      await waitFor(() => expect(container.querySelector('[data-testid="video-lesson-editor"]')).not.toBeNull());
      expect(container.textContent).not.toContain('Reading content is invalid.');
    });
  });

  describe('Module and Lesson editing (Course Outline → Content Editor)', () => {
    const typeInto = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
      act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const clickText = async (selector: string, text: string) =>
      act(async () => { ([...container.querySelectorAll(selector)].find((n) => n.textContent?.includes(text)) as HTMLElement).click(); });

    it('selecting a Module opens the Module information editor and does not snap back to the first activity', async () => {
      await renderComponent();
      await clickText('button', 'Module 1: Introduction');
      await waitFor(() => expect(container.querySelector('[data-testid="module-info-editor"]')).not.toBeNull());
      await new Promise((r) => setTimeout(r, 50));
      expect(container.querySelector('[data-testid="module-info-editor"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="reading-document-editor"]')).toBeNull();
      expect(container.querySelector('[data-testid="course-outline-panel"]')).not.toBeNull(); // outline stays visible
    });

    it('saves a renamed Module through the existing lesson API and keeps other lesson content', async () => {
      mockApi.lessons.mockResolvedValue([{ ...sampleLessons[0], content: { summary: 'Old', keep: 1 } }, sampleLessons[1]]);
      mockApi.updateLesson.mockResolvedValue({});
      await renderComponent();
      await clickText('button', 'Module 1: Introduction');
      const form = () => container.querySelector('[data-testid="module-info-editor"]') as HTMLElement;
      await waitFor(() => expect(form()).not.toBeNull());
      await typeInto(form().querySelector('input') as HTMLInputElement, 'Getting started');
      expect(form().textContent).toContain('Unsaved changes');
      await act(async () => { ([...form().querySelectorAll('button')].find((b) => b.textContent === 'Save module') as HTMLButtonElement).click(); });
      await waitFor(() => expect(mockApi.updateLesson).toHaveBeenCalledWith('l1', 'token-xyz', { title: 'Getting started', content: { summary: 'Old', keep: 1 } }));
    });

    it('selecting a Lesson opens the Lesson information editor and saves via the section API', async () => {
      mockApi.updateSection.mockResolvedValue({});
      await renderComponent();
      await clickText('button', 'Lesson 1: Basics');
      const form = () => container.querySelector('[data-testid="lesson-info-editor"]') as HTMLElement;
      await waitFor(() => expect(form()).not.toBeNull());
      await typeInto(form().querySelector('input') as HTMLInputElement, 'Fundamentals');
      await act(async () => { ([...form().querySelectorAll('button')].find((b) => b.textContent === 'Save lesson') as HTMLButtonElement).click(); });
      await waitFor(() => expect(mockApi.updateSection).toHaveBeenCalledWith('s1', 'token-xyz', { title: 'Fundamentals' }));
    });

    it('guards unsaved Module edits when another item is selected', async () => {
      await renderComponent();
      await clickText('button', 'Module 1: Introduction');
      const form = () => container.querySelector('[data-testid="module-info-editor"]') as HTMLElement;
      await waitFor(() => expect(form()).not.toBeNull());
      await typeInto(form().querySelector('input') as HTMLInputElement, 'Changed');
      await clickText('button', 'Lesson 1: Basics');
      await waitFor(() => expect(container.textContent).toContain('Unsaved Changes'));
      expect(container.textContent).not.toContain('Save & Continue'); // only activity drafts can be saved from the guard
      expect(container.querySelector('[data-testid="lesson-info-editor"]')).toBeNull();
    });

    it('adds a Module through a naming dialog (no window.prompt) and selects it', async () => {
      const prompt = vi.spyOn(window, 'prompt');
      mockApi.createLesson.mockResolvedValue({ id: 'l3', title: 'New module', ordinal: 3 });
      await renderComponent();
      await clickText('button', 'Add');
      await waitFor(() => expect(document.querySelector('#curriculum-name-form input')).not.toBeNull());
      await typeInto(document.querySelector('#curriculum-name-form input') as HTMLInputElement, 'New module');
      await act(async () => { (document.querySelector('button[form="curriculum-name-form"]') as HTMLButtonElement).click(); });
      await waitFor(() => expect(mockApi.createLesson).toHaveBeenCalledTimes(1));
      expect(mockApi.createLesson).toHaveBeenCalledWith('course-c1', 'token-xyz', { title: 'New module', content: { summary: '' } });
      expect(prompt).not.toHaveBeenCalled();
    });

    it('shows a helpful empty state with an Add module action for a course without content', async () => {
      mockApi.lessons.mockResolvedValue([]);
      await act(async () => {
        root.render(<QueryClientProvider client={qc}><CourseContentEditor course={course} token="token-xyz" /></QueryClientProvider>);
      });
      await waitFor(() => expect(container.textContent).toContain('Start building your course'));
      expect([...container.querySelectorAll('main button')].some((b) => b.textContent === 'Add module')).toBe(true);
    });

    it('reports the open curriculum to a host that owns Preview and Publish', async () => {
      const onSnapshotChange = vi.fn();
      await renderComponent({ onSnapshotChange });
      await waitFor(() => {
        const last = onSnapshotChange.mock.calls.at(-1)?.[0];
        expect(last?.lessons.map((l: { id: string }) => l.id)).toEqual(['l1', 'l2']);
        expect(last?.selectedLessonId).toBe('l1');
      });
    });
  });
});
