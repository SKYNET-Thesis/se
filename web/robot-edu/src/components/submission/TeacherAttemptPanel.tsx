import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { instructorApi, type ApiInstructorSubmissionDetail } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatBytes } from './submissionState';

/**
 * Instructor view of the ATTEMPT behind a submission: which attempt this is, its attachments, and the explicit
 * release of grading/feedback to the student. Students see nothing of the assessment or feedback until this is released.
 */
export function TeacherAttemptPanel({ item, submissionId, token, onReleased }: { item: ApiInstructorSubmissionDetail; submissionId: string; token: string; onReleased: () => Promise<void> | void }) {
  const attempt = item.attempt ?? null;
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const files = useQuery({ queryKey: ['teacher-attempt-files', attempt?.id], queryFn: () => instructorApi.attemptFiles(attempt!.id, token), enabled: Boolean(token && attempt?.id) });
  const release = useMutation({
    mutationFn: () => instructorApi.releaseGrading(submissionId, token),
    onSuccess: async () => { setMessage('Grade and feedback released to the student.'); await onReleased(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'The grade could not be released.'),
  });
  const open = async (fileId: string) => {
    try { window.open((await instructorApi.attemptFileUrl(attempt!.id, fileId, token)).url, '_blank', 'noopener'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The file could not be opened.'); }
  };
  if (!attempt) return <section className="border-t border-line py-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Attempt</h2><p className="mt-3 text-sm text-ink-muted">This earlier submission is not linked to a specific attempt, so it cannot be released from here.</p></section>;
  const released = Boolean(attempt.gradingReleasedAt);
  return <section aria-label="Attempt and release" className="border-t border-line py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Attempt {attempt.attemptNumber}{item.origin === 'reconstructed' && <Badge tone="outline" className="ml-2 normal-case">Rebuilt from history</Badge>}</h2>
      <div className="flex items-center gap-3">
        <Badge tone={released ? 'ok' : 'warn'}>{released ? `Released ${new Date(attempt.gradingReleasedAt!).toLocaleString()}` : 'Not released to student'}</Badge>
        {!released && <Button size="sm" loading={release.isPending} onClick={() => setConfirming(true)}>Release grade & feedback</Button>}
      </div>
    </div>
    <h3 className="mt-4 text-sm font-semibold text-ink">Student attachments</h3>
    {files.isLoading && <p className="mt-2 text-sm text-ink-muted">Loading attachments…</p>}
    {!files.isLoading && (files.data ?? []).length === 0 && <p className="mt-2 text-sm text-ink-muted">No files were attached to this attempt.</p>}
    <ul className="mt-2 divide-y divide-line border-y border-line">{(files.data ?? []).map((file) => <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate font-medium text-ink">{file.original_filename} <span className="text-xs font-normal text-ink-subtle">{formatBytes(file.size_bytes)}</span></span><Button size="sm" variant="ghost" onClick={() => void open(file.id)}>Download</Button></li>)}</ul>
    {message && <p role="status" className="mt-3 text-sm text-ink-muted">{message}</p>}
    <ConfirmDialog open={confirming} tone="primary" title="Release grade and feedback?" description="The student will be able to see the rubric scores, overall feedback and comments for this attempt." confirmLabel="Release" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); release.mutate(); }} />
  </section>;
}
