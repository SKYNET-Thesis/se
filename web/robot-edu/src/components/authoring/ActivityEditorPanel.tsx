import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { QuizAuthoringPanel } from './QuizAuthoringPanel';
import { MediaAssetLibraryModal, type MediaAsset } from './MediaAssetLibraryModal';
import { learningMediaApi } from '../../lib/api';
import { isAudioMedia } from '../../lib/learningMediaKinds';

type ContentRef = { kind: 'lesson_content'; key: string } | { kind: 'assignment'; id: string } | { kind: 'none' };
type ReadingBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'numbered_list'; items: string[] }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; mediaId: string; alt: string };
export type ActivityEditorDraft = { title: string; type: string; required: boolean; contentRef: ContentRef; content: Record<string, unknown> };
type ActivitySummary = { id: string; title: string; type: string; status?: string; content_ref?: ContentRef; content?: Record<string, unknown> };
type Props = { activity?: ActivitySummary; draft: ActivityEditorDraft | null; onChange: (draft: ActivityEditorDraft) => void; onEdit?: () => void; onSave: () => void; onCancel: () => void; saving: boolean; disabled?: boolean; error?: string | null; lessonId?: string; courseId?: string; token?: string };
const input = 'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function ActivityEditorPanel({ activity, draft, onChange, onEdit, onSave, onCancel, saving, disabled = false, error, lessonId, courseId = '', token = '' }: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'video' | 'attachment' | 'image'>('attachment');
  const content = draft?.content ?? activity?.content ?? {};
  const mediaIds = mediaIdsForContent(content);
  const mediaQueries = useQueries({ queries: mediaIds.map((mediaId) => ({ queryKey: ['learning-media-author-url', mediaId], queryFn: () => learningMediaApi.authorUrl(mediaId, token), enabled: Boolean(token && courseId) })) });
  const mediaUrls = Object.fromEntries(mediaIds.flatMap((id, index) => mediaQueries[index]?.data?.url ? [[id, { url: mediaQueries[index].data!.url, filename: mediaQueries[index].data!.filename ?? 'Learning material' }]] : []));
  const openLibrary = (mode: 'video' | 'attachment' | 'image') => { setMediaMode(mode); setLibraryOpen(true); };
  const selectMedia = (asset: MediaAsset) => {
    if (!draft) return;
    if (mediaMode === 'video') onChange({ ...draft, content: { version: 1, videoMediaId: asset.id, description: typeof draft.content.description === 'string' ? draft.content.description : '' } });
    else {
      const currentIds = Array.isArray(draft.content.mediaIds) ? draft.content.mediaIds.filter((id): id is string => typeof id === 'string') : [];
      const nextIds = currentIds.includes(asset.id) ? currentIds : [...currentIds, asset.id];
      const blocks = Array.isArray(draft.content.blocks) ? draft.content.blocks as ReadingBlock[] : [];
      onChange({ ...draft, content: { version: 1, mediaIds: nextIds, blocks: mediaMode === 'image' ? [...blocks, { type: 'image', mediaId: asset.id, alt: asset.name }] : blocks } });
    }
  };

  if (!draft) return <section className="rounded-lg border border-line p-4" aria-label="Activity editor"><h4 className="font-semibold text-ink">{activity?.title ?? 'Activity preview'}</h4>{activity && <p className="mt-1 text-xs capitalize text-ink-muted">{activity.type.split('_').join(' ')} · {activity.status ?? 'draft'}</p>}{activity?.content ? <ActivityContentPreview content={activity.content} mediaUrls={mediaUrls} /> : <p className="mt-3 text-sm text-ink-muted">No saved activity content.</p>}{activity && <Button className="mt-4" size="sm" variant="secondary" onClick={onEdit} disabled={disabled}>Edit Activity</Button>}<MediaAssetLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} courseId={courseId} token={token} selectionMode onSelectAsset={selectMedia} /></section>;

  const update = (patch: Partial<ActivityEditorDraft>) => onChange({ ...draft, ...patch });
  const blocks = Array.isArray(content.blocks) ? content.blocks as ReadingBlock[] : [];
  const updateBlocks = (next: ReadingBlock[]) => update({ content: { version: 1, blocks: next, mediaIds: Array.isArray(content.mediaIds) ? content.mediaIds : [] } });
  const addBlock = (type: ReadingBlock['type']) => updateBlocks([...blocks, type === 'bullet_list' || type === 'numbered_list' ? { type, items: [''] } : type === 'link' ? { type, text: '', url: '' } : type === 'image' ? { type, mediaId: '', alt: '' } : { type, text: '' }]);
  const isStaticText = ['demonstration', 'guided_practice', 'simulation', 'challenge', 'physical_lab', 'result', 'reflection'].includes(draft.type);
  const removeBlock = (index: number) => {
    const block = blocks[index];
    if (block?.type === 'image') update({ content: { version: 1, blocks: blocks.filter((_, i) => i !== index), mediaIds: Array.isArray(content.mediaIds) ? content.mediaIds.filter((id) => id !== block.mediaId) : [] } });
    else updateBlocks(blocks.filter((_, i) => i !== index));
  };

  return <section className="space-y-4 rounded-lg border border-line p-4" aria-label="Activity editor">
    <header className="border-b border-line pb-3"><p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">{activity ? 'Edit activity' : 'New activity'} · Save Draft</p><h4 className="mt-1 font-semibold text-ink">{draft.title || 'Untitled activity'}</h4></header>
    <label className="block text-sm font-medium text-ink">Activity title<input aria-label="Activity title" className={input} value={draft.title} onChange={(event) => update({ title: event.target.value })} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(event) => update({ required: event.target.checked })} />Required activity</label>

    {draft.type === 'reading' && <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => addBlock('heading')}>Add heading</Button><Button size="sm" variant="secondary" onClick={() => addBlock('paragraph')}>Add paragraph</Button><Button size="sm" variant="secondary" onClick={() => addBlock('bullet_list')}>Add bullet list</Button><Button size="sm" variant="secondary" onClick={() => addBlock('link')}>Add link</Button><Button size="sm" variant="secondary" onClick={() => openLibrary('attachment')}>Attach document or image</Button><Button size="sm" variant="secondary" onClick={() => openLibrary('image')}>Insert image</Button></div>{blocks.map((block, index) => <fieldset key={`${block.type}-${index}`} className="space-y-2 rounded-md border border-line p-3"><legend className="px-1 text-xs font-semibold capitalize text-ink-muted">{block.type.split('_').join(' ')}</legend>{block.type === 'heading' || block.type === 'paragraph' ? <textarea aria-label={`${block.type} ${index + 1}`} className={input} value={block.text} onChange={(event) => updateBlocks(blocks.map((item, i) => i === index ? { ...block, text: event.target.value } : item))} /> : block.type === 'link' ? <><input aria-label={`Link text ${index + 1}`} className={input} value={block.text} placeholder="Link label" onChange={(event) => updateBlocks(blocks.map((item, i) => i === index ? { ...block, text: event.target.value } : item))} /><input aria-label={`HTTPS link ${index + 1}`} className={input} value={block.url} placeholder="https://…" onChange={(event) => updateBlocks(blocks.map((item, i) => i === index ? { ...block, url: event.target.value } : item))} /></> : block.type === 'image' ? <><p className="text-xs text-ink-muted">{mediaUrls[block.mediaId]?.filename ?? block.mediaId}</p><input aria-label={`Image alternative text ${index + 1}`} className={input} value={block.alt} onChange={(event) => updateBlocks(blocks.map((item, i) => i === index ? { ...block, alt: event.target.value } : item))} /></> : <textarea aria-label={`${block.type.split('_').join(' ')} ${index + 1}`} className={input} value={block.items.join('\n')} onChange={(event) => updateBlocks(blocks.map((item, i) => i === index ? { ...item, items: event.target.value.split('\n') } : item))} placeholder="One item per line" />}<Button size="sm" variant="ghost" onClick={() => removeBlock(index)}>Remove block</Button></fieldset>)}{Array.isArray(content.mediaIds) && content.mediaIds.length > 0 && <ul className="divide-y divide-line rounded-md border border-line" aria-label="Attached learning media">{content.mediaIds.filter((id): id is string => typeof id === 'string').map((id) => <li key={id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="truncate text-xs text-ink-muted">{mediaUrls[id]?.filename ?? id}</span><Button size="sm" variant="ghost" onClick={() => update({ content: { ...content, mediaIds: (content.mediaIds as string[]).filter((item) => item !== id), blocks: blocks.filter((block) => block.type !== 'image' || block.mediaId !== id) } })}>Remove attachment</Button></li>)}</ul>}{blocks.length === 0 && <p className="text-sm text-ink-muted">Add structured headings, paragraphs, lists, links, or secure images.</p>}</div>}

    {isStaticText && <div className="space-y-3"><label className="block text-sm font-medium text-ink">Instructions<textarea aria-label="Activity instructions" className={input} value={typeof content.instructions === 'string' ? content.instructions : ''} onChange={(event) => update({ content: { ...content, version: 1, instructions: event.target.value } })} /></label><label className="block text-sm font-medium text-ink">Learning outcome<input aria-label="Learning outcome" className={input} value={typeof content.learningOutcome === 'string' ? content.learningOutcome : ''} onChange={(event) => update({ content: { ...content, version: 1, learningOutcome: event.target.value } })} /></label><label className="block text-sm font-medium text-ink">Estimated duration (minutes)<input aria-label="Estimated duration" type="number" min={1} max={600} className={input} value={typeof content.estimatedMinutes === 'number' ? content.estimatedMinutes : 15} onChange={(event) => update({ content: { ...content, version: 1, instructions: typeof content.instructions === 'string' ? content.instructions : '', estimatedMinutes: Number(event.target.value) } })} /></label>{draft.type === 'physical_lab' && <p className="rounded-md bg-warn-soft p-3 text-sm text-ink">This stores instructions only. Physical execution is not enabled here; publishing still requires the approved course evidence policy.</p>}</div>}

    {draft.type === 'video' && <div className="space-y-3"><label className="block text-sm font-medium text-ink">Description<textarea aria-label="Video description" className={input} value={typeof content.description === 'string' ? content.description : ''} onChange={(event) => update({ content: { ...content, version: 1, videoMediaId: typeof content.videoMediaId === 'string' ? content.videoMediaId : '', description: event.target.value } })} /></label><p className="text-sm text-ink-muted">{typeof content.videoMediaId === 'string' && content.videoMediaId ? `Selected private media: ${mediaUrls[content.videoMediaId]?.filename ?? content.videoMediaId}` : 'No video selected.'}</p><Button size="sm" variant="secondary" onClick={() => openLibrary('video')}>Browse or upload video</Button>{typeof content.videoMediaId === 'string' && content.videoMediaId && mediaUrls[content.videoMediaId] && <video controls playsInline preload="metadata" className="max-h-80 w-full rounded-md bg-black" src={mediaUrls[content.videoMediaId].url} aria-label="Video draft preview" />}</div>}
    {draft.type === 'knowledge_check' && lessonId && token ? <QuizAuthoringPanel lessonId={lessonId} token={token} readOnly={disabled} title={draft.title} instructions={typeof content.instructions === 'string' ? content.instructions : ''} assignmentId={draft.contentRef.kind === 'assignment' ? draft.contentRef.id : undefined} onChange={(patch) => update({ ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.instructions !== undefined ? { content: { ...content, instructions: patch.instructions } } : {}), ...(patch.contentRef ? { contentRef: patch.contentRef } : {}) })} /> : draft.type === 'knowledge_check' ? <p className="text-sm text-danger">Quiz editor requires a lesson and authenticated session.</p> : null}
    {['guided_practice', 'simulation', 'challenge', 'physical_lab'].includes(draft.type) && <label className="block text-sm font-medium text-ink">Existing assignment UUID<input aria-label="Assignment ID" className={input} value={draft.contentRef.kind === 'assignment' ? draft.contentRef.id : ''} onChange={(event) => update({ contentRef: { kind: 'assignment', id: event.target.value } })} /></label>}
    {['reading', 'video'].includes(draft.type) && <div className="rounded-md border border-line bg-sunken/40 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Preview</p><ActivityContentPreview content={content} mediaUrls={mediaUrls} /></div>}
    {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    <footer className="flex justify-end gap-2 border-t border-line pt-3"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={disabled || !draft.title.trim() || saving} loading={saving} onClick={onSave}>Save Draft</Button></footer>
    <MediaAssetLibraryModal key={mediaMode} open={libraryOpen} onClose={() => setLibraryOpen(false)} courseId={courseId} token={token} selectionMode onSelectAsset={selectMedia} initialKind={mediaMode === 'video' ? 'video' : undefined} />
  </section>;
}

export function ActivityContentPreview({ content, mediaUrls = {} }: { content: Record<string, unknown>; mediaUrls?: Record<string, { url: string; filename: string }> }) {
  const blocks = Array.isArray(content.blocks) ? content.blocks as ReadingBlock[] : [];
  return <div className="mt-4 space-y-3 text-sm leading-6 text-ink">{typeof content.videoMediaId === 'string' && content.videoMediaId && mediaUrls[content.videoMediaId] && <video controls playsInline preload="metadata" className="max-h-96 w-full rounded-md bg-black" src={mediaUrls[content.videoMediaId].url} aria-label="Video preview" />}{blocks.map((block, index) => {
    if (block.type === 'heading') return <h5 key={index} className="text-base font-semibold">{block.text}</h5>;
    if (block.type === 'paragraph') return <p key={index}>{block.text}</p>;
    if (block.type === 'link') return /^https:\/\//i.test(block.url) ? <a key={index} className="text-accent-ink underline" href={block.url} rel="noreferrer">{block.text}</a> : null;
    if (block.type === 'image') return mediaUrls[block.mediaId] ? <img key={index} src={mediaUrls[block.mediaId].url} alt={block.alt} className="max-h-96 max-w-full rounded-md object-contain" /> : <p key={index} className="text-xs text-ink-muted">Image unavailable in this preview.</p>;
    const List = block.type === 'numbered_list' ? 'ol' : 'ul';
    return <List key={index} className={block.type === 'numbered_list' ? 'list-decimal pl-5' : 'list-disc pl-5'}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</List>;
  })}{Array.isArray(content.mediaIds) && <ul className="space-y-1 border-t border-line pt-3" aria-label="Learning material attachments">{content.mediaIds.filter((id): id is string => typeof id === 'string').map((id) => mediaUrls[id] ? <li key={id}><a className="text-accent-ink underline" href={mediaUrls[id].url} target="_blank" rel="noreferrer" download={mediaUrls[id].filename}>{mediaUrls[id].filename}</a>{isAudioMedia(mediaUrls[id].filename) && <audio controls preload="none" className="mt-1 w-full max-w-md" src={mediaUrls[id].url} aria-label={`Audio: ${mediaUrls[id].filename}`} />}</li> : null)}</ul>}{typeof content.instructions === 'string' && <p>{content.instructions}</p>}{typeof content.learningOutcome === 'string' && content.learningOutcome && <p className="font-medium">Learning outcome: {content.learningOutcome}</p>}</div>;
}

function mediaIdsForContent(content: Record<string, unknown>) {
  const ids = new Set<string>();
  if (typeof content.videoMediaId === 'string' && content.videoMediaId) ids.add(content.videoMediaId);
  if (Array.isArray(content.mediaIds)) content.mediaIds.forEach((id) => { if (typeof id === 'string') ids.add(id); });
  if (Array.isArray(content.blocks)) content.blocks.forEach((block) => { if (block && typeof block === 'object' && typeof (block as Record<string, unknown>).mediaId === 'string') ids.add((block as Record<string, string>).mediaId); });
  return [...ids];
}
