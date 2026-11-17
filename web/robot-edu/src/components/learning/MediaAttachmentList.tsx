import { useState } from 'react';
import { DownloadIcon, FileAudioIcon, FileImageIcon, FileTextIcon, FileVideoIcon } from 'lucide-react';
import { describeMediaFile, isAudioMedia, type LearningMediaKind } from '../../lib/learningMediaKinds';

const icons: Record<LearningMediaKind, typeof FileTextIcon> = { document: FileTextIcon, image: FileImageIcon, video: FileVideoIcon, audio: FileAudioIcon };

/** An inline lesson image that degrades to a clear message when the browser cannot load it. */
export function InlineLessonImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <p role="status" className="rounded-md border border-dashed border-line bg-sunken/40 p-3 text-xs text-ink-muted">This image could not be displayed{alt ? `: ${alt}` : ''}.</p>;
  return <img src={src} alt={alt} onError={() => setBroken(true)} className="max-h-96 max-w-full rounded-md object-contain" />;
}

/** Attached lesson files as cards: type icon, file name (the link), a plain type label, and in-page image/video/audio preview where the browser can show it. */
export function MediaAttachmentList({ items }: { items: Array<{ id: string; url: string; filename: string }> }) {
  if (!items.length) return null;
  return <ul aria-label="Learning material attachments" className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
    {items.map((item) => {
      const { kind, label } = describeMediaFile(item.filename);
      const Icon = icons[kind];
      return <li key={item.id} className="min-w-0 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <a className="block truncate font-medium text-accent-ink underline" href={item.url} target="_blank" rel="noreferrer" download={item.filename} title={item.filename}>{item.filename}</a>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted"><DownloadIcon aria-hidden="true" className="h-3 w-3" />{label} · opens or downloads</p>
          </div>
        </div>
        {kind === 'image' && <InlineLessonImage src={item.url} alt={`Preview of ${item.filename}`} />}
        {kind === 'video' && <video controls playsInline preload="metadata" className="mt-3 max-h-80 w-full rounded-md bg-black" src={item.url} aria-label={`Video: ${item.filename}`} />}
        {(kind === 'audio' || isAudioMedia(item.filename)) && <audio controls preload="none" className="mt-3 w-full" src={item.url} aria-label={`Audio: ${item.filename}`} />}
      </li>;
    })}
  </ul>;
}
