import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon, MessageSquareTextIcon, PuzzleIcon, SendIcon, Undo2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Assignment } from '../../types/learning';
import { useAdmin } from '../../contexts/AdminContext';
import { useLearning } from '../../contexts/LearningContext';
import { usePrograms } from '../../contexts/ProgramsContext';
import { analyzeRecord } from '../../utils/robotProgram/analyzeRecord';
import { countCommands } from '../../utils/robotProgram/generator';
import { assignmentStatusMeta } from '../../utils/assignmentStatus';
import { formatDate, formatRelative } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, inputClasses } from '../ui/Field';

export function AssignmentWorkPanel({ assignment }: {assignment: Assignment;}) {
  const navigate = useNavigate();
  const { getProgress, updateProgress, submitAssignment, withdrawSubmission, submissions } = useLearning();
  const { programs, getProgram, createProgram, experiments } = usePrograms();
  const { settings } = useAdmin();
  const progress = getProgress(assignment.id);
  const program = progress.programId && getProgram(progress.programId) || programs.find((p) => p.assignmentId === assignment.id);
  const [note, setNote] = useState(progress.note);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const analysis = useMemo(() => program ? analyzeRecord(program) : null, [program]);
  const errors = analysis?.ok ? analysis.result.problems.filter((p) => p.severity === 'error').length : 0;
  const lastRun = program ? experiments.find((e) => e.programId === program.id) : undefined;
  const mySubmission = submissions.find((s) => s.assignmentId === assignment.id && s.origin === 'this_browser');
  const status = assignmentStatusMeta[progress.status];
  const submitted = progress.status === 'submitted_local' || progress.status === 'reviewed';

  const openInStudio = () => {
    if (program) {
      navigate(`/studio/${program.id}`);
      return;
    }
    const created = createProgram({ name: assignment.title, starterId: assignment.starterId ?? 'blank', assignmentId: assignment.id });
    updateProgress(assignment.id, { status: 'in_progress', programId: created.id });
    navigate(`/studio/${created.id}`);
  };

  const blockedReason = !program ?
  'Create a program in the Studio first.' :
  analysis && !analysis.ok ?
  'The program could not be read.' :
  settings.requireValidationBeforeSubmit && errors > 0 ?
  `Fix ${errors} validation error${errors > 1 ? 's' : ''} before submitting.` :
  null;

  const submit = () => {
    if (!program || !analysis?.ok) return;
    submitAssignment(assignment.id, {
      programId: program.id,
      programName: program.name,
      commandCount: countCommands(analysis.result.program.commands),
      problemCount: analysis.result.problems.length,
      lastRunOutcome: lastRun?.outcome ?? 'not_run',
      note: note.trim()
    });
    setConfirmOpen(false);
    toast.success('Draft submission saved in this browser', { description: 'It has not been sent to a teacher or server.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Your work</h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {program ?
        <>
            <p className="text-xs text-ink-subtle">Linked program</p>
            <p className="mt-0.5 font-medium text-ink">{program.name}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">Edited {formatRelative(program.updatedAt)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
              <div>
                <dt className="text-ink-subtle">Validation</dt>
                <dd className={errors ? 'font-medium text-danger' : 'font-medium text-ink'}>
                  {!analysis ? '—' : !analysis.ok ? 'Unreadable' : errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Valid'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Last simulation</dt>
                <dd className="font-medium capitalize text-ink">{lastRun ? lastRun.outcome : 'Not run'}</dd>
              </div>
            </dl>
          </> :

        <p className="text-[13px] text-ink-muted">No program yet. Opening the Studio creates one from the assignment's starter.</p>
        }
        <Button variant="primary" className="mt-4 w-full" icon={<PuzzleIcon className="h-4 w-4" />} onClick={openInStudio}>
          {program ? 'Open in Studio' : 'Start in Studio'}
        </Button>
      </div>

      {submitted ?
      <div className="space-y-3">
          <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Saved as a <strong>local draft submission</strong> on {progress.submittedAt ? formatDate(progress.submittedAt, 'MMM d, h:mm a') : '—'}. No submission server is connected, so it has
              not reached your teacher. It is visible only in this browser's Teacher demo view.
            </p>
          </div>
          {mySubmission?.review &&
        <div className="rounded-lg border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <MessageSquareTextIcon className="h-4 w-4 text-accent" aria-hidden /> Feedback · {mySubmission.review.score}/{assignment.points}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{mySubmission.review.feedback || 'No written feedback.'}</p>
              <p className="mt-2 text-2xs text-ink-subtle">
                {mySubmission.review.reviewer} · demo review in this browser
              </p>
            </div>
        }
          {progress.status === 'submitted_local' &&
        <Button
          variant="secondary"
          className="w-full"
          icon={<Undo2Icon className="h-4 w-4" />}
          onClick={() => {
            withdrawSubmission(assignment.id);
            toast.success('Draft submission withdrawn');
          }}>
          
              Withdraw draft submission
            </Button>
        }
        </div> :

      <div className="space-y-3">
          <Field label="Note for your teacher" hint="Optional. Explain your approach or what you got stuck on.">
            {(p) => <textarea {...p} rows={3} maxLength={500} className={inputClasses} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {blockedReason &&
        <p className="flex items-center gap-1.5 text-[13px] text-danger">
              <AlertTriangleIcon className="h-4 w-4" aria-hidden /> {blockedReason}
            </p>
        }
          <Button variant="secondary" className="w-full" disabled={Boolean(blockedReason)} icon={<SendIcon className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>
            Submit draft locally
          </Button>
          <p className="text-2xs leading-4 text-ink-subtle">Submissions are stored in this browser only until a learning backend is connected.</p>
        </div>
      }

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title="Submit a local draft?"
        description="Your program summary and note will be saved as a draft submission in this browser. It will not be sent to your teacher or any server."
        confirmLabel="Save draft submission"
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)} />
      
    </div>);

}