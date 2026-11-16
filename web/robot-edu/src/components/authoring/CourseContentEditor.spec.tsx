// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseContentEditor } from './CourseContentEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    },
    curriculumApi: {
      ...actual.curriculumApi,
      sections: mockApi.sections,
      createSection: mockApi.createSection,
      updateActivity: mockApi.updateActivity,
      createActivity: mockApi.createActivity,
      reorderSections: mockApi.reorderSections,
      reorderActivities: mockApi.reorderActivities,
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
    await vi.waitFor(() => {
      expect(container.textContent).toContain('What is Robotics?');
      expect(container.textContent).toContain('Reading · Editing');
    });

    return { onDirtyChange };
  };

  it('renders two-panel layout with outline on left and active reading editor on right', async () => {
    await renderComponent();

    await vi.waitFor(() => {
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

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="video-lesson-editor"]')).not.toBeNull();
      expect(container.textContent).toContain('Video · Editing');
    });
  });

  it('triggers unsaved changes modal when navigating with dirty content', async () => {
    await renderComponent();

    // Click "Insert Paragraph" to dirty the activity content
    let addParaBtn: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
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
    await vi.waitFor(() => {
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

  it('creates a quiz draft after existing activities with a valid empty content reference', async () => {
    await renderComponent();
    mockApi.createActivity.mockResolvedValue({ id: 'a3' });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Knowledge Check');
    try {
      await act(async () => {
        (container.querySelector('[aria-label="Quick Add Quiz"]') as HTMLButtonElement).click();
      });
      await vi.waitFor(() => expect(mockApi.createActivity).toHaveBeenCalled());
      expect(mockApi.createActivity).toHaveBeenCalledWith('s1', 'token-xyz', expect.objectContaining({
        type: 'knowledge_check',
        ordinal: 3,
        contentRef: { kind: 'none' },
      }));
    } finally {
      prompt.mockRestore();
    }
  });
});
