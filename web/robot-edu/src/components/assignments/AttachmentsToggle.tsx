import { useState } from 'react';
import { assignmentApi } from '../../lib/api';

/**
 * Instructor setting: may students attach evidence files to an attempt? Stored on the assignment (`constraints.attachments.enabled`).
 * Uploads reuse the Learning Media pipeline; type allow-list, per-file size (25 MB) and file count (5) are enforced by the server.
 */
export function AttachmentsToggle({ classroomId, assignmentId, token, initial }: { classroomId: string; assignmentId: string; token: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: boolean) => {
    setSaving(true); setError(null);
    try { await assignmentApi.update(classroomId, assignmentId, token, { attachmentsEnabled: next }); setEnabled(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The setting could not be saved.'); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-4 rounded-lg border border-line p-4">
      <label className="flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={enabled} disabled={saving} onChange={(event) => void change(event.target.checked)} aria-label="Allow students to attach evidence files" />
        <span><strong className="font-medium">Allow students to attach evidence files</strong><span className="block text-ink-muted">Up to 5 files per attempt, 25 MB each. Documents, images, audio and video types supported by Learning Media only.</span></span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
