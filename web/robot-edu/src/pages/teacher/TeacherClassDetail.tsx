import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { assignmentKind } from '../../components/submission/submissionState';
import { Link, useParams } from 'react-router-dom';
import { ClipboardCheckIcon, FileQuestionIcon } from 'lucide-react';
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
    const message = queryError instanceof Error ? queryError.message : 'Classroom was not found.';
    return <main className="p-8"><EmptyState title="Classroom unavailable" description={message} action={<Link to="/teacher/classes">Back to My Classes</Link>} /></main>;
  }

  const robot = classroom.data?.allocated_robot;
  const isLoading = classroom.isLoading || roster.isLoading || assignments.isLoading || submissions.isLoading;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link to="/teacher/classes" className="text-sm text-[#176255] underline underline-offset-4">My Classes</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#176255]">Classroom delivery</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] text-ink">{classroom.data?.name ?? 'Classroom'}</h1></div>
        <nav aria-label="Assign learning" className="flex flex-wrap gap-2">
          <Link to={`/teacher/assignments/new?classroomId=${classroomId}`} className="inline-flex h-10 items-center gap-2 bg-[#176255] px-4 text-sm font-semibold text-white"><ClipboardCheckIcon className="h-4 w-4" aria-hidden />New assignment</Link>
          <Link to={`/teacher/quizzes?classroomId=${classroomId}`} className="inline-flex h-10 items-center gap-2 border border-[#176255] px-4 text-sm font-semibold text-[#176255]"><FileQuestionIcon className="h-4 w-4" aria-hidden />Assign a quiz</Link>
        </nav>
      </div>

      <section className="mt-6 border-l-4 border-[#176255] bg-[#f1f3ef] p-5">
        <h2 className="text-lg font-semibold text-ink">Robot Resource</h2>
        {robot ? <p className="mt-2 text-sm text-ink-muted">Allocated: <span className="font-medium text-ink">{robot.name}</span> · {robot.modelName} · {robot.serialNo}</p> : <p className="mt-2 text-sm text-ink-muted">No robot resource allocated to this class.</p>}
      </section>

      {actionError && <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
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
                  <div><p className="font-medium text-ink">{assignment.title} <span className="ml-1 rounded border border-line px-1.5 py-0.5 align-middle text-[11px] font-medium text-ink-muted">{assignmentKind(assignment.constraints) === 'quiz' ? 'Quiz' : 'Assignment'}</span></p><p className="mt-1 text-sm text-ink-muted">{assignment.lesson_title ?? 'Lesson'}{assignment.challenge_title ? ` · ${assignment.challenge_title}` : ''}</p>{assignment.due_at && <p className="mt-1 text-xs text-ink-muted">Due {new Date(assignment.due_at).toLocaleString()}</p>}</div>
                  <span className={assignment.status === 'published' ? 'bg-[#dcefe5] px-2.5 py-1 text-xs font-semibold text-[#176255]' : 'bg-[#ece8da] px-2.5 py-1 text-xs font-semibold capitalize text-[#725d20]'}>{assignment.status}</span>
                </div>
                {canPublishAssignment(assignment.status) && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-ink-muted">Not visible to students.</p><button type="button" disabled={publishAssignment.isPending} onClick={() => publishAssignment.mutate(assignment)} className="h-9 bg-[#176255] px-3 text-sm font-semibold text-white disabled:opacity-50">Publish</button></div>}
              </li>
            ))}
          </ul>
          {!assignments.isLoading && !assignments.data?.length && <p className="mt-3 text-sm text-ink-muted">No learning assigned yet.</p>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Submitted results</h2>
        <ul className="mt-4 divide-y divide-line">{(submissions.data ?? []).map((result) => <li key={result.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-ink">{result.full_name ?? 'Student'} · {result.assignment_title??'Assignment'}{result.attempt_number?` · Attempt ${result.attempt_number}`:''}</p><p className="text-sm text-ink-muted">{result.status} · {result.grading_released_at?'released to student':'not released'} · {result.submitted_at?new Date(result.submitted_at).toLocaleString():'Not timestamped'} · {result.review_status??'unreviewed'}</p></div><Link to={`/teacher/classes/${classroomId}/submissions/${result.id}`} className="text-sm font-semibold text-[#176255] underline underline-offset-4">Review</Link></li>)}</ul>
        {!submissions.isLoading && !submissions.data?.length && <p className="mt-3 text-sm text-ink-muted">No submitted results yet.</p>}
      </section>
    </main>
  );
}
