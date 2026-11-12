import { useCallback, useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  BoldIcon,
  CheckCircle2Icon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PaperclipIcon,
  RedoIcon,
  SaveIcon,
  TableIcon,
  Trash2Icon,
  UnderlineIcon,
  UndoIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { MediaAssetLibraryModal, type MediaAsset } from './MediaAssetLibraryModal';
import { isAudioMedia } from '../../lib/learningMediaKinds';
import { learningMediaApi } from '../../lib/api';

export type ReadingBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'numbered_list'; items: string[] }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; mediaId: string; alt: string };

export interface ReadingContent {
  version: 1;
  blocks: ReadingBlock[];
  mediaIds?: string[];
}

export interface ReadingDocumentEditorProps {
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

const parseContent = (raw?: Record<string, unknown>): ReadingContent => {
  const blocks: ReadingBlock[] = Array.isArray(raw?.blocks)
    ? (raw.blocks as ReadingBlock[]).filter((b) => b && typeof b === 'object' && typeof b.type === 'string')
    : [];
  const mediaIds: string[] = Array.isArray(raw?.mediaIds)
    ? (raw.mediaIds as string[]).filter((id): id is string => typeof id === 'string')
    : [];
  return { version: 1, blocks, mediaIds };
};

/** Formats inline text with basic Markdown/HTML tokens (bold, italic, underline) into safe React nodes. */
export function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;
  // Splits text by bold (**...**), italic (*...*), and underline (<u>...</u>)
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>.*?<\/u>)/g;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={index} className="italic text-ink">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('<u>') && part.endsWith('</u>') && part.length >= 7) {
      return <u key={index} className="underline text-ink">{part.slice(3, -4)}</u>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function ReadingDocumentEditor({
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
}: ReadingDocumentEditorProps) {
  const [title, setTitle] = useState(activity.title);
  const [required, setRequired] = useState(activity.required);
  const [content, setContent] = useState<ReadingContent>(() => parseContent(activity.content));
  const [history, setHistory] = useState<ReadingContent[]>([parseContent(activity.content)]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'image' | 'attachment'>('attachment');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ text: '', url: 'https://' });
  const [tableNoticeOpen, setTableNoticeOpen] = useState(false);

  // Sync when activity changes externally
  useEffect(() => {
    setTitle(activity.title);
    setRequired(activity.required);
    const parsed = parseContent(activity.content);
    setContent(parsed);
    setHistory([parsed]);
    setHistoryIndex(0);
    setActiveBlockIndex(parsed.blocks.length > 0 ? 0 : null);
  }, [activity.id]);

  // Push new state to history and notify parent
  const commitContent = useCallback(
    (nextContent: ReadingContent) => {
      setContent(nextContent);
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), nextContent]);
      setHistoryIndex((prev) => prev + 1);
      onChange({ title, required, content: nextContent as unknown as Record<string, unknown> });
    },
    [historyIndex, onChange, required, title],
  );

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    onChange({ title: nextTitle, required, content: content as unknown as Record<string, unknown> });
  };

  const handleRequiredChange = (nextRequired: boolean) => {
    setRequired(nextRequired);
    onChange({ title, required: nextRequired, content: content as unknown as Record<string, unknown> });
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = () => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    const previous = history[nextIndex];
    setHistoryIndex(nextIndex);
    setContent(previous);
    onChange({ title, required, content: previous as unknown as Record<string, unknown> });
  };

  const redo = () => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    const next = history[nextIndex];
    setHistoryIndex(nextIndex);
    setContent(next);
    onChange({ title, required, content: next as unknown as Record<string, unknown> });
  };

  // Queries for images and attachments
  const mediaIds = Array.from(
    new Set([
      ...(content.mediaIds ?? []),
      ...content.blocks.filter((b): b is Extract<ReadingBlock, { type: 'image' }> => b.type === 'image').map((b) => b.mediaId),
    ]),
  );

  const mediaQueries = useQueries({
    queries: mediaIds.map((id) => ({
      queryKey: ['learning-media-author-url', id],
      queryFn: () => learningMediaApi.authorUrl(id, token),
      enabled: Boolean(token && id),
      staleTime: 60_000,
    })),
  });

  const mediaUrls = Object.fromEntries(
    mediaIds.flatMap((id, index) => {
      const data = mediaQueries[index]?.data;
      return data?.url ? [[id, { url: data.url, filename: data.filename ?? 'Learning Asset' }]] : [];
    }),
  );

  // Formatting operations
  const applyInlineFormatting = (wrapperPrefix: string, wrapperSuffix: string) => {
    if (activeBlockIndex === null) return;
    const block = content.blocks[activeBlockIndex];
    if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return;

    const textarea = document.getElementById(`block-editor-${activeBlockIndex}`) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = block.text;

    let nextText: string;
    if (start === end) {
      nextText = `${text.slice(0, start)}${wrapperPrefix}formatted text${wrapperSuffix}${text.slice(end)}`;
    } else {
      const selected = text.slice(start, end);
      nextText = `${text.slice(0, start)}${wrapperPrefix}${selected}${wrapperSuffix}${text.slice(end)}`;
    }

    const nextBlocks = content.blocks.map((b, i) => (i === activeBlockIndex ? { ...b, text: nextText } : b));
    commitContent({ ...content, blocks: nextBlocks });
  };

  const addBlock = (block: ReadingBlock) => {
    const nextBlocks = [...content.blocks, block];
    commitContent({ ...content, blocks: nextBlocks });
    setActiveBlockIndex(nextBlocks.length - 1);
  };

  const updateBlockText = (index: number, text: string) => {
    const nextBlocks = content.blocks.map((b, i) => (i === index ? { ...b, text } : b));
    commitContent({ ...content, blocks: nextBlocks });
  };

  const updateListItems = (blockIndex: number, items: string[]) => {
    const nextBlocks = content.blocks.map((b, i) => (i === blockIndex ? { ...b, items } : b));
    commitContent({ ...content, blocks: nextBlocks });
  };

  const removeBlock = (index: number) => {
    const target = content.blocks[index];
    let nextMediaIds = content.mediaIds ?? [];
    if (target?.type === 'image') {
      const remainingImageIds = content.blocks
        .filter((b, i): b is Extract<ReadingBlock, { type: 'image' }> => i !== index && b.type === 'image')
        .map((b) => b.mediaId);
      if (!remainingImageIds.includes(target.mediaId)) {
        nextMediaIds = nextMediaIds.filter((id) => id !== target.mediaId);
      }
    }
    const nextBlocks = content.blocks.filter((_, i) => i !== index);
    commitContent({ ...content, blocks: nextBlocks, mediaIds: nextMediaIds });
    setActiveBlockIndex(nextBlocks.length > 0 ? Math.min(index, nextBlocks.length - 1) : null);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= content.blocks.length) return;
    const nextBlocks = [...content.blocks];
    [nextBlocks[index], nextBlocks[target]] = [nextBlocks[target], nextBlocks[index]];
    commitContent({ ...content, blocks: nextBlocks });
    setActiveBlockIndex(target);
  };

  const handleSelectMedia = (asset: MediaAsset) => {
    if (mediaMode === 'image') {
      const currentMediaIds = content.mediaIds ?? [];
      const nextMediaIds = currentMediaIds.includes(asset.id) ? currentMediaIds : [...currentMediaIds, asset.id];
      const imageBlock: ReadingBlock = { type: 'image', mediaId: asset.id, alt: asset.name };
      commitContent({
        ...content,
        blocks: [...content.blocks, imageBlock],
        mediaIds: nextMediaIds,
      });
      setActiveBlockIndex(content.blocks.length);
    } else {
      const currentIds = content.mediaIds ?? [];
      if (!currentIds.includes(asset.id)) {
        commitContent({ ...content, mediaIds: [...currentIds, asset.id] });
      }
    }
    setLibraryOpen(false);
  };

  const removeAttachment = (idToRemove: string) => {
    const nextMediaIds = (content.mediaIds ?? []).filter((id) => id !== idToRemove);
    const nextBlocks = content.blocks.filter((b) => b.type !== 'image' || b.mediaId !== idToRemove);
    commitContent({ ...content, mediaIds: nextMediaIds, blocks: nextBlocks });
  };

  const submitLink = () => {
    if (!linkDraft.text.trim() || !linkDraft.url.trim()) return;
    let url = linkDraft.url.trim();
    if (!url.startsWith('https://')) {
      url = `https://${url.replace(/^http:\/\//, '')}`;
    }
    addBlock({ type: 'link', text: linkDraft.text.trim(), url });
    setLinkDraft({ text: '', url: 'https://' });
    setLinkModalOpen(false);
  };

  return (
    <div className="space-y-6" data-testid="reading-document-editor">
      {/* Document Workspace Card */}
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        {/* Sticky Word-like Toolbar (Coursera / Image 4 Reference) */}
        <div className="sticky top-0 z-10 border-b border-line bg-sunken/40 px-3 py-2 flex flex-wrap items-center gap-1.5 backdrop-blur">
          {/* History Controls */}
          <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo || disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink disabled:opacity-40"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <UndoIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo || disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink disabled:opacity-40"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <RedoIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Heading & Paragraph Inserts */}
          <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
            <button
              type="button"
              onClick={() => addBlock({ type: 'heading', text: 'New Heading' })}
              disabled={disabled}
              className="px-2 py-1 rounded text-xs font-semibold hover:bg-surface text-ink-muted hover:text-ink flex items-center gap-1"
              title="Insert Heading 1"
              aria-label="Insert Heading 1"
            >
              <Heading1Icon className="h-4 w-4" />
              <span>H1</span>
            </button>
            <button
              type="button"
              onClick={() => addBlock({ type: 'heading', text: 'Section Heading' })}
              disabled={disabled}
              className="px-2 py-1 rounded text-xs font-semibold hover:bg-surface text-ink-muted hover:text-ink flex items-center gap-1"
              title="Insert Heading 2"
              aria-label="Insert Heading 2"
            >
              <Heading2Icon className="h-4 w-4" />
              <span>H2</span>
            </button>
            <button
              type="button"
              onClick={() => addBlock({ type: 'paragraph', text: '' })}
              disabled={disabled}
              className="px-2 py-1 rounded text-xs font-medium hover:bg-surface text-ink-muted hover:text-ink flex items-center gap-1"
              title="Insert Paragraph"
              aria-label="Insert Paragraph"
            >
              <FileTextIcon className="h-4 w-4" />
              <span>P</span>
            </button>
          </div>

          {/* Inline Text Formatting (Bold, Italic, Underline) */}
          <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
            <button
              type="button"
              onClick={() => applyInlineFormatting('**', '**')}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink font-bold hover:text-accent-ink"
              title="Bold (**text**)"
              aria-label="Bold text"
            >
              <BoldIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => applyInlineFormatting('*', '*')}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink italic hover:text-accent-ink"
              title="Italic (*text*)"
              aria-label="Italic text"
            >
              <ItalicIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => applyInlineFormatting('<u>', '</u>')}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink underline hover:text-accent-ink"
              title="Underline (<u>text</u>)"
              aria-label="Underline text"
            >
              <UnderlineIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
            <button
              type="button"
              onClick={() => addBlock({ type: 'bullet_list', items: ['First list item'] })}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink"
              title="Bullet List"
              aria-label="Insert Bullet List"
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => addBlock({ type: 'numbered_list', items: ['Step 1'] })}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink"
              title="Numbered List"
              aria-label="Insert Numbered List"
            >
              <ListOrderedIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Links, Media & Table */}
          <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink"
              title="Insert Link"
              aria-label="Insert Link"
            >
              <LinkIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaMode('image');
                setLibraryOpen(true);
              }}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink"
              title="Insert Image from Learning Media"
              aria-label="Insert Image"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaMode('attachment');
                setLibraryOpen(true);
              }}
              disabled={disabled}
              className="px-2 py-1 rounded text-xs font-medium hover:bg-surface text-ink-muted hover:text-ink flex items-center gap-1"
              title="Attach Document (PDF, DOCX, PPTX)"
              aria-label="Attach Document"
            >
              <PaperclipIcon className="h-4 w-4" />
              <span>Attach</span>
            </button>
            <button
              type="button"
              onClick={() => setTableNoticeOpen(true)}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-surface text-ink-muted hover:text-ink"
              title="Table Guide"
              aria-label="Insert Table"
            >
              <TableIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Switcher (Visual vs Preview) */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode((prev) => !prev)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                previewMode ? 'bg-accent text-white' : 'bg-surface hover:bg-sunken text-ink border border-line'
              }`}
              aria-label={previewMode ? 'Switch to Editor' : 'Switch to Live Preview'}
            >
              {previewMode ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
              <span>{previewMode ? 'Edit Mode' : 'Live Preview'}</span>
            </button>
          </div>
        </div>

        {/* Document Metadata Fields */}
        <div className="px-6 sm:px-10 pt-6 pb-2 border-b border-line bg-sunken/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="reading-activity-title" className="sr-only">
                Activity Title
              </label>
              <input
                id="reading-activity-title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Reading Title (e.g. What is Robotics?)"
                className="w-full text-2xl font-bold tracking-tight text-ink bg-transparent outline-none border-b border-transparent focus:border-accent pb-1"
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
              <span>Required reading</span>
            </label>
          </div>
        </div>

        {/* Document Editor Canvas */}
        <div className="p-6 sm:p-10 min-h-[420px] bg-surface">
          {previewMode ? (
            /* Live Formatted Learner Preview */
            <article className="prose prose-slate max-w-none space-y-4">
              <h1 className="text-2xl font-bold text-ink tracking-tight">{title || 'Untitled Reading'}</h1>
              {content.blocks.length === 0 ? (
                <p className="text-sm italic text-ink-muted">No content added to this reading activity yet.</p>
              ) : (
                content.blocks.map((block, idx) => {
                  if (block.type === 'heading') {
                    return (
                      <h2 key={idx} className="text-xl font-bold text-ink mt-6 mb-2">
                        {renderFormattedText(block.text)}
                      </h2>
                    );
                  }
                  if (block.type === 'paragraph') {
                    return (
                      <p key={idx} className="text-base leading-relaxed text-ink/90 whitespace-pre-wrap">
                        {renderFormattedText(block.text)}
                      </p>
                    );
                  }
                  if (block.type === 'link') {
                    return (
                      <p key={idx} className="my-2">
                        <a
                          href={block.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-ink hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>{block.text}</span>
                          <span className="text-xs text-ink-subtle">↗</span>
                        </a>
                      </p>
                    );
                  }
                  if (block.type === 'image') {
                    const media = mediaUrls[block.mediaId];
                    return (
                      <figure key={idx} className="my-4">
                        {media?.url ? (
                          <img
                            src={media.url}
                            alt={block.alt || 'Learning image'}
                            className="max-h-96 w-auto rounded-lg border border-line object-contain"
                          />
                        ) : (
                          <div className="h-48 rounded-lg border border-dashed border-line flex items-center justify-center text-xs text-ink-muted">
                            Loading image from secure storage…
                          </div>
                        )}
                        {block.alt && <figcaption className="mt-1 text-xs text-ink-muted">{block.alt}</figcaption>}
                      </figure>
                    );
                  }
                  if (block.type === 'bullet_list') {
                    return (
                      <ul key={idx} className="list-disc pl-6 space-y-1 text-ink/90">
                        {block.items.map((item, itemIdx) => (
                          <li key={itemIdx}>{renderFormattedText(item)}</li>
                        ))}
                      </ul>
                    );
                  }
                  if (block.type === 'numbered_list') {
                    return (
                      <ol key={idx} className="list-decimal pl-6 space-y-1 text-ink/90">
                        {block.items.map((item, itemIdx) => (
                          <li key={itemIdx}>{renderFormattedText(item)}</li>
                        ))}
                      </ol>
                    );
                  }
                  return null;
                })
              )}
            </article>
          ) : (
            /* Visual Authoring Canvas (Blocks) */
            <div className="space-y-4">
              {content.blocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-10 text-center space-y-3">
                  <FileTextIcon className="h-8 w-8 text-ink-subtle mx-auto" />
                  <div>
                    <p className="font-semibold text-ink">Write your lesson content here...</p>
                    <p className="text-xs text-ink-muted mt-1">
                      Add headings, paragraphs, bullet lists, links, images, or document attachments.
                    </p>
                  </div>
                  <div className="flex justify-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => addBlock({ type: 'heading', text: title || 'Introduction' })}
                    >
                      + Add Heading
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => addBlock({ type: 'paragraph', text: '' })}
                    >
                      + Add Paragraph
                    </Button>
                  </div>
                </div>
              ) : (
                content.blocks.map((block, index) => {
                  const isActive = activeBlockIndex === index;
                  return (
                    <div
                      key={index}
                      onClick={() => setActiveBlockIndex(index)}
                      className={`group relative rounded-lg border transition-all p-3 sm:p-4 ${
                        isActive
                          ? 'border-accent/40 bg-accent-soft/10 shadow-sm'
                          : 'border-transparent hover:border-line hover:bg-sunken/20'
                      }`}
                    >
                      {/* Block Controls Header */}
                      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-line/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">
                          {block.type.replace('_', ' ')} · Block {index + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(index, -1);
                            }}
                            disabled={index === 0}
                            className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30"
                            title="Move Up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(index, 1);
                            }}
                            disabled={index === content.blocks.length - 1}
                            className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30"
                            title="Move Down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBlock(index);
                            }}
                            className="p-1 rounded text-danger hover:bg-danger-soft/50"
                            title="Delete Block"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Block Content Editor */}
                      {block.type === 'heading' && (
                        <input
                          id={`block-editor-${index}`}
                          type="text"
                          value={block.text}
                          onChange={(e) => updateBlockText(index, e.target.value)}
                          placeholder="Heading text..."
                          className="w-full text-lg font-bold text-ink bg-transparent outline-none"
                          aria-label={`Heading ${index + 1}`}
                        />
                      )}

                      {block.type === 'paragraph' && (
                        <textarea
                          id={`block-editor-${index}`}
                          rows={3}
                          value={block.text}
                          onChange={(e) => updateBlockText(index, e.target.value)}
                          placeholder="Write your lesson paragraph here... (Use toolbar to format bold, italic, underline)"
                          className="w-full text-sm leading-relaxed text-ink bg-transparent outline-none resize-y"
                          aria-label={`Paragraph ${index + 1}`}
                        />
                      )}

                      {block.type === 'link' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <LinkIcon className="h-4 w-4 text-accent shrink-0" />
                            <input
                              type="text"
                              value={block.text}
                              onChange={(e) => {
                                const nextBlocks = content.blocks.map((b, i) =>
                                  i === index && b.type === 'link' ? { ...b, text: e.target.value } : b,
                                );
                                commitContent({ ...content, blocks: nextBlocks });
                              }}
                              placeholder="Link label"
                              className="text-sm font-medium text-ink bg-transparent outline-none flex-1 border-b border-line"
                              aria-label={`Link text ${index + 1}`}
                            />
                          </div>
                          <input
                            type="url"
                            value={block.url}
                            onChange={(e) => {
                              const nextBlocks = content.blocks.map((b, i) =>
                                i === index && b.type === 'link' ? { ...b, url: e.target.value } : b,
                              );
                              commitContent({ ...content, blocks: nextBlocks });
                            }}
                            placeholder="https://example.com"
                            className="text-xs text-ink-muted bg-transparent outline-none w-full"
                            aria-label={`HTTPS link ${index + 1}`}
                          />
                        </div>
                      )}

                      {block.type === 'image' && (
                        <div className="space-y-3">
                          {mediaUrls[block.mediaId]?.url ? (
                            <img
                              src={mediaUrls[block.mediaId].url}
                              alt={block.alt}
                              className="max-h-80 w-auto rounded-lg border border-line object-contain"
                            />
                          ) : (
                            <div className="p-4 rounded-lg bg-sunken/40 text-xs text-ink-muted">
                              Loading image #{block.mediaId}…
                            </div>
                          )}
                          <label className="block text-xs text-ink-muted">
                            Image caption / alternative text:
                            <input
                              type="text"
                              value={block.alt}
                              onChange={(e) => {
                                const nextBlocks = content.blocks.map((b, i) =>
                                  i === index && b.type === 'image' ? { ...b, alt: e.target.value } : b,
                                );
                                commitContent({ ...content, blocks: nextBlocks });
                              }}
                              className="mt-1 w-full rounded border border-line bg-surface px-2.5 py-1 text-xs text-ink outline-none"
                              aria-label={`Image alternative text ${index + 1}`}
                            />
                          </label>
                        </div>
                      )}

                      {(block.type === 'bullet_list' || block.type === 'numbered_list') && (
                        <div className="space-y-2">
                          {block.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                              <span className="text-xs text-ink-subtle shrink-0">
                                {block.type === 'bullet_list' ? '•' : `${itemIdx + 1}.`}
                              </span>
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => {
                                  const nextItems = [...block.items];
                                  nextItems[itemIdx] = e.target.value;
                                  updateListItems(index, nextItems);
                                }}
                                className="flex-1 text-sm text-ink bg-transparent outline-none border-b border-transparent focus:border-line"
                                placeholder="List item..."
                                aria-label={`${block.type} item ${itemIdx + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextItems = block.items.filter((_, i) => i !== itemIdx);
                                  updateListItems(index, nextItems.length > 0 ? nextItems : ['']);
                                }}
                                className="text-ink-subtle hover:text-danger p-1"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateListItems(index, [...block.items, ''])}
                            className="text-xs text-accent-ink font-medium hover:underline pt-1"
                          >
                            + Add item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Document Attachments Section (PDF, DOCX, PPTX) */}
        <div className="border-t border-line bg-sunken/20 p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Attached Learning Materials (PDF, DOCX, PPTX, Images, MP3 audio)
              </h4>
              <p className="text-2xs text-ink-subtle mt-0.5">
                Students will be able to download and reference these files alongside the reading.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<PaperclipIcon className="h-3.5 w-3.5" />}
              onClick={() => {
                setMediaMode('attachment');
                setLibraryOpen(true);
              }}
              disabled={disabled}
            >
              + Attach Document from Library
            </Button>
          </div>

          {(content.mediaIds ?? []).length === 0 ? (
            <p className="text-xs text-ink-muted italic">No external document or media files attached.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Attached learning media">
              {(content.mediaIds ?? []).map((id) => {
                const media = mediaUrls[id];
                return (
                  <li
                    key={id}
                    className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg border border-line bg-surface"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTextIcon className="h-4 w-4 text-accent shrink-0" />
                      <span className="truncate text-xs font-medium text-ink">
                        {media?.filename ?? id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {media?.url && (
                        <a
                          href={media.url}
                          target="_blank"
                          rel="noreferrer"
                          download={media.filename}
                          className="p-1 rounded hover:bg-sunken text-ink-muted hover:text-ink"
                          title="Download attachment"
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(id)}
                        disabled={disabled}
                        className="p-1 rounded hover:bg-danger-soft text-danger"
                        title="Remove attachment"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {media?.url && isAudioMedia(media.filename) && (
                      <audio controls preload="none" className="w-full" src={media.url} aria-label={`Audio: ${media.filename}`} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
                <span>Saving changes…</span>
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

      {/* Insert Link Dialog */}
      {linkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-pop space-y-4">
            <h3 className="text-base font-bold text-ink">Insert HTTPS Link</h3>
            <label className="block text-xs font-medium text-ink-muted">
              Display Text
              <input
                type="text"
                value={linkDraft.text}
                onChange={(e) => setLinkDraft({ ...linkDraft, text: e.target.value })}
                placeholder="e.g. Robotics Safety Guidelines"
                className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs font-medium text-ink-muted">
              URL (must begin with https://)
              <input
                type="url"
                value={linkDraft.url}
                onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                placeholder="https://..."
                className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setLinkModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={submitLink}
                disabled={!linkDraft.text.trim() || !linkDraft.url.trim()}
              >
                Insert Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table Guideline Dialog */}
      {tableNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-pop space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <TableIcon className="h-5 w-5 text-accent" />
                <span>Table Data in Reading Activities</span>
              </h3>
              <button
                type="button"
                onClick={() => setTableNoticeOpen(false)}
                className="text-ink-muted hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              The platform content storage schema (v1) currently persists structured headings, paragraphs,
              bullet/numbered lists, inline images, and media attachments.
            </p>
            <div className="rounded-lg bg-sunken/40 p-3 text-xs space-y-1 text-ink">
              <p className="font-semibold">Recommended approaches for tabular data:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-ink-muted">
                <li>Format structured parameters as bullet or numbered lists.</li>
                <li>Attach a formatted PDF, DOCX, or Excel file using <strong>Attach Media</strong>.</li>
                <li>Insert a rendered diagram or table image using <strong>Insert Image</strong>.</li>
              </ul>
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="secondary" onClick={() => setTableNoticeOpen(false)}>
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Media Asset Library Modal for Images & Attachments */}
      <MediaAssetLibraryModal
        key={mediaMode}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        courseId={courseId}
        token={token}
        selectionMode
        initialKind={mediaMode === 'image' ? 'image' : undefined}
        onSelectAsset={handleSelectMedia}
      />
    </div>
  );
}
