import { useState } from 'react';
import type { ApiAttemptHistoryItem } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { AttachmentUploader } from './AttachmentUploader';
import { GradingFeedbackPanel } from './GradingFeedbackPanel';
import { attemptPresentation, type AssignmentKind } from './submissionState';

/** Every attempt with ITS OWN status, submission time, attachments and released result; previous attempts are read-only. */
export function AttemptHistory({ attempts, kind, token, onOpen }: { attempts: ApiAttemptHistoryItem[]; kind: AssignmentKind; token: string; onOpen: (attemptId: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (attempts.length === 0) return <p className="mt-4 text-sm text-ink-muted">You have not started this assignment yet.</p>;
  return <ul className="mt-4 divide-y divide-line border-y border-line">
    {attempts.map((attempt) => {
      const view = attemptPresentation(attempt, kind);
      const open = expanded === attempt.id;
      return <li key={attempt.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Attempt {attempt.attempt_number} <Badge tone={view.tone === 'accent' ? 'accent' : view.tone}>{view.label}</Badge>
              {attempt.submission_origin === 'reconstructed' && <Badge tone="outline" className="ml-2">Rebuilt from history</Badge>}</p>
            <p className="mt-1 text-xs text-ink-subtle">Started {new Date(attempt.started_at).toLocaleString()}{attempt.submitted_at ? ` · Submitted ${new Date(attempt.submitted_at).toLocaleString()}` : ''}
              {attempt.has_draft && !view.final ? ' · Draft saved' : ''}{attempt.file_count > 0 ? ` · ${attempt.file_count} file${attempt.file_count === 1 ? '' : 's'}` : ''}
              {kind === 'quiz' && attempt.score !== null && attempt.status === 'evaluated' ? ` · Score ${Number(attempt.score)}%` : ''}</p>
          </div>
          <div className="flex gap-2">
            {!view.final && <button type="button" className="text-sm font-medium text-accent hover:text-accent-hover" onClick={() => onOpen(attempt.id)}>Continue</button>}
            {view.final && <button type="button" aria-expanded={open} className="text-sm font-medium text-accent hover:text-accent-hover" onClick={() => setExpanded(open ? null : attempt.id)}>{open ? 'Hide details' : 'View details'}</button>}
          </div>
        </div>
        {open && <div className="mt-3">
          {kind !== 'quiz' && <AttachmentUploader attemptId={attempt.id} token={token} readOnly />}
          {kind !== 'quiz' && <GradingFeedbackPanel attemptId={attempt.id} token={token} submitted />}
          {kind === 'quiz' && <button type="button" className="text-sm font-medium text-accent hover:text-accent-hover" onClick={() => onOpen(attempt.id)}>Open result</button>}
        </div>}
      </li>;
    })}
  </ul>;
}
