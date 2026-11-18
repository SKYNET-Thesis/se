import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { assignmentKind } from '../../components/submission/submissionState';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardCheckIcon, FileQuestionIcon } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { formatQuizDate } from '../../queries/quizAttemptModel';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { assignmentApi, classroomApi, instructorApi, type ApiClassroomAssignment } from '../../lib/api';
import { canPublishAssignment, teacherLearningInvalidations, teacherLearningKeys } from '../../queries/teacherLearningQueries';

export function TeacherClassDetail() {
  const { classroomId = '' } = useParams();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const enabled = Boolean(classroomId && token);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const classroom = useQuery({ queryKey: teacherLearningKeys.classroom(classroomId), queryFn: () => classroomApi.detail(classroomId, token), enabled });
  const roster = useQuery({ queryKey: teacherLearningKeys.roster(classroomId), queryFn: () => classroomApi.students(classroomId, token), enabled });
  const assignments = useQuery({ queryKey: teacherLearningKeys.assignments(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled });
  const submissions = useQuery({ queryKey: teacherLearningKeys.submissions(classroomId), queryFn: () => instructorApi.submissions(classroomId, token), enabled });

  const invalidateAssignments = async () => {
    await Promise.all(teacherLearningInvalidations(classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
  const publishAssignment = useMutation({
    mutationFn: (assignment: ApiClassroomAssignment) => assignmentApi.publish(classroomId, assignment.assignment_id, token),
    onSuccess: async () => { setActionError(null); await invalidateAssignments(); },
    onError: (reason) => setActionError(reason instanceof Error ? reason.message : 'Unable to publish the assignment.'),
  });

  const queryError = [classroom.error, roster.error, assignments.error, submissions.error].find(Boolean);
  if (queryError) {
    const message = queryError instanceof ApiError && (queryError.status === 404 || queryError.status === 403)
      ? 'This classroom isn’t one you teach, or it is no longer available.'
      : queryError instanceof ApiError ? 'The classroom couldn’t be loaded. Try again in a moment.' : 'VISTA couldn’t be reached. Check your connection, then try again.';
    return <main className="p-8"><EmptyState title="Classroom unavailable" description={message} action={<Link to="/teacher/classes" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent hover:text-accent-hover">Back to My Classes</Link>} /></main>;
  }

  const robot = classroom.data?.allocated_robot;
  const isLoading = classroom.isLoading || roster.isLoading || assignments.isLoading || submissions.isLoading;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link to="/teacher/classes" className="inline-flex min-h-[32px] items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeftIcon className="h-4 w-4" aria-hidden />My Classes</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-balance text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{classroom.data?.name ?? 'Classroom'}</h1>{classroom.data?.code ? <p className="mt-1 text-sm text-ink-muted">{String(classroom.data.code)}</p> : null}</div>
        <nav aria-label="Assign learning" className="flex flex-wrap gap-2">
          <Link to={`/teacher/assignments/new?classroomId=${classroomId}`} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"><ClipboardCheckIcon className="h-4 w-4" aria-hidden />New assignment</Link>
          <Link to={`/teacher/quizzes?classroomId=${classroomId}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-sunken"><FileQuestionIcon className="h-4 w-4" aria-hidden />Assign a quiz</Link>
        </nav>
      </div>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-line py-4 text-sm">
        <div><dt className="text-ink-muted">Students</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{roster.data ? roster.data.length : '—'}</dd></div>
        <div><dt className="text-ink-muted">Robot</dt><dd className="mt-0.5 font-medium text-ink">{robot ? `${robot.name} · ${robot.modelName}` : 'Not assigned'}</dd></div>
      </dl>

      {actionError && <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{actionError}</p>}
      {isLoading && <p className="mt-6 text-sm text-ink-muted">Loading classroom delivery…</p>}

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold text-ink">Students</h2>
          <ul className="mt-4 divide-y divide-line">{(roster.data ?? []).map((student) => <li key={String(student.id)} className="py-3"><p className="font-medium text-ink">{String(student.full_name)}</p><p className="text-sm text-ink-muted">{student.email ? String(student.email) : 'Account setup pending'}</p></li>)}</ul>
          {!roster.isLoading && !roster.data?.length && <p className="mt-3 text-sm text-ink-muted">No students in this classroom.</p>}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-ink">Assigned learning</h2><p className="mt-1 text-sm text-ink-muted">Programming assignments and quizzes delivered to this classroom.</p>
          <ul className="mt-4 divide-y divide-line">
            {(assignments.data ?? []).map((assignment) => (
              <li key={assignment.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="font-medium text-ink">{assignment.title} <span className="ml-1 rounded border border-line px-1.5 py-0.5 align-middle text-[11px] font-medium text-ink-muted">{assignmentKind(assignment.constraints) === 'quiz' ? 'Quiz' : 'Assignment'}</span></p><p className="mt-1 text-sm text-ink-muted">{assignment.lesson_title ?? 'Lesson'}{assignment.challenge_title ? ` · ${assignment.challenge_title}` : ''}</p>{assignment.due_at && <p className="mt-1 text-xs text-ink-muted">Due {formatQuizDate(assignment.due_at)}</p>}</div>
                  <span className={assignment.status === 'published' ? 'rounded bg-ok-soft px-2.5 py-1 text-xs font-semibold capitalize text-ok' : 'rounded bg-warn-soft px-2.5 py-1 text-xs font-semibold capitalize text-warn'}>{assignment.status}</span>
                </div>
                {canPublishAssignment(assignment.status) && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-ink-muted">Not visible to students.</p><Button variant="primary" size="sm" loading={publishAssignment.isPending} onClick={() => publishAssignment.mutate(assignment)} aria-label={`Publish ${assignment.title}`}>Publish</Button></div>}
              </li>
            ))}
          </ul>
          {!assignments.isLoading && !assignments.data?.length && <p className="mt-3 text-sm text-ink-muted">No learning assigned yet.</p>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Submitted results</h2>
        <ul className="mt-4 divide-y divide-line">{(submissions.data ?? []).map((result) => <li key={result.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-ink">{result.full_name ?? 'Student'} · {result.assignment_title??'Assignment'}{result.attempt_number?` · Attempt ${result.attempt_number}`:''}</p><p className="text-sm text-ink-muted">{result.status} · {result.grading_released_at?'released to student':'not released'} · {result.submitted_at?formatQuizDate(result.submitted_at):'Not timestamped'} · {result.review_status??'unreviewed'}</p></div><Link to={`/teacher/classes/${classroomId}/submissions/${result.id}`} className="text-sm font-semibold text-accent underline underline-offset-4">Review</Link></li>)}</ul>
        {!submissions.isLoading && !submissions.data?.length && <p className="mt-3 text-sm text-ink-muted">No submitted results yet.</p>}
      </section>
    </main>
  );
}
