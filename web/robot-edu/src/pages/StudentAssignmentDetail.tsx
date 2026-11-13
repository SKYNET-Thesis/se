import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AttemptHistory } from '../components/submission/AttemptHistory';
import { assignmentKind, kindLabel, nextAction, windowLabel, windowState } from '../components/submission/submissionState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { assignmentApi, learnerApi } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : null);

/**
 * Unified student view of one classroom assignment (quiz or programming): what it is, when it is open, how many
 * attempts are used, the primary start/resume action, and the history of every attempt with its own files and
 * released result. Working on an attempt happens in the existing /practice/:attemptId experience.
 */
export function StudentAssignmentDetail() {
  const { classroomAssignmentId = '' } = useParams();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const navigate = useNavigate();
  const client = useQueryClient();
  const actionLock = useRef(false);
  const enabled = Boolean(token && classroomAssignmentId);
  const assignment = useQuery({ queryKey: studentLearningKeys.assignment(classroomAssignmentId), queryFn: () => assignmentApi.detail(classroomAssignmentId, token), enabled });
  const history = useQuery({ queryKey: studentLearningKeys.history(classroomAssignmentId), queryFn: () => learnerApi.attemptHistory(classroomAssignmentId, token), enabled });
  const start = useMutation({
    mutationFn: () => learnerApi.createAttempt(classroomAssignmentId, token),
    onSuccess: (attempt) => { void client.invalidateQueries({ queryKey: studentLearningKeys.history(classroomAssignmentId) }); navigate(`/practice/${attempt.id}`); },
    onSettled: () => { actionLock.current = false; },
  });

  if (assignment.isLoading || history.isLoading) return <main className="mx-auto max-w-4xl px-5 py-10 text-sm text-ink-muted">Loading assignment…</main>;
  if (assignment.error || !assignment.data) return <main className="mx-auto max-w-4xl px-5 py-10"><EmptyState title="Assignment unavailable" description={assignment.error instanceof Error ? assignment.error.message : 'This assignment is unavailable.'} /></main>;

  const item = assignment.data;
  const attempts = history.data ?? [];
  const kind = assignmentKind(item.constraints);
  const win = windowState(item);
  const max = item.max_attempts ?? null;
  const action = nextAction(attempts, win, max);
  const proceed = () => {
    if (actionLock.current || start.isPending) return;
    if (action.kind === 'continue') return navigate(`/practice/${action.attemptId}`);
    if (action.kind !== 'start') return;
    actionLock.current = true;
    start.mutate();
  };
  const label = action.kind === 'continue' ? 'Continue attempt' : action.kind === 'start' ? (attempts.length ? 'Start a new attempt' : 'Start attempt') : action.reason;

  return <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
    <Link to="/my-learning" className="text-sm text-ink-muted hover:text-ink">← My Learning</Link>
    <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-accent-ink">{kindLabel[kind]}</p>
    <h1 className="mt-2 text-3xl font-semibold text-ink">{item.title}</h1>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone={win === 'closed' ? 'danger' : win === 'past_due' || win === 'due_soon' ? 'warn' : 'ok'}>{windowLabel[win]}</Badge></div>
    <p className="mt-4 max-w-2xl whitespace-pre-wrap text-ink-muted">{item.instructions ?? 'Follow the lesson instructions and submit your work.'}</p>
    <dl className="mt-8 grid gap-4 border-y border-line py-5 sm:grid-cols-4">
      <div><dt className="text-xs text-ink-subtle">Lesson</dt><dd className="mt-1 font-medium text-ink">{item.lesson_title ?? 'Lesson'}</dd></div>
      <div><dt className="text-xs text-ink-subtle">Available</dt><dd className="mt-1 font-medium text-ink">{fmt(item.available_from) ?? 'Now'}{item.close_at ? ` – ${fmt(item.close_at)}` : ''}</dd></div>
      <div><dt className="text-xs text-ink-subtle">Due</dt><dd className="mt-1 font-medium text-ink">{fmt(item.due_at) ?? 'No due date'}</dd></div>
      <div><dt className="text-xs text-ink-subtle">Attempts</dt><dd className="mt-1 font-medium text-ink">{attempts.length}{typeof max === 'number' ? ` of ${max}` : ''} used</dd></div>
    </dl>
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div><h2 className="text-lg font-semibold text-ink">Your attempts</h2><p className="mt-1 text-sm text-ink-muted">{kind === 'programming' ? 'Opens your Blockly workspace with your saved program.' : kind === 'quiz' ? 'Answers are saved as a draft while you work and graded when you submit.' : 'Each attempt keeps its own work, files and result.'}</p></div>
        <Button loading={start.isPending} disabled={action.kind === 'blocked'} onClick={proceed}>{label}</Button>
      </div>
      {start.error && <p role="alert" className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{start.error instanceof Error ? start.error.message : 'Unable to start attempt.'}</p>}
      {history.error && <p role="alert" className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">Your attempts could not be loaded.</p>}
      <AttemptHistory attempts={attempts} kind={kind} token={token} onOpen={(attemptId) => navigate(`/practice/${attemptId}`)} />
    </section>
  </main>;
}
