import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon, VideoIcon, ImageIcon, EyeIcon, SearchIcon, UploadCloudIcon, MusicIcon } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LearningMediaPreviewModal } from './LearningMediaPreviewModal';
import { learningMediaApi, type ApiLearningMedia } from '../../lib/api';
import { kindOfMime, LEARNING_MEDIA_ACCEPT, LEARNING_MEDIA_FORMATS_LABEL, type LearningMediaKind } from '../../lib/learningMediaKinds';

export interface MediaAsset {
  id: string;
  name: string;
  type: LearningMediaKind;
  format: string;
  size: string;
  url: string;
  uploadedAt: string;
  description: string;
}

export interface MediaAssetLibraryModalProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  token: string;
  onSelectAsset?: (asset: MediaAsset) => void;
  selectionMode?: boolean;
  initialKind?: LearningMediaKind;
  /** Kinds that cannot be chosen here (shown, but "Use file" is disabled with the reason). */
  disallowKinds?: Partial<Record<LearningMediaKind, string>>;
  /** Render as a page section (Course Builder Media Library tab) instead of a dialog. */
  inline?: boolean;
}

const kindOf = kindOfMime;
/** Short badge text; the MIME subtype alone reads badly for MP3 (`mpeg`) and MOV (`quicktime`). */
const FORMAT_LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3', 'video/quicktime': 'MOV', 'video/mp4': 'MP4', 'video/webm': 'WebM', 'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP',
};
export const formatLabel = (mime: string) => FORMAT_LABELS[mime] ?? mime.split('/').at(-1)?.toUpperCase() ?? mime;
export const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`);
const assetOf = (row: ApiLearningMedia, url = ''): MediaAsset => ({
  id: row.id,
  name: row.original_filename,
  type: kindOf(row.mime_type),
  format: formatLabel(row.mime_type),
  size: formatSize(row.size_bytes),
  url,
  uploadedAt: new Date(row.created_at).toLocaleDateString(),
  description: row.mime_type,
});

export function MediaAssetLibraryModal({ open, onClose, courseId, token, onSelectAsset, selectionMode = false, initialKind, disallowKinds, inline = false }: MediaAssetLibraryModalProps) {
  const client = useQueryClient();
  const [filterType, setFilterType] = useState(initialKind ?? '');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<ApiLearningMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaQuery = useQuery({ queryKey: ['learning-media', courseId, search, filterType, showArchived], queryFn: () => learningMediaApi.list(courseId, token, search, filterType, showArchived), enabled: (open || inline) && Boolean(courseId && token), staleTime: 20_000 });
  const previewQuery = useQuery({ queryKey: ['learning-media-author-url', previewAsset?.id], queryFn: () => learningMediaApi.authorUrl(previewAsset!.id, token), enabled: Boolean(previewAsset && token), staleTime: 30_000 });

  const upload = async (file?: File) => {
    if (!file) return;
    setRetryFile(file); setUploading(true); setUploadProgress(0); setError(null);
    try {
      await learningMediaApi.upload(courseId, token, file, setUploadProgress);
      await client.invalidateQueries({ queryKey: ['learning-media', courseId] });
      setRetryFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Learning Media upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const changeArchive = async (row: ApiLearningMedia, archive: boolean) => {
    setBusyId(row.id); setError(null); setNotice(null);
    try {
      if (archive) await learningMediaApi.archive(row.id, token); else await learningMediaApi.restore(row.id, token);
      await client.invalidateQueries({ queryKey: ['learning-media', courseId] });
      setNotice(archive ? `“${row.original_filename}” was archived. It is hidden from the library and can be restored.` : `“${row.original_filename}” was restored to the library.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : archive ? 'The file could not be archived.' : 'The file could not be restored.');
    } finally { setBusyId(null); }
  };
  const rows = mediaQuery.data ?? [];
  const icon = (type: MediaAsset['type']) => type === 'video' ? <VideoIcon className="h-5 w-5 text-blue-600" /> : type === 'audio' ? <MusicIcon className="h-5 w-5 text-amber-600" /> : type === 'image' ? <ImageIcon className="h-5 w-5 text-emerald-600" /> : <FileTextIcon className="h-5 w-5 text-indigo-600" />;
  const preview = previewAsset && previewQuery.data?.url ? assetOf(previewAsset, previewQuery.data.url) : null;

  const body = (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5"><SearchIcon className="h-4 w-4 text-ink-subtle" /><input placeholder="Search files by name..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none text-ink" aria-label="Search library assets" /></div>
      <div className="flex flex-wrap gap-1.5">{[['', 'all'], ['video', 'video'], ['document', 'document'], ['image', 'image'], ['audio', 'audio']].map(([value, label]) => <button key={value || 'all'} type="button" onClick={() => setFilterType(value)} className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${filterType === value ? 'bg-accent text-white' : 'bg-sunken text-ink-muted'}`}>{label}</button>)}</div>
    </div>
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-sunken/20 p-4">
      <UploadCloudIcon className="h-6 w-6 text-ink-subtle" /><span className="flex-1"><span className="block text-xs font-semibold text-ink">Upload learning media</span><span className="mt-0.5 block text-xs text-ink-muted">{LEARNING_MEDIA_FORMATS_LABEL} · 250 MB maximum</span></span>
      <input ref={fileInput} className="sr-only" type="file" accept={LEARNING_MEDIA_ACCEPT} disabled={uploading || !courseId || !token} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} aria-label="Upload learning media" />
      <div className="flex items-center gap-2">
        {uploading && <span role="status" className="text-xs text-ink-muted">Uploading{uploadProgress === null ? '…' : ` ${uploadProgress}%`}</span>}
        {error && retryFile && <Button type="button" size="sm" variant="secondary" onClick={() => void upload(retryFile)}>Retry upload</Button>}
        <Button type="button" size="sm" variant="secondary" loading={uploading} disabled={uploading || !courseId || !token} onClick={() => fileInput.current?.click()}>Choose file</Button>
      </div>
    </div>
    <div className="flex items-center justify-between gap-2"><span className="text-xs text-ink-muted">{showArchived ? 'Archived files are hidden from lessons. Restore one to use it again.' : 'Files used by a lesson cannot be archived until they are removed from it.'}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setShowArchived((value) => !value); setNotice(null); setError(null); }} aria-pressed={showArchived}>{showArchived ? 'Back to library' : 'Show archived'}</Button></div>
    {notice && <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok">{notice}</p>}
    {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {mediaQuery.isError && <p role="alert" className="text-sm text-danger">Learning Media library could not be loaded.</p>}
    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {mediaQuery.isLoading ? <p role="status" className="p-8 text-center text-sm text-ink-muted">Loading course media…</p> : rows.length === 0 ? <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-muted" role="status">{search ? 'No files match your search.' : showArchived ? 'No archived files.' : 'No learning media is available in this course yet.'}</p> : rows.map((row) => { const asset = assetOf(row); return <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3.5"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="mt-0.5 shrink-0">{icon(asset.type)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h5 className="min-w-0 truncate text-sm font-semibold text-ink" title={asset.name}>{asset.name}</h5><Badge tone="neutral" className="shrink-0">{asset.format}</Badge></div><p className="mt-1 text-xs text-ink-muted">{asset.size} · {asset.uploadedAt} · {showArchived ? `Archived${row.archive_reason ? ` — ${row.archive_reason}` : ''}` : 'Ready'}</p></div></div><div className="ml-3 flex shrink-0 items-center gap-2"><Button size="sm" variant="ghost" icon={<EyeIcon className="h-3.5 w-3.5" />} onClick={() => setPreviewAsset(row)} aria-label={`Preview ${asset.name}`}>Preview</Button>{showArchived ? <Button size="sm" variant="secondary" loading={busyId === row.id} disabled={busyId !== null} onClick={() => void changeArchive(row, false)} aria-label={`Restore ${asset.name}`}>Restore</Button> : <>{!selectionMode && <Button size="sm" variant="ghost" loading={busyId === row.id} disabled={busyId !== null} onClick={() => void changeArchive(row, true)} aria-label={`Archive ${asset.name}`}>Archive</Button>}{selectionMode && (disallowKinds?.[asset.type] ? <span className="max-w-[11rem] text-right text-xs text-ink-muted">{disallowKinds[asset.type]}</span> : <Button size="sm" variant="primary" onClick={() => { onSelectAsset?.(asset); onClose(); }}>Use file</Button>)}</>}</div></div>; })}
    </div>
  </div>
  );

  return <>
    {inline ? (
      <section aria-labelledby="learning-media-heading" className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 id="learning-media-heading" className="text-lg font-bold text-ink">Learning Media Library</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Course-scoped videos, documents, images, and audio stored in private Learning Media storage.</p>
          </div>
          <span className="text-xs text-ink-muted">{rows.length} ready file{rows.length === 1 ? '' : 's'}</span>
        </header>
        {body}
      </section>
    ) : (
    <Dialog open={open} onClose={onClose} title="Learning Media Library" description="Course-scoped videos, documents, images, and audio stored in private Learning Media storage." footer={<div className="flex items-center justify-between w-full"><span className="text-xs text-ink-muted">{rows.length} ready file{rows.length === 1 ? '' : 's'}</span><Button variant="secondary" onClick={onClose}>Close</Button></div>}>
        {body}
    </Dialog>
    )}
    <LearningMediaPreviewModal open={Boolean(previewAsset)} media={preview} onClose={() => { setPreviewAsset(null); }} onOpenFull={preview ? () => window.open(preview.url, '_blank', 'noopener,noreferrer') : undefined} openLabel="Open file" />
  </>;
}
