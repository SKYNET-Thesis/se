// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningMediaPreviewModal, type LearningMediaPreviewItem } from './LearningMediaPreviewModal';
import { MediaAssetLibraryModal } from './MediaAssetLibraryModal';

const pdf: LearningMediaPreviewItem = {
  name: 'Safety guide.pdf',
  format: 'PDF',
  size: '2.4 MB',
  url: 'https://media.example/private/safety.pdf?token=temporary',
  description: 'Safety reference',
};

describe('LearningMediaPreviewModal', () => {
  let root: Root;
  let container: HTMLDivElement;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onClose = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  const render = (media: LearningMediaPreviewItem | null, overrides: { open?: boolean; onOpenFull?: () => void } = {}) => act(() => {
    root.render(<LearningMediaPreviewModal open={overrides.open ?? true} onClose={onClose} media={media} onOpenFull={overrides.onOpenFull} />);
  });

  const click = (label: string) => act(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
    if (!button) throw new Error(`Button "${label}" not found`);
    (button as HTMLButtonElement).click();
  });

  it('opens in a portal with an accessible title and PDF preview', () => {
    render(pdf);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('#root [role="dialog"]')).toBeNull();
    expect(dialog?.textContent).toContain('Safety guide.pdf');
    expect(dialog?.parentElement?.className).toContain('items-center');
    expect(dialog?.className).toContain('max-w-[900px]');
    expect(document.querySelector('iframe[title="PDF preview: Safety guide.pdf"]')?.getAttribute('src')).toContain('safety.pdf');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('renders images without cropping and reports loading completion', () => {
    render({ ...pdf, name: 'arm.png', format: 'PNG', url: 'https://media.example/arm.png' });
    const image = document.querySelector('img[alt="arm.png"]') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.className).toContain('object-contain');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading preview');
    act(() => image.dispatchEvent(new Event('load')));
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('uses native video controls and pauses/resets playback when closed', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render({ ...pdf, name: 'lesson.mp4', format: 'MP4', url: 'https://media.example/lesson.mp4' });
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    click('Close');
    expect(pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a clear unsupported state for DOCX and invokes only the provided full-content action', () => {
    const openFull = vi.fn();
    render({ ...pdf, name: 'lesson.docx', format: 'DOCX' }, { onOpenFull: openFull });
    expect(document.querySelector('iframe, video, img')).toBeNull();
    expect(document.body.textContent).toContain('Inline preview isn’t available');
    click('Open full content');
    expect(openFull).toHaveBeenCalledOnce();
  });

  it.each(['PPTX', 'URDF', 'H5/MP4'])('uses the file information fallback for %s', (format) => {
    render({ ...pdf, name: `lesson.${format}`, format });
    expect(document.body.textContent).toContain('Inline preview isn’t available');
    expect(document.querySelector('iframe, video, img')).toBeNull();
  });

  it('shows an empty-link state instead of loading a missing URL', () => {
    render({ ...pdf, url: '' });
    expect(document.body.textContent).toContain('Media link unavailable');
    expect(document.body.textContent).toContain('no valid media link');
    expect(document.querySelector('iframe, video, img')).toBeNull();
    expect(Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Open full content'))).toBe(false);
  });

  it('rejects unsafe media protocols', () => {
    render({ ...pdf, url: 'javascript:alert(1)' });
    expect(document.body.textContent).toContain('Media link unavailable');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows an error state when an inline preview fails', () => {
    render({ ...pdf, name: 'arm.png', format: 'PNG', url: 'https://media.example/arm.png' });
    act(() => document.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be previewed');
  });

  it('closes with Escape and restores body scrolling', () => {
    function ControlledModal() {
      const [open, setOpen] = React.useState(true);
      return <LearningMediaPreviewModal open={open} onClose={() => { onClose(); setOpen(false); }} media={pdf} />;
    }
    act(() => root.render(<ControlledModal />));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from the backdrop and focuses a dialog control when opened', async () => {
    render(pdf);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.activeElement?.textContent?.trim()).toBe('Close');
    const backdrop = document.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    act(() => backdrop?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render when closed or when media is absent', () => {
    render(pdf, { open: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    render(null);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens the reusable preview from the existing instructor asset library', () => {
    act(() => root.render(<MediaAssetLibraryModal open onClose={onClose} />));
    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Preview SO-101 Hardware Safety & E-Stop Protocol Guide"]')?.click();
    });
    expect(Array.from(document.querySelectorAll('[role="dialog"]')).some((dialog) => dialog.textContent?.includes('SO-101 Hardware Safety & E-Stop Protocol Guide'))).toBe(true);
    expect(document.querySelector('iframe[title^="PDF preview"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Asset URI:');
  });

  it('shows an empty state when an asset search has no results', () => {
    act(() => root.render(<MediaAssetLibraryModal open onClose={onClose} />));
    act(() => {
      const search = document.querySelector<HTMLInputElement>('[aria-label="Search library assets"]');
      if (!search) throw new Error('Asset search input not found');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(search, 'no matching file');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('No files match your search.');
  });

  it('closes only the topmost preview when Escape is pressed in a nested dialog', async () => {
    function ControlledLibrary() {
      const [open, setOpen] = React.useState(true);
      return <MediaAssetLibraryModal open={open} onClose={() => { onClose(); setOpen(false); }} />;
    }
    act(() => root.render(<ControlledLibrary />));
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Preview SO-101 Hardware Safety & E-Stop Protocol Guide"]')?.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('');
  });
});
