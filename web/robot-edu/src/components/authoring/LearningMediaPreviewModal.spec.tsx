// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningMediaPreviewModal, type LearningMediaPreviewItem } from './LearningMediaPreviewModal';
import { MediaAssetLibraryModal } from './MediaAssetLibraryModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mediaApi = vi.hoisted(() => ({ list: vi.fn(), authorUrl: vi.fn(), upload: vi.fn(), createUpload: vi.fn(), completeUpload: vi.fn(), failUpload: vi.fn(), activityUrl: vi.fn() }));
vi.mock('../../lib/api', () => ({ learningMediaApi: mediaApi }));

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
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onClose = vi.fn();
  });

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it('plays MP3 with a native audio player (format reported as MPEG) and still previews MOV', () => {
    render({ ...pdf, name: 'lecture.mp3', format: 'MPEG', url: 'https://media.example/lecture.mp3?sig=x' });
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.controls).toBe(true);
    expect(audio.autoplay).toBe(false);
    expect(audio.getAttribute('aria-label')).toBe('Audio preview: lecture.mp3');
    click('Close');
    render({ ...pdf, name: 'clip.mov', format: 'QUICKTIME', url: 'https://media.example/clip.mov' });
    expect(document.querySelector('video')).not.toBeNull();
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

  it('loads only persisted course assets from the authorized library API', async () => {
    mediaApi.list.mockResolvedValue([{ id: 'media-1', course_id: 'course-1', original_filename: 'Safety guide.pdf', mime_type: 'application/pdf', size_bytes: 1024, status: 'ready', created_at: '2026-11-10T00:00:00Z' }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(mediaApi.list).toHaveBeenCalled();
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); });
    expect(mediaApi.list).toHaveBeenCalledWith('course-1', 'session-token', '', '');
    expect(document.body.textContent).toContain('Safety guide.pdf');
    expect(document.body.textContent).not.toContain('storage.vista.education');
  });

  it('shows the empty state when the authorized course library is empty', async () => {
    mediaApi.list.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 60)); });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); });
    expect(document.body.textContent).toContain('No learning media is available in this course yet.');
  });

  it('uploads through the authenticated media API and refreshes persisted course media', async () => {
    mediaApi.list.mockResolvedValue([]);
    mediaApi.upload.mockResolvedValue({ id: 'media-2', course_id: 'course-1', original_filename: 'guide.pdf', mime_type: 'application/pdf', size_bytes: 2048, status: 'ready', created_at: '2026-11-10T00:00:00Z' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 30)); });
    const file = new File(['pdf'], 'guide.pdf', { type: 'application/pdf' });
    const input = document.querySelector<HTMLInputElement>('[aria-label="Upload learning media"]');
    if (!input) throw new Error('Learning media file input was not rendered.');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mediaApi.upload).toHaveBeenCalledWith('course-1', 'session-token', file, expect.any(Function));
  });

  it('offers only the supported formats in the picker, including MP3, and filters audio separately', async () => {
    mediaApi.list.mockResolvedValue([{ id: 'media-3', course_id: 'course-1', original_filename: 'lecture.mp3', mime_type: 'audio/mpeg', size_bytes: 4096, status: 'ready', created_at: '2026-11-10T00:00:00Z' }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 60)); });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); });
    const input = document.querySelector<HTMLInputElement>('[aria-label="Upload learning media"]')!;
    expect(input.accept).toContain('audio/mpeg');
    expect(input.accept).toContain('.mp3');
    expect(input.accept).not.toMatch(/\.exe|svg/);
    expect(document.body.textContent).toContain('MP3');
    expect(document.body.textContent).toContain('lecture.mp3');
    const audioFilter = [...document.querySelectorAll('button')].find((b) => b.textContent === 'audio') as HTMLButtonElement;
    await act(async () => { audioFilter.click(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mediaApi.list).toHaveBeenLastCalledWith('course-1', 'session-token', '', 'audio');
  });

  it('uploads an MP3 through the same authenticated media API', async () => {
    mediaApi.list.mockResolvedValue([]);
    mediaApi.upload.mockResolvedValue({ id: 'media-4', course_id: 'course-1', original_filename: 'lecture.mp3', mime_type: 'audio/mpeg', size_bytes: 4096, status: 'ready', created_at: '2026-11-10T00:00:00Z' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 30)); });
    const file = new File(['ID3'], 'lecture.mp3', { type: 'audio/mpeg' });
    const input = document.querySelector<HTMLInputElement>('[aria-label="Upload learning media"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mediaApi.upload).toHaveBeenCalledWith('course-1', 'session-token', file, expect.any(Function));
  });

  it('shows upload progress and offers retry after a storage failure', async () => {
    mediaApi.list.mockResolvedValue([]);
    mediaApi.upload.mockImplementationOnce(async (_course: string, _token: string, _file: File, progress: (value: number) => void) => {
      progress(42);
      throw new Error('Storage unavailable');
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 30)); });
    const file = new File(['pdf'], 'guide.pdf', { type: 'application/pdf' });
    const input = document.querySelector<HTMLInputElement>('[aria-label="Upload learning media"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.body.textContent).toContain('Storage unavailable');
    const retry = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Retry upload');
    expect(retry).toBeDefined();
    mediaApi.upload.mockResolvedValueOnce({ id: 'media-4', status: 'ready' });
    await act(async () => { retry?.click(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mediaApi.upload).toHaveBeenLastCalledWith('course-1', 'session-token', file, expect.any(Function));
  });

  it('reuses an existing persisted media record without creating a duplicate upload', async () => {
    mediaApi.list.mockResolvedValue([{ id: 'media-3', course_id: 'course-1', original_filename: 'intro.mp4', mime_type: 'video/mp4', size_bytes: 1024, status: 'ready', created_at: '2026-11-10T00:00:00Z' }]);
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" selectionMode onSelectAsset={onSelect} initialKind="video" /></QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 30)); });
    await act(async () => { root.render(<QueryClientProvider client={client}><MediaAssetLibraryModal open onClose={onClose} courseId="course-1" token="session-token" selectionMode onSelectAsset={onSelect} initialKind="video" /></QueryClientProvider>); });
    const useButton = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Use file');
    await act(async () => { useButton?.click(); });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'media-3', name: 'intro.mp4', type: 'video' }));
    expect(mediaApi.upload).not.toHaveBeenCalled();
  });
});
