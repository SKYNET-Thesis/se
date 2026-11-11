import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  FilmIcon,
  SaveIcon,
  Trash2Icon,
  UploadCloudIcon,
  VideoIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { MediaAssetLibraryModal, type MediaAsset } from './MediaAssetLibraryModal';
import { learningMediaApi } from '../../lib/api';

export interface VideoContent {
  version: 1;
  videoMediaId: string;
  description?: string;
  durationSeconds?: number;
}

export interface VideoLessonEditorProps {
  activity: {
    id: string;
    title: string;
    required: boolean;
    status?: 'draft' | 'published';
    content?: Record<string, unknown>;
  };
  courseId: string;
  token: string;
  onChange: (patch: { title: string; required: boolean; content: Record<string, unknown> }) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDirty: boolean;
  disabled?: boolean;
  error?: string | null;
}

const parseVideoContent = (raw?: Record<string, unknown>): VideoContent => ({
  version: 1,
  videoMediaId: typeof raw?.videoMediaId === 'string' ? raw.videoMediaId : '',
  description: typeof raw?.description === 'string' ? raw.description : '',
  durationSeconds: typeof raw?.durationSeconds === 'number' ? raw.durationSeconds : undefined,
});

export function VideoLessonEditor({
  activity,
  courseId,
  token,
  onChange,
  onSave,
  onCancel,
  isSaving,
  isDirty,
  disabled = false,
  error,
}: VideoLessonEditorProps) {
  const [title, setTitle] = useState(activity.title);
  const [required, setRequired] = useState(activity.required);
  const [content, setContent] = useState<VideoContent>(() => parseVideoContent(activity.content));
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    setTitle(activity.title);
    setRequired(activity.required);
    setContent(parseVideoContent(activity.content));
  }, [activity.id]);

  const updateContent = (patch: Partial<VideoContent>) => {
    const nextContent: VideoContent = { ...content, ...patch };
    setContent(nextContent);
    onChange({ title, required, content: nextContent as unknown as Record<string, unknown> });
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    onChange({ title: nextTitle, required, content: content as unknown as Record<string, unknown> });
  };

  const handleRequiredChange = (nextRequired: boolean) => {
    setRequired(nextRequired);
    onChange({ title, required: nextRequired, content: content as unknown as Record<string, unknown> });
  };

  // Author signed URL for the selected video media
  const videoUrlQuery = useQuery({
    queryKey: ['learning-media-author-url', content.videoMediaId],
    queryFn: () => learningMediaApi.authorUrl(content.videoMediaId, token),
    enabled: Boolean(token && content.videoMediaId),
    staleTime: 60_000,
  });

  const handleSelectAsset = (asset: MediaAsset) => {
    updateContent({ videoMediaId: asset.id });
    setLibraryOpen(false);
  };

  const removeVideo = () => {
    updateContent({ videoMediaId: '' });
  };

  const minutes = content.durationSeconds ? Math.floor(content.durationSeconds / 60) : '';
  const seconds = content.durationSeconds ? content.durationSeconds % 60 : '';

  const handleDurationChange = (nextMin: string, nextSec: string) => {
    const minVal = parseInt(nextMin, 10);
    const secVal = parseInt(nextSec, 10);
    const total = (isNaN(minVal) ? 0 : minVal * 60) + (isNaN(secVal) ? 0 : secVal);
    updateContent({ durationSeconds: total > 0 ? total : undefined });
  };

  return (
    <div className="space-y-6" data-testid="video-lesson-editor">
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        {/* Header Bar */}
        <div className="border-b border-line bg-sunken/30 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <VideoIcon className="h-5 w-5 text-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Video Lesson Authoring
            </span>
          </div>
          <Badge tone={activity.status === 'published' ? 'ok' : 'neutral'}>
            {activity.status ?? 'draft'}
          </Badge>
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {/* Activity Title Input */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="video-activity-title" className="sr-only">
                Video Lesson Title
              </label>
              <input
                id="video-activity-title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Video Title (e.g. Introduction to Arm Kinematics)"
                className="w-full text-2xl font-bold tracking-tight text-ink bg-transparent outline-none border-b border-line focus:border-accent pb-1"
                required
                disabled={disabled}
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => handleRequiredChange(e.target.checked)}
                disabled={disabled}
                className="rounded border-line-strong text-accent focus:ring-accent"
              />
              <span>Required lesson</span>
            </label>
          </div>

          {/* Video Player / Upload Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
              <FilmIcon className="h-4 w-4 text-accent" />
              <span>Video File from Learning Media</span>
            </h4>

            {content.videoMediaId ? (
              <div className="rounded-xl border border-line bg-black/5 dark:bg-black/40 p-4 space-y-4">
                {videoUrlQuery.data?.url ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    src={videoUrlQuery.data.url}
                    className="w-full max-h-[440px] rounded-lg bg-black object-contain shadow-sm"
                    aria-label="Video lesson preview player"
                  />
                ) : videoUrlQuery.isLoading ? (
                  <div className="h-64 rounded-lg bg-sunken/40 flex items-center justify-center text-xs text-ink-muted">
                    Loading video stream from secure storage…
                  </div>
                ) : (
                  <div className="h-48 rounded-lg border border-danger/30 bg-danger-soft/20 flex items-center justify-center text-xs text-danger">
                    Could not load video source ({content.videoMediaId}).
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">
                      {videoUrlQuery.data?.filename ?? content.videoMediaId}
                    </p>
                    <p className="text-2xs text-ink-muted">
                      Source: Private Course S3 Media Bucket · Ready
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLibraryOpen(true)}
                      disabled={disabled}
                    >
                      Change Video
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={removeVideo}
                      disabled={disabled}
                      className="text-danger hover:bg-danger-soft"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong bg-sunken/20 p-8 text-center space-y-3">
                <UploadCloudIcon className="h-10 w-10 text-ink-subtle mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-ink">No video attached to this lesson yet</p>
                  <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                    Upload an MP4, WebM, or MOV video to course media, or select an existing video file.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<VideoIcon className="h-4 w-4" />}
                  onClick={() => setLibraryOpen(true)}
                  disabled={disabled}
                >
                  Select Video from Library
                </Button>
              </div>
            )}
          </div>

          {/* Description & Duration */}
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="video-description" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Lesson Description &amp; Supplementary Notes
              </label>
              <textarea
                id="video-description"
                rows={4}
                value={content.description ?? ''}
                onChange={(e) => updateContent({ description: e.target.value })}
                placeholder="Briefly describe what students will learn in this video..."
                className="w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                maxLength={10000}
                disabled={disabled}
              />
              <p className="text-2xs text-ink-subtle">
                {(content.description ?? '').length} / 10,000 characters
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <ClockIcon className="h-3.5 w-3.5 text-accent" />
                <span>Estimated Duration</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={minutes}
                    onChange={(e) => handleDurationChange(e.target.value, String(seconds))}
                    placeholder="Min"
                    className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    disabled={disabled}
                  />
                  <span className="text-2xs text-ink-subtle mt-0.5 block">Minutes</span>
                </div>
                <span className="text-sm font-bold text-ink-subtle">:</span>
                <div className="w-20">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={(e) => handleDurationChange(String(minutes), e.target.value)}
                    placeholder="Sec"
                    className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    disabled={disabled}
                  />
                  <span className="text-2xs text-ink-subtle mt-0.5 block">Seconds</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div role="alert" className="border-t border-danger/20 bg-danger-soft p-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions & Save State Bar */}
        <div className="border-t border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {isSaving ? (
              <span className="flex items-center gap-1.5 text-accent font-medium">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <span>Saving video lesson…</span>
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-1.5 text-warn font-medium">
                <AlertCircleIcon className="h-3.5 w-3.5 text-warn" />
                <span>Unsaved changes</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-ok font-medium">
                <CheckCircle2Icon className="h-3.5 w-3.5 text-ok" />
                <span>Saved</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel} disabled={disabled || isSaving}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<SaveIcon className="h-3.5 w-3.5" />}
              onClick={onSave}
              disabled={disabled || !title.trim() || isSaving}
              loading={isSaving}
            >
              Save Draft
            </Button>
          </div>
        </div>
      </div>

      {/* Media Asset Library Modal */}
      <MediaAssetLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        courseId={courseId}
        token={token}
        selectionMode
        initialKind="video"
        onSelectAsset={handleSelectAsset}
      />
    </div>
  );
}
