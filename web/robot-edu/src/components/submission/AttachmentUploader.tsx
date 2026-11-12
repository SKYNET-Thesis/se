import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learnerApi } from '../../lib/api';
import { MAX_SUBMISSION_FILES, precheckSubmissionFile, SUBMISSION_ACCEPT, uploadToPresignedPost } from '../../lib/submissionUpload';
import { Button } from '../ui/Button';
import { formatBytes } from './submissionState';

export const attachmentKeys = { files: (attemptId: string) => ['student-learning', 'attempt-files', attemptId] as const };

/**
 * Attachments of ONE attempt: add and remove while the attempt is open, read-only afterwards.
 * Uploads go browser -> private bucket with a server-signed POST; the server verifies size, type and content before a file is ready.
 */
export function AttachmentUploader({ attemptId, token, readOnly, onBusyChange }: { attemptId: string; token: string; readOnly: boolean; onBusyChange?: (busy: boolean) => void }) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const files = useQuery({ queryKey: attachmentKeys.files(attemptId), queryFn: () => learnerApi.attemptFiles(attemptId, token), enabled: Boolean(token && attemptId) });
  const refresh = () => client.invalidateQueries({ queryKey: attachmentKeys.files(attemptId) });
  const ready = (files.data ?? []).filter((f) => f.status === 'ready' || f.status === 'pending');

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const check = precheckSubmissionFile(file, ready.length);
      if (!check.ok) throw new Error(check.message);
      const { file: created, upload: post } = await learnerApi.createAttemptFile(attemptId, token, { filename: file.name, contentType: check.contentType, sizeBytes: file.size });
      try { await uploadToPresignedPost(post, file); await learnerApi.completeAttemptFile(attemptId, created.id, token); }
      catch (error) { await learnerApi.removeAttemptFile(attemptId, created.id, token).catch(() => undefined); throw error; }
    },
    onMutate: () => { setMessage(null); onBusyChange?.(true); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'The file could not be attached.'),
    onSettled: () => { onBusyChange?.(false); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => learnerApi.removeAttemptFile(attemptId, fileId, token),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'The file could not be removed.'),
    onSettled: () => void refresh(),
  });
  const download = async (fileId: string) => {
    try { window.open((await learnerApi.attemptFileUrl(attemptId, fileId, token)).url, '_blank', 'noopener'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The file could not be opened.'); }
  };
  const pick = (list: FileList | null) => { const file = list?.[0]; if (file && !upload.isPending) upload.mutate(file); if (input.current) input.current.value = ''; };

  return <section aria-label="Attachments" className="mt-6">
    <div className="flex items-end justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">Attachments</h3>
      <p className="text-xs text-ink-subtle">{ready.length} of {MAX_SUBMISSION_FILES} files</p>
    </div>
    {files.isLoading && <p className="mt-3 text-sm text-ink-muted">Loading attachments…</p>}
    {files.error && <p role="alert" className="mt-3 text-sm text-danger">Attachments could not be loaded.</p>}
    {!files.isLoading && !files.error && ready.length === 0 && <p className="mt-3 text-sm text-ink-muted">{readOnly ? 'No files were attached to this attempt.' : 'No files attached yet.'}</p>}
    <ul className="mt-3 divide-y divide-line border-y border-line">
      {ready.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
        <span className="min-w-0"><span className="block truncate font-medium text-ink">{file.original_filename}</span>
          <span className="text-xs text-ink-subtle">{formatBytes(file.size_bytes)}{file.status === 'pending' ? ' · verifying…' : ''}</span></span>
        <span className="flex shrink-0 gap-2">
          {file.status === 'ready' && <Button size="sm" variant="ghost" onClick={() => void download(file.id)}>Download</Button>}
          {!readOnly && <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === file.id} onClick={() => remove.mutate(file.id)} aria-label={`Remove ${file.original_filename}`}>Remove</Button>}
        </span>
      </li>)}
    </ul>
    {!readOnly && <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
      className={`mt-4 rounded-md border border-dashed p-4 text-sm ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}>
      <p className="text-ink-muted">Drop a file here, or choose one. PDF, DOCX, PNG, JPEG or WEBP, up to 25 MB.</p>
      <input ref={input} type="file" accept={SUBMISSION_ACCEPT} className="sr-only" id={`attach-${attemptId}`} onChange={(e) => pick(e.target.files)} disabled={upload.isPending || ready.length >= MAX_SUBMISSION_FILES} />
      <Button className="mt-3" variant="secondary" loading={upload.isPending} disabled={ready.length >= MAX_SUBMISSION_FILES} onClick={() => input.current?.click()}>Choose file</Button>
    </div>}
    {message && <p role="alert" className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">{message}</p>}
  </section>;
}
