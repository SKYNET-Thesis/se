import { useState } from 'react';
import {
  BotIcon,
  EyeIcon,
  FileTextIcon,
  FilmIcon,
  FolderOpenIcon,
  VideoIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { MediaAssetLibraryModal, type MediaAsset } from './MediaAssetLibraryModal';
import { CURRICULUM_BLOCK_REGISTRY } from '../studio/curriculumToolbox';

type ActivityContentRef =
  | { kind: 'lesson_content'; key: string }
  | { kind: 'assignment'; id: string }
  | { kind: 'none' };

export interface ActivityContentEditorProps {
  activity: {
    id: string;
    title: string;
    type: string;
    required: boolean;
    status?: 'draft' | 'published';
    content_ref?: ActivityContentRef;
  };
  onSave: (patch: {
    title?: string;
    type?: string;
    required?: boolean;
    contentRef?: ActivityContentRef;
    metadata?: Record<string, unknown>;
  }) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function ActivityContentEditor({
  activity,
  onSave,
  disabled = false,
  isLoading = false,
}: ActivityContentEditorProps) {
  const [title, setTitle] = useState(activity.title);
  const [required, setRequired] = useState(activity.required);
  const [contentKind, setContentKind] = useState<string>(activity.content_ref?.kind ?? 'lesson_content');
  const [contentKey, setContentKey] = useState(
    activity.content_ref?.kind === 'lesson_content' ? activity.content_ref.key : 'summary'
  );
  const [assignmentId, setAssignmentId] = useState(
    activity.content_ref?.kind === 'assignment' ? activity.content_ref.id : ''
  );

  // Rich media states
  const [videoDuration, setVideoDuration] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [readingText, setReadingText] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([
    'arm.select',
    'home',
    'preview.move_xyz',
    'gripper.open',
    'gripper.close',
  ]);
  const [previewMode, setPreviewMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleSave = () => {
    let contentRef: ActivityContentRef = { kind: 'none' };
    if (contentKind === 'lesson_content') {
      contentRef = { kind: 'lesson_content', key: contentKey || 'summary' };
    } else if (contentKind === 'assignment') {
      contentRef = { kind: 'assignment', id: assignmentId };
    }
    onSave({
      title: title.trim(),
      required,
      contentRef,
    });
  };

  const onSelectMedia = (asset: MediaAsset) => {
    if (asset.type === 'video') {
      setVideoUrl(asset.url);
    } else if (asset.type === 'document') {
      setReadingText(
        `# ${asset.name}\n\nReference Material: ${asset.description}\n\nResource Link: ${asset.url}`
      );
    }
  };

  return (
    <div className="space-y-6" data-testid="activity-content-editor">
      {/* Editor Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
              {activity.type.replace('_', ' ')} Editor
            </span>
            <Badge tone={activity.status === 'published' ? 'ok' : 'neutral'} dot>
              {activity.status ?? 'draft'}
            </Badge>
          </div>
          <h3 className="text-xl font-bold text-ink mt-1">{title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<EyeIcon className="h-4 w-4" />}
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? 'Edit Mode' : 'Preview'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || !title.trim()}
            loading={isLoading}
            onClick={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {previewMode ? (
        /* Preview Mode */
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-ink">{title}</h4>
            <Badge tone="accent">Learner Preview</Badge>
          </div>

          {activity.type === 'video' ? (
            <div className="overflow-hidden rounded-xl bg-black aspect-video flex flex-col items-center justify-center text-center p-6 text-white">
              <FilmIcon className="h-16 w-16 text-blue-400 mb-3 opacity-80" />
              <h5 className="font-semibold text-lg">{title}</h5>
              <p className="text-xs text-zinc-400 mt-1">Duration: {videoDuration}</p>
              {videoUrl ? (
                <video className="mt-4 w-full max-w-3xl rounded-lg" controls src={videoUrl} />
              ) : (
                <span className="mt-4 text-sm text-zinc-300">Select a course media asset to preview this video.</span>
              )}
            </div>
          ) : activity.type === 'reading' ? (
            <div className="prose prose-sm max-w-none rounded-lg border border-line bg-surface p-6 space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 border-b border-line pb-2">
                <FileTextIcon className="h-4 w-4" />
                <span className="font-semibold text-xs uppercase tracking-wide">Reading Material</span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-ink leading-relaxed font-sans">
                {readingText}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-6 space-y-3">
              <div className="flex items-center gap-2 text-purple-600">
                <BotIcon className="h-5 w-5" />
                <span className="font-semibold text-sm">Robot Activity Specification</span>
              </div>
              <p className="text-xs text-ink-muted">
                Requires Blockly program submission. Qualified executions will run through deterministic symbolic evaluation.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {selectedBlocks.map((b) => (
                  <span key={b} className="rounded bg-purple-500/10 px-2 py-0.5 text-2xs font-mono text-purple-700 dark:text-purple-300">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Edit Form */
        <div className="space-y-5">
          {/* Title and Required */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                Activity Title
              </label>
              <input
                type="text"
                value={title}
                disabled={disabled}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Coordinate Frame Transformations"
                className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                aria-label="Activity title"
              />
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer h-10">
                <input
                  type="checkbox"
                  checked={required}
                  disabled={disabled}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="rounded border-line-strong text-accent focus:ring-accent"
                  aria-label="Required"
                />
                <span className="font-medium text-xs">Required for Completion</span>
              </label>
            </div>
          </div>

          {/* Activity Specific Fields */}
          {activity.type === 'video' && (
            <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <VideoIcon className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-bold text-ink">Video Configuration</h4>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FolderOpenIcon className="h-3.5 w-3.5" />}
                  onClick={() => setLibraryOpen(true)}
                >
                  Select from Asset Library
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Selected private media URL
                  </label>
                  <input
                    type="text"
                    value={videoUrl}
                    disabled={disabled}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
                    placeholder="Select a video from the course media library"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Estimated Duration
                  </label>
                  <input
                    type="text"
                    value={videoDuration}
                    disabled={disabled}
                    onChange={(e) => setVideoDuration(e.target.value)}
                    className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
                    placeholder="e.g. 10:45"
                  />
                </div>
              </div>
            </div>
          )}

          {activity.type === 'reading' && (
            <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <FileTextIcon className="h-4 w-4 text-emerald-500" />
                  <h4 className="text-sm font-bold text-ink">Reading Content &amp; Resources</h4>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FolderOpenIcon className="h-3.5 w-3.5" />}
                  onClick={() => setLibraryOpen(true)}
                >
                  Attach from Library
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  Article &amp; Lecture Summary (Markdown Supported)
                </label>
                <textarea
                  rows={8}
                  value={readingText}
                  disabled={disabled}
                  onChange={(e) => setReadingText(e.target.value)}
                  className="w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none font-mono text-xs focus:border-accent"
                  placeholder="Enter reading content or documentation..."
                />
              </div>
            </div>
          )}

          {(activity.type === 'guided_practice' ||
            activity.type === 'simulation' ||
            activity.type === 'challenge' ||
            activity.type === 'physical_lab') && (
            <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <BotIcon className="h-4 w-4 text-purple-500" />
                <h4 className="text-sm font-bold text-ink">Robotics Challenge &amp; Blocks Specification</h4>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  Permitted Blockly Capability Blocks
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.keys(CURRICULUM_BLOCK_REGISTRY).map((blockKey) => {
                    const isSelected = selectedBlocks.includes(blockKey);
                    return (
                      <label
                        key={blockKey}
                        className={`flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent-soft/30 font-medium'
                            : 'border-line hover:bg-sunken/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBlocks([...selectedBlocks, blockKey]);
                            } else {
                              setSelectedBlocks(selectedBlocks.filter((k) => k !== blockKey));
                            }
                          }}
                          className="rounded border-line-strong text-accent focus:ring-accent"
                        />
                        <span className="font-mono text-2xs truncate">{blockKey}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Canonical Content Reference Settings (Preserves Backend Architecture) */}
          <div className="rounded-xl border border-line bg-sunken/30 p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Canonical Content Reference
            </span>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs text-ink-muted">Reference Kind</label>
                <select
                  value={contentKind}
                  disabled={disabled}
                  onChange={(e) => setContentKind(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-surface px-2.5 text-xs text-ink outline-none focus:border-accent"
                  aria-label="Content reference kind"
                >
                  <option value="lesson_content">lesson_content</option>
                  <option value="assignment">assignment</option>
                  <option value="none">none</option>
                </select>
              </div>

              {contentKind === 'lesson_content' ? (
                <div className="space-y-1">
                  <label className="block text-xs text-ink-muted">Lesson Content Key</label>
                  <input
                    type="text"
                    value={contentKey}
                    disabled={disabled}
                    onChange={(e) => setContentKey(e.target.value)}
                    className="h-9 w-full rounded border border-line bg-surface px-2.5 text-xs text-ink outline-none focus:border-accent"
                    placeholder="summary"
                    aria-label="Lesson content key"
                  />
                </div>
              ) : contentKind === 'assignment' ? (
                <div className="space-y-1">
                  <label className="block text-xs text-ink-muted">Assignment ID (UUID)</label>
                  <input
                    type="text"
                    value={assignmentId}
                    disabled={disabled}
                    onChange={(e) => setAssignmentId(e.target.value)}
                    className="h-9 w-full rounded border border-line bg-surface px-2.5 text-xs text-ink outline-none focus:border-accent"
                    placeholder="UUID"
                    aria-label="Assignment ID"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Asset Library Picker Dialog */}
      <MediaAssetLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        courseId=""
        token=""
        selectionMode={true}
        onSelectAsset={onSelectMedia}
      />
    </div>
  );
}
