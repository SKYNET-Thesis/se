// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReadingDocumentEditor, renderFormattedText } from './ReadingDocumentEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialActivity = {
  id: 'activity-reading-1',
  title: 'What is Robotics?',
  required: true,
  status: 'draft' as const,
  content: {
    version: 1,
    blocks: [
      { type: 'heading', text: 'Introduction to Robotics' },
      { type: 'paragraph', text: 'Robotics is an interdisciplinary branch of engineering and computer science.' },
    ],
    mediaIds: ['media-doc-1'],
  },
};

describe('ReadingDocumentEditor', () => {
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

  const renderComponent = (props: Partial<Parameters<typeof ReadingDocumentEditor>[0]> = {}) => {
    const onChange = props.onChange ?? vi.fn();
    const onSave = props.onSave ?? vi.fn();
    const onCancel = props.onCancel ?? vi.fn();

    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <ReadingDocumentEditor
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

  it('renders initial document title and structured blocks', () => {
    renderComponent();
    const titleInput = container.querySelector('#reading-activity-title') as HTMLInputElement;
    expect(titleInput.value).toBe('What is Robotics?');

    const headingInput = container.querySelector('[aria-label="Heading 1"]') as HTMLInputElement;
    expect(headingInput.value).toBe('Introduction to Robotics');

    const paragraphTextarea = container.querySelector('[aria-label="Paragraph 2"]') as HTMLTextAreaElement;
    expect(paragraphTextarea.value).toContain('Robotics is an interdisciplinary branch');
  });

  it('adds a new paragraph block and emits valid schema to onChange', () => {
    const { onChange } = renderComponent();
    const addParaBtn = container.querySelector('[aria-label="Insert Paragraph"]') as HTMLButtonElement;
    act(() => addParaBtn.click());

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          version: 1,
          blocks: expect.arrayContaining([
            { type: 'heading', text: 'Introduction to Robotics' },
            { type: 'paragraph', text: 'Robotics is an interdisciplinary branch of engineering and computer science.' },
            { type: 'paragraph', text: '' },
          ]),
        }),
      }),
    );
  });

  it('adds bullet and numbered lists', () => {
    const { onChange } = renderComponent();
    const bulletBtn = container.querySelector('[aria-label="Insert Bullet List"]') as HTMLButtonElement;
    act(() => bulletBtn.click());

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          version: 1,
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'bullet_list', items: ['First list item'] }),
          ]),
        }),
      }),
    );
  });

  it('supports undo and redo for block additions', () => {
    const { onChange } = renderComponent();
    const addParaBtn = container.querySelector('[aria-label="Insert Paragraph"]') as HTMLButtonElement;
    act(() => addParaBtn.click());

    const undoBtn = container.querySelector('[aria-label="Undo"]') as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);

    act(() => undoBtn.click());
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          version: 1,
          blocks: [
            { type: 'heading', text: 'Introduction to Robotics' },
            { type: 'paragraph', text: 'Robotics is an interdisciplinary branch of engineering and computer science.' },
          ],
        }),
      }),
    );

    const redoBtn = container.querySelector('[aria-label="Redo"]') as HTMLButtonElement;
    expect(redoBtn.disabled).toBe(false);
    act(() => redoBtn.click());

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          version: 1,
          blocks: expect.arrayContaining([{ type: 'paragraph', text: '' }]),
        }),
      }),
    );
  });

  it('toggles live preview mode to render formatted learner experience', () => {
    renderComponent();
    const togglePreviewBtn = container.querySelector('[aria-label="Switch to Live Preview"]') as HTMLButtonElement;
    act(() => togglePreviewBtn.click());

    expect(container.textContent).toContain('Edit Mode');
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('renderFormattedText parses markdown tokens safely into React elements', () => {
    const rendered = renderFormattedText('Hello **bold** and *italic* and <u>underline</u>');
    expect(rendered).toBeDefined();
  });
});
