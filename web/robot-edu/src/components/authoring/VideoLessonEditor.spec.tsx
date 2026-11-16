// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoLessonEditor } from './VideoLessonEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialActivity = {
  id: 'activity-video-1',
  title: 'Introduction to Robot Control',
  required: true,
  status: 'draft' as const,
  content: {
    version: 1,
    videoMediaId: 'media-video-1',
    description: 'Learn the fundamentals of inverse kinematics and motor actuation.',
    durationSeconds: 300,
  },
};

describe('VideoLessonEditor', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const renderComponent = (props: Partial<Parameters<typeof VideoLessonEditor>[0]> = {}) => {
    const onChange = props.onChange ?? vi.fn();
    const onSave = props.onSave ?? vi.fn();
    const onCancel = props.onCancel ?? vi.fn();

    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <VideoLessonEditor
            activity={initialActivity}
            courseId="course-1"
            token="test-token"
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={false}
            isDirty={false}
            {...props}
          />
        </QueryClientProvider>,
      );
    });

    return { onChange, onSave, onCancel };
  };

  it('renders initial video title, description, and duration in minutes', () => {
    renderComponent();
    const titleInput = container.querySelector('#video-activity-title') as HTMLInputElement;
    expect(titleInput.value).toBe('Introduction to Robot Control');

    const desc = container.querySelector('#video-description') as HTMLTextAreaElement;
    expect(desc.value).toBe('Learn the fundamentals of inverse kinematics and motor actuation.');

    const minutesInput = container.querySelector('input[placeholder="Min"]') as HTMLInputElement;
    expect(minutesInput.value).toBe('5');
  });

  it('updates description and emits to onChange', () => {
    const { onChange } = renderComponent();
    const desc = container.querySelector('#video-description') as HTMLTextAreaElement;

    act(() => {
      const prototype = HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(desc, 'Updated description');
      desc.dispatchEvent(new Event('input', { bubbles: true }));
      desc.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          description: 'Updated description',
        }),
      }),
    );
  });

  it('triggers onSave when Save Draft button is clicked', () => {
    const { onSave } = renderComponent({ isDirty: true });
    const saveBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save Draft'));
    expect(saveBtn).toBeDefined();

    act(() => saveBtn?.click());
    expect(onSave).toHaveBeenCalled();
  });
});
