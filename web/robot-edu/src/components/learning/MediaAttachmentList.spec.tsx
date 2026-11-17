// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InlineLessonImage, MediaAttachmentList } from './MediaAttachmentList';
import { describeMediaFile } from '../../lib/learningMediaKinds';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MediaAttachmentList', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('labels each file type and keeps the file name as the link', () => {
    act(() => root.render(<MediaAttachmentList items={[
      { id: '1', url: 'https://files.test/a.pdf', filename: 'safety-guide.pdf' },
      { id: '2', url: 'https://files.test/b.png', filename: 'diagram.png' },
      { id: '3', url: 'https://files.test/c.pptx', filename: 'slides.pptx' },
      { id: '4', url: 'https://files.test/d.mp3', filename: 'talk.mp3' },
    ]} />));
    expect(container.querySelector('a[href$="a.pdf"]')?.textContent).toBe('safety-guide.pdf');
    expect(container.textContent).toContain('PDF document');
    expect(container.textContent).toContain('PowerPoint slides');
    expect(container.querySelector('img[alt="Preview of diagram.png"]')).not.toBeNull();
    expect(container.querySelector('audio[aria-label="Audio: talk.mp3"]')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders nothing for an empty list', () => {
    act(() => root.render(<MediaAttachmentList items={[]} />));
    expect(container.innerHTML).toBe('');
  });

  it('replaces an image the browser cannot load with a readable message', () => {
    act(() => root.render(<InlineLessonImage src="https://files.test/broken.png" alt="Emergency stop diagram" />));
    const img = container.querySelector('img')!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('This image could not be displayed: Emergency stop diagram');
  });

  it('describes files by extension and falls back for unknown types', () => {
    expect(describeMediaFile('lesson.DOCX')).toEqual({ kind: 'document', label: 'Word document' });
    expect(describeMediaFile('noextension')).toEqual({ kind: 'document', label: 'File' });
  });
});
