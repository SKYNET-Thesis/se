// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseOutlinePanel } from './CourseOutlinePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lessons = [
  { id: 'lesson-1', title: 'Introduction', ordinal: 1 },
  { id: 'lesson-2', title: 'Robot Control', ordinal: 2 },
];

const sectionsByLesson = {
  'lesson-1': [
    {
      id: 'section-1-1',
      title: 'Basics',
      ordinal: 1,
      status: 'published' as const,
      learning_activities: [
        { id: 'act-1', title: 'What is Robotics?', type: 'reading', ordinal: 1, required: true },
        { id: 'act-2', title: 'Introduction Video', type: 'video', ordinal: 2, required: true },
        { id: 'act-3', title: 'Knowledge Check', type: 'knowledge_check', ordinal: 3, required: true },
      ],
    },
  ],
  'lesson-2': [],
};

describe('CourseOutlinePanel', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const renderComponent = (props: Partial<Parameters<typeof CourseOutlinePanel>[0]> = {}) => {
    const onSelectActivity = props.onSelectActivity ?? vi.fn();
    const onSelectLesson = props.onSelectLesson ?? vi.fn();
    const onAddLesson = props.onAddLesson ?? vi.fn();
    const onAddSection = props.onAddSection ?? vi.fn();
    const onAddActivity = props.onAddActivity ?? vi.fn();

    act(() => {
      root.render(
        <CourseOutlinePanel
          courseTitle="Robotics & AI"
          lessons={lessons}
          sectionsByLesson={sectionsByLesson}
          selectedLessonId="lesson-1"
          selectedSectionId="section-1-1"
          selectedActivityId="act-1"
          onSelectActivity={onSelectActivity}
          onSelectLesson={onSelectLesson}
          onAddLesson={onAddLesson}
          onAddSection={onAddSection}
          onAddActivity={onAddActivity}
          {...props}
        />,
      );
    });

    return { onSelectActivity, onSelectLesson, onAddLesson, onAddSection, onAddActivity };
  };

  it('renders Module -> Lesson -> Activity hierarchy', () => {
    renderComponent();
    expect(container.textContent).toContain('Module 1: Introduction');
    expect(container.textContent).toContain('Lesson 1: Basics');
    expect(container.textContent).toContain('What is Robotics?');
    expect(container.textContent).toContain('Introduction Video');
    expect(container.textContent).toContain('Knowledge Check');
  });

  it('highlights currently selected activity with editing badge', () => {
    renderComponent({ selectedActivityId: 'act-1' });
    expect(container.textContent).toContain('Reading · Editing');
  });

  it('fires onSelectActivity when an activity row is clicked', () => {
    const { onSelectActivity } = renderComponent();
    const videoRow = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Introduction Video');
    expect(videoRow).toBeDefined();

    act(() => {
      videoRow?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectActivity).toHaveBeenCalledWith('lesson-1', 'section-1-1', 'act-2');
  });
});
