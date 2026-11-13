import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, LockIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { ApiError, instructorApi, type ApiInstructorSubmission, type ApiInstructorSubmissionDetail } from '../../lib/api';
import { attemptHistory, criterionError, formatDateTime, scoreTotals, stageLabel, submissionStage } from '../../queries/teacherSubmissionsModel';
import { buildAssessmentScores, evaluationPresentation } from '../../queries/teacherSubmissionReview';
import { teacherLearningKeys, teacherReviewInvalidations } from '../../queries/teacherLearningQueries';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { inputClasses } from '../ui/Field';
import { formatBytes } from '../submission/submissionState';
import { EvidenceCard, Meta } from './EvidenceCard';

const BlocklyCanvas = lazy(() => import('../studio/BlocklyCanvas').then((module) => ({ default: module.BlocklyCanvas })));

const Card = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section aria-label={title} className="rounded-lg border border-line bg-surface p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>{aside}</div>
    <div className="mt-3">{children}</div>
  </section>
);

/** Steps of the persisted RobotProgram as a plain list (the canonical, immutable submitted content). */
function ProgramSteps({ robotProgram }: { robotProgram: Record<string, unknown> }) {
  const steps = Array.isArray(robotProgram.steps) ? (robotProgram.steps as Array<Record<string, unknown>>) : null;
  if (!steps) return <pre className="max-h-56 overflow-auto rounded bg-sunken p-3 text-xs">{JSON.stringify(robotProgram, null, 2)}</pre>;
  return (
    <ol className="max-h-56 list-decimal space-y-1 overflow-auto rounded bg-sunken/60 p-3 pl-8 text-sm text-ink">
      {steps.map((step, index) => {
        const { type, ...rest } = step;
        const detail = Object.entries(rest).filter(([, value]) => typeof value !== 'object').map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
        return <li key={index}><span className="font-medium">{String(type ?? 'step')}</span>{detail && <span className="text-ink-muted"> — {detail}</span>}</li>;
      })}
    </ol>
  );
}

interface Props { submissionId: string; token: string; allSubmissions: ApiInstructorSubmission[]; classroomId: string; onSelect: (id: string) => void }

export function SubmissionReviewDetail({ submissionId, token, allSubmissions, classroomId, onSelect }: Props) {
  const client = useQueryClient();
  const detail = useQuery({ queryKey: teacherLearningKeys.submission(submissionId), queryFn: () => instructorApi.submission(submissionId, token), enabled: Boolean(token && submissionId) });
  const item = detail.data;
  const attemptId = item?.attempt?.id;
  const files = useQuery({ queryKey: ['teacher-attempt-files', attemptId], queryFn: () => instructorApi.attemptFiles(attemptId!, token), enabled: Boolean(token && attemptId) });

  const [points, setPoints] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState('');
  const [feedbackOnly, setFeedbackOnly] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  useUnsavedChangesWarning(dirty);

  useEffect(() => {
    if (!item) return;
    setPoints(Object.fromEntries((item.assessment?.scores ?? []).map((score) => [score.criterionId, String(score.awardedPoints)])));
    setComments(Object.fromEntries((item.assessment?.scores ?? []).map((score) => [score.criterionId, score.comment ?? ''])));
    setOverall(item.assessment?.overallFeedback ?? '');
    setDirty(false);
  }, [item?.id, item?.assessment?.id, item?.assessment?.reviewedAt]);

  const refresh = async () => { await Promise.all(teacherReviewInvalidations(classroomId, submissionId).map((queryKey) => client.invalidateQueries({ queryKey }))); };
  const criteria = item?.rubric_criteria ?? [];
  const scores = buildAssessmentScores(criteria, points, comments);
  const assess = useMutation({
    mutationFn: () => scores ? instructorApi.assess(submissionId, token, { overallFeedback: overall.trim() || undefined, scores }) : Promise.reject(new Error('Enter a score within the allowed range for every criterion.')),
    onSuccess: async () => { setNotice('Assessment saved. The student cannot see it until you release the grade.'); setDirty(false); await refresh(); },
  });
  const sendFeedback = useMutation({
    mutationFn: () => instructorApi.feedback(submissionId, token, feedbackOnly.trim()),
    onSuccess: async () => { setFeedbackOnly(''); setNotice('Feedback saved. The student cannot see it until you release it.'); await refresh(); },
  });
  const release = useMutation({
    mutationFn: () => instructorApi.releaseGrading(submissionId, token),
    onSuccess: async () => { setNotice('Grade and feedback released to the student.'); await refresh(); },
  });
  const openFile = async (fileId: string) => {
    try { window.open((await instructorApi.attemptFileUrl(attemptId!, fileId, token)).url, '_blank', 'noopener'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The file could not be opened.'); }
  };

  if (detail.isLoading) return <div role="status" aria-busy="true" className="space-y-3"><div className="h-24 animate-pulse rounded-lg bg-sunken" /><div className="h-64 animate-pulse rounded-lg bg-sunken" /><span className="sr-only">Loading submission…</span></div>;
  if (detail.error || !item) {
    const forbidden = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404);
    return <EmptyState icon={<LockIcon />} title={forbidden ? 'Submission unavailable' : 'Submission could not be loaded'} description={forbidden ? 'It does not exist or you are not allowed to review it.' : detail.error instanceof Error ? detail.error.message : undefined} action={forbidden ? undefined : <Button onClick={() => void detail.refetch()}>Retry</Button>} />;
  }

  const stage = submissionStage({ grading_released_at: item.attempt?.gradingReleasedAt ?? null, attempt: item.attempt, review_status: item.assessment ? 'assessed' : 'unreviewed' });
  const released = stage === 'released';
  const verdict = evaluationPresentation(item.symbolic_evaluation);
  const totals = scoreTotals(criteria, points);
  const history = attemptHistory(allSubmissions, item);
  const reflections = item.experiments.map((experiment) => experiment.demonstration?.reflection).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const canRelease = !released && !dirty && Boolean(item.assessment || item.feedback.length) && !release.isPending;
  const mutationError = assess.error ?? sendFeedback.error ?? release.error;
  const fieldClass = `${inputClasses} disabled:bg-sunken`;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Card title="Submission" aside={<Badge tone={released ? 'ok' : stage === 'assessed' ? 'accent' : 'warn'} dot>{stageLabel[stage]}</Badge>}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Meta label="Student" value={item.full_name ?? 'Student'} />
            <Meta label="Assignment" value={item.assignment_title ?? '—'} />
            <Meta label="Attempt" value={item.attempt ? `Attempt ${item.attempt.attemptNumber}` : 'Not linked to an attempt'} />
            <Meta label="Submitted" value={formatDateTime(item.submitted_at)} />
            <Meta label="Program version" value={item.program_version ? `Version ${item.program_version.versionNumber}` : 'None'} />
            <Meta label="Email" value={item.email ?? '—'} />
          </dl>
          {item.origin === 'reconstructed' && <p className="mt-3 text-xs text-ink-muted">This submission was rebuilt from attempt history; no grade or feedback was invented for it.</p>}
        </Card>

        <Card title="Submitted program" aside={item.program_version && <span className="text-xs text-ink-subtle">Immutable snapshot · saved {formatDateTime(item.program_version.createdAt)}</span>}>
          {item.program_version ? (
            <>
              <p className="mb-3 text-[13px] text-ink-muted">This is the exact ProgramVersion the student submitted — not their latest editable draft.</p>
              <div className="relative h-72 overflow-hidden rounded-md border border-line" data-testid="readonly-blockly">
                <Suspense fallback={<p className="p-4 text-sm text-ink-muted">Loading workspace…</p>}>
                  <BlocklyCanvas key={item.program_version.id} initialState={item.program_version.workspaceJson} readOnly onLoadError={setWorkspaceError} />
                </Suspense>
              </div>
              {workspaceError && <p role="status" className="mt-2 text-xs text-warn">The block workspace could not be drawn ({workspaceError}). The program steps below are the authoritative content.</p>}
              <h4 className="mb-2 mt-4 text-[13px] font-semibold text-ink">Program steps</h4>
              <ProgramSteps robotProgram={item.program_version.robotProgram} />
            </>
          ) : <p className="text-sm text-ink-muted">No ProgramVersion was recorded for this submission.</p>}
        </Card>

        <Card title="Machine validation and simulation evidence">
          <p className="text-[13px] text-ink-muted">Deterministic checks and persisted runs are evidence for you. They never assign a grade.</p>
          <p className={`mt-3 text-lg font-bold ${verdict.tone === 'pass' ? 'text-ok' : verdict.tone === 'fail' ? 'text-danger' : 'text-ink-muted'}`}>{verdict.label === 'PASS' ? 'Symbolic checks: PASS' : verdict.label === 'FAIL' ? 'Symbolic checks: FAIL' : 'No symbolic evaluation recorded'}</p>
          {item.symbolic_evaluation && <ul className="mt-2 space-y-1 text-sm">{item.symbolic_evaluation.ruleResults.map((rule) => <li key={rule.ordinal}><strong>{rule.passed ? 'Passed' : 'Failed'}:</strong> {rule.reason}</li>)}</ul>}
          {item.experiments.length ? <div className="mt-4 space-y-3">{item.experiments.map((experiment) => <EvidenceCard key={experiment.id} evidence={experiment} />)}</div> : <p className="mt-3 text-sm text-ink-muted">No simulation or experiment evidence is stored for this submission.</p>}
        </Card>

        <Card title="Attachments">
          {files.isLoading && <p className="text-sm text-ink-muted">Loading attachments…</p>}
          {!files.isLoading && !(files.data ?? []).length && <p className="text-sm text-ink-muted">No files were attached to this attempt.</p>}
          <ul className="divide-y divide-line">{(files.data ?? []).map((file) => <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate font-medium text-ink">{file.original_filename} <span className="text-xs font-normal text-ink-subtle">{formatBytes(file.size_bytes)}</span></span><Button size="sm" variant="ghost" icon={<DownloadIcon className="h-4 w-4" aria-hidden />} onClick={() => void openFile(file.id)}>Download</Button></li>)}</ul>
        </Card>

        <Card title="Submitted answers">
          {reflections.length ? <ul className="space-y-3">{reflections.map((reflection, index) => <li key={index} className="text-sm"><p className="text-xs font-semibold text-ink-subtle">{reflection.prompt}</p><p className="mt-0.5 text-ink">{reflection.response || 'No response recorded.'}</p></li>)}</ul> : <p className="text-sm text-ink-muted">No written answers or reflections were submitted with this attempt.</p>}
        </Card>

        <Card title="Attempt history">
          <ul className="divide-y divide-line text-sm">{history.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <span>Attempt {entry.attempt_number ?? '—'} · {formatDateTime(entry.submitted_at)}</span>
              <span className="flex items-center gap-2"><Badge tone={submissionStage(entry) === 'released' ? 'ok' : submissionStage(entry) === 'assessed' ? 'accent' : 'warn'}>{stageLabel[submissionStage(entry)]}</Badge>
                {entry.id === item.id ? <span className="text-xs text-ink-subtle">Viewing</span> : <Button size="sm" variant="ghost" onClick={() => onSelect(entry.id)}>Open</Button>}</span>
            </li>))}</ul>
        </Card>
      </div>

      <aside aria-label="Grading panel" className="xl:sticky xl:top-4 xl:self-start">
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-ink">Grading</h3>{criteria.length > 0 && <span className="text-sm tabular-nums text-ink-muted" aria-live="polite">{totals.total} / {totals.max}</span>}</div>
          <p className="mt-1 text-xs text-ink-muted">Scores and feedback are private until you press Release Grade.</p>

          {released && <p className="mt-3 flex items-start gap-2 rounded-md bg-ok-soft p-3 text-xs text-ok"><LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Released {formatDateTime(item.attempt?.gradingReleasedAt)}. The student can see this grade, so it is locked here.</p>}

          {criteria.length === 0 ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">This assignment has no rubric criteria, so there are no scores to enter. You can still send written feedback.</p>
              <label className="block text-[13px] font-medium text-ink">Feedback for the student
                <textarea className={`${fieldClass} mt-1`} rows={4} disabled={released} value={feedbackOnly} onChange={(event) => setFeedbackOnly(event.target.value)} /></label>
              {item.feedback.map((entry) => <p key={entry.id} className="rounded bg-sunken p-2 text-sm">{entry.content}</p>)}
              <Button variant="secondary" disabled={released || !feedbackOnly.trim() || sendFeedback.isPending} loading={sendFeedback.isPending} onClick={() => sendFeedback.mutate()}>Save feedback</Button>
            </div>
          ) : (
            <form className="mt-4 space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); setShowErrors(true); setNotice(null); if (scores) assess.mutate(); }}>
              {criteria.map((criterion) => {
                const error = showErrors ? criterionError(points[criterion.id], criterion.maxPoints) : '';
                return (
                  <fieldset key={criterion.id} className="space-y-2 border-b border-line pb-4 last:border-0">
                    <legend className="text-sm font-medium text-ink">{criterion.ordinal}. {criterion.title}</legend>
                    {criterion.description && <p className="text-xs text-ink-muted">{criterion.description}</p>}
                    <label className="flex items-center gap-2 text-[13px] text-ink-muted">Score
                      <input inputMode="decimal" aria-label={`Score for ${criterion.title}`} aria-invalid={Boolean(error)} disabled={released} value={points[criterion.id] ?? ''} onChange={(event) => { setPoints({ ...points, [criterion.id]: event.target.value }); setDirty(true); }} className={`${fieldClass} h-9 w-20 text-right tabular-nums`} />
                      <span>/ {Number(criterion.maxPoints)}</span></label>
                    {error && <p className="text-xs text-danger">{error}</p>}
                    <textarea aria-label={`Comment for ${criterion.title}`} placeholder="Criterion comment (optional)" rows={2} disabled={released} value={comments[criterion.id] ?? ''} onChange={(event) => { setComments({ ...comments, [criterion.id]: event.target.value }); setDirty(true); }} className={fieldClass} />
                  </fieldset>
                );
              })}
              <label className="block text-[13px] font-medium text-ink">Overall feedback
                <textarea className={`${fieldClass} mt-1`} rows={4} disabled={released} value={overall} onChange={(event) => { setOverall(event.target.value); setDirty(true); }} placeholder="Visible to the student after release" /></label>
              <div className="flex flex-col gap-2">
                <Button type="submit" variant="secondary" loading={assess.isPending} disabled={released || assess.isPending || !dirty && Boolean(item.assessment)}>Save Assessment</Button>
                <Button variant="primary" disabled={!canRelease} onClick={() => setConfirmRelease(true)} aria-describedby="release-hint">Release Grade</Button>
              </div>
              <p id="release-hint" className="text-xs text-ink-subtle">{released ? 'Already released.' : !item.assessment ? 'Save the assessment first. Release is a separate, explicit step.' : dirty ? 'Save your changes before releasing.' : 'Releasing makes the scores and feedback visible to the student.'}</p>
            </form>
          )}
          {criteria.length === 0 && <div className="mt-4"><Button variant="primary" disabled={!canRelease} onClick={() => setConfirmRelease(true)}>Release Grade</Button></div>}
          {item.assessment && <p className="mt-3 text-xs text-ink-subtle">Assessment last saved {formatDateTime(item.assessment.reviewedAt)}.</p>}
          {notice && <p role="status" className="mt-3 rounded-md bg-ok-soft p-3 text-sm text-ok">{notice}</p>}
          {mutationError && <p role="alert" className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">{mutationError instanceof Error ? mutationError.message : 'The change could not be saved.'}</p>}
        </div>
      </aside>

      <ConfirmDialog open={confirmRelease} tone="primary" title="Release grade and feedback?" description="The student will see the rubric scores, overall feedback and comments for this attempt. You will not be able to edit them here afterwards." confirmLabel="Release Grade"
        onCancel={() => setConfirmRelease(false)} onConfirm={() => { setConfirmRelease(false); setNotice(null); release.mutate(); }} />
    </div>
  );
}
