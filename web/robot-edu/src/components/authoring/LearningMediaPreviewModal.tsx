import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLinkIcon, FileIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export interface LearningMediaPreviewItem {
  name: string;
  format: string;
  size?: string;
  url: string;
  description?: string;
  duration?: string;
}

type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'unsupported';

function validMediaUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value, 'https://vista.invalid');
    return ['http:', 'https:', 'blob:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function previewKind(item: LearningMediaPreviewItem): PreviewKind {
  const format = item.format.toLowerCase().replace(/^\./, '');
  const path = item.url.split(/[?#]/, 1)[0].toLowerCase();
  if (format) {
    if (format === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(format)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(format)) return 'video';
    if (['mp3', 'mpeg'].includes(format)) return 'audio';
    return 'unsupported';
  }
  if (path.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(path)) return 'image';
  if (/\.(mp4|webm|ogv|mov)$/.test(path)) return 'video';
  if (/\.mp3$/.test(path)) return 'audio';
  return 'unsupported';
}

export function LearningMediaPreviewModal({
  open,
  onClose,
  media,
  onOpenFull,
  openLabel = 'Open full content',
}: {
  open: boolean;
  onClose: () => void;
  media: LearningMediaPreviewItem | null;
  onOpenFull?: () => void;
  openLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasValidUrl = Boolean(media && validMediaUrl(media.url));
  const kind = media && hasValidUrl ? previewKind(media) : 'unsupported';

  useEffect(() => {
    if (!open) return undefined;
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    };
  }, [open, media?.url]);

  useEffect(() => {
    if (open) setLoading(true);
    setError(false);
  }, [open, media?.url]);

  const closePreview = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    onClose();
  }, [onClose]);

  const openFullContent = () => {
    if (onOpenFull) {
      onOpenFull();
      return;
    }
    if (media?.url && validMediaUrl(media.url)) window.open(media.url, '_blank', 'noopener,noreferrer');
  };

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <Button variant="secondary" onClick={closePreview}>Close</Button>
      {media && (onOpenFull || hasValidUrl) && (
        <Button variant="primary" icon={<ExternalLinkIcon className="h-4 w-4" />} onClick={openFullContent}>
          {openLabel}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog
      open={open && Boolean(media)}
      onClose={closePreview}
      size="preview"
      title={media?.name ?? 'Media preview'}
      description={media ? `${media.format}${media.size ? ` · ${media.size}` : ''}` : undefined}
      footer={footer}
    >
      {media && (
        <div className="min-h-64">
          {kind === 'unsupported' ? (
            <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-sunken text-ink-muted"><FileIcon className="h-6 w-6" aria-hidden /></span>
              <div>
                <h3 className="font-semibold text-ink">{hasValidUrl ? 'Inline preview isn’t available' : 'Media link unavailable'}</h3>
                <p className="mt-1 text-sm text-ink-muted">{media.name} · {media.format}{media.size ? ` · ${media.size}` : ''}</p>
                {!hasValidUrl && <p className="mt-2 text-sm text-ink-muted">This item has no valid media link. Ask an instructor to update it.</p>}
                {media.description && <p className="mt-2 text-sm text-ink-muted">{media.description}</p>}
              </div>
            </div>
          ) : (
            <div className="relative grid min-h-64 place-items-center overflow-hidden rounded-lg bg-sunken">
              {loading && !error && <div className="absolute z-10 flex items-center gap-2 rounded-md bg-surface/90 px-3 py-2 text-sm text-ink-muted" role="status"><LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden />Loading preview…</div>}
              {error && <p className="p-6 text-center text-sm text-danger" role="alert">This file could not be previewed. Check your access or open the full content.</p>}
              {!error && kind === 'pdf' && <iframe key={media.url} src={media.url} title={`PDF preview: ${media.name}`} className="h-[68vh] max-h-[680px] min-h-64 w-full" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError(true); }} />}
              {!error && kind === 'image' && <img key={media.url} src={media.url} alt={media.name} className="max-h-[68vh] max-w-full object-contain" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError(true); }} />}
              {!error && kind === 'audio' && <audio key={media.url} src={media.url} controls preload="metadata" className="w-full max-w-xl p-6" onLoadedData={() => setLoading(false)} onError={() => { setLoading(false); setError(true); }} aria-label={`Audio preview: ${media.name}`} />}
              {!error && kind === 'video' && <video key={media.url} ref={videoRef} src={media.url} controls playsInline preload="metadata" className="max-h-[68vh] w-full" onLoadedData={() => setLoading(false)} onError={() => { setLoading(false); setError(true); }} aria-label={`Video preview: ${media.name}`} />}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
