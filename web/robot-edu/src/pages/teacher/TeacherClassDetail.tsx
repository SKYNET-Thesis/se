import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { assignmentApi, classroomApi, instructorApi, type ApiClassroomAssignment, type ApiDeliveryOption } from '../../lib/api';
import { canPublishAssignment, createDraftBody, teacherLearningInvalidations, teacherLearningKeys, type DraftAssignmentInput } from '../../queries/teacherLearningQueries';

const emptyDraft: DraftAssignmentInput = { lessonId: '', challengeId: '', title: '', instructions: '' };

export function TeacherClassDetail() {
  const { classroomId = '' } = useParams();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const enabled = Boolean(classroomId && token);
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [draft, setDraft] = useState<DraftAssignmentInput>(emptyDraft);
  const [actionError, setActionError] = useState<string | null>(null);

  const classroom = useQuery({ queryKey: teacherLearningKeys.classroom(classroomId), queryFn: () => classroomApi.detail(classroomId, token), enabled });
  const roster = useQuery({ queryKey: teacherLearningKeys.roster(classroomId), queryFn: () => classroomApi.students(classroomId, token), enabled });
  const assignments = useQuery({ queryKey: teacherLearningKeys.assignments(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled });
  const deliveryOptions = useQuery({ queryKey: teacherLearningKeys.deliveryOptions(classroomId), queryFn: () => assignmentApi.deliveryOptions(classroomId, token), enabled: enabled && assignOpen });
  const submissions = useQuery({ queryKey: teacherLearningKeys.submissions(classroomId), queryFn: () => instructorApi.submissions(classroomId, token), enabled });

  const invalidateAssignments = async () => {
    await Promise.all(teacherLearningInvalidations(classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
  const createAssignment = useMutation({
    mutationFn: () => assignmentApi.create(classroomId, token, createDraftBody(draft)),
    onSuccess: async () => { setAssignOpen(false); setDraft(emptyDraft); setActionError(null); await invalidateAssignments(); },
    onError: (reason) => setActionError(reason instanceof Error ? reason.message : 'Unable to save the assignment draft.'),
  });
  const publishAssignment = useMutation({
    mutationFn: (assignment: ApiClassroomAssignment) => assignmentApi.publish(classroomId, assignment.assignment_id, token),
    onSuccess: async () => { setActionError(null); await invalidateAssignments(); },
    onError: (reason) => setActionError(reason instanceof Error ? reason.message : 'Unable to publish the assignment.'),
  });

  const selectLesson = (lessonId: string) => {
    const option = deliveryOptions.data?.find((item) => item.lesson_id === lessonId);
    setDraft({ lessonId, challengeId: '', title: option?.title ?? '', instructions: option?.instructions ?? '' });
  };
  const submitDraft = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setActionError(null); createAssignment.mutate(); };

  const queryError = [classroom.error, roster.error, assignments.error, submissions.error].find(Boolean);
  if (queryError) {
    const message = queryError instanceof Error ? queryError.message : 'Classroom was not found.';
    return <main className="p-8"><EmptyState title="Classroom unavailable" description={message} action={<Link to="/teacher/classes">Back to My Classes</Link>} /></main>;
  }

  const selectedOption: ApiDeliveryOption | undefined = deliveryOptions.data?.find((item) => item.lesson_id === draft.lessonId);
  const robot = classroom.data?.allocated_robot;
  const isLoading = classroom.isLoading || roster.isLoading || assignments.isLoading || submissions.isLoading;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link to="/teacher/classes" className="text-sm text-[#176255] underline underline-offset-4">My Classes</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#176255]">Classroom delivery</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] text-ink">{classroom.data?.name ?? 'Classroom'}</h1></div>
        <button type="button" onClick={() => { setAssignOpen((value) => !value); setActionError(null); }} className="h-10 border border-[#176255] px-4 text-sm font-semibold text-[#176255]">{assignOpen ? 'Close' : 'Assign learning'}</button>
      </div>

      <section className="mt-6 border-l-4 border-[#176255] bg-[#f1f3ef] p-5">
        <h2 className="text-lg font-semibold text-ink">Robot Resource</h2>
        {robot ? <p className="mt-2 text-sm text-ink-muted">Allocated: <span className="font-medium text-ink">{robot.name}</span> · {robot.modelName} · {robot.serialNo}</p> : <p className="mt-2 text-sm text-ink-muted">No robot resource allocated to this class.</p>}
      </section>

      {assignOpen && (
        <form onSubmit={submitDraft} className="mt-6 border border-line bg-[#f7f8f5] p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-ink">Create assignment draft</h2><p className="mt-1 text-sm text-ink-muted">Students cannot see this assignment until you publish it.</p></div>
            <span className="bg-[#ece8da] px-2.5 py-1 text-xs font-semibold text-[#725d20]">Draft</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-ink">Lesson
              <select required value={draft.lessonId} onChange={(event) => selectLesson(event.target.value)} className="mt-2 h-11 w-full border border-line bg-white px-3 font-normal">
                <option value="">Select an existing lesson</option>
                {(deliveryOptions.data ?? []).map((option) => <option key={option.lesson_id} value={option.lesson_id}>{option.lesson_title}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Blockly challenge <span className="font-normal text-ink-muted">(optional)</span>
              <select value={draft.challengeId} disabled={!draft.lessonId} onChange={(event) => setDraft((value) => ({ ...value, challengeId: event.target.value }))} className="mt-2 h-11 w-full border border-line bg-white px-3 font-normal disabled:bg-[#efefec]">
                <option value="">No challenge</option>
                {(selectedOption?.challenges ?? []).map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.title}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink md:col-span-2">Title
              <input required maxLength={200} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} className="mt-2 h-11 w-full border border-line bg-white px-3 font-normal" />
            </label>
            <label className="text-sm font-medium text-ink md:col-span-2">Instructions
              <textarea rows={4} value={draft.instructions} onChange={(event) => setDraft((value) => ({ ...value, instructions: event.target.value }))} className="mt-2 w-full border border-line bg-white p-3 font-normal" />
            </label>
          </div>
          {deliveryOptions.isLoading && <p className="mt-4 text-sm text-ink-muted">Loading learning content…</p>}
          {deliveryOptions.isError && <p className="mt-4 text-sm text-red-700">Learning content could not be loaded.</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => { setAssignOpen(false); setDraft(emptyDraft); }} className="h-10 border border-line bg-white px-4 text-sm font-semibold text-ink">Cancel</button>
            <button type="submit" disabled={createAssignment.isPending || !draft.lessonId || !draft.title.trim()} className="h-10 bg-[#176255] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{createAssignment.isPending ? 'Saving…' : 'Save draft'}</button>
          </div>
        </form>
      )}

      {actionError && <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
      {isLoading && <p className="mt-6 text-sm text-ink-muted">Loading classroom delivery…</p>}

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold text-ink">Students</h2>
          <ul className="mt-4 divide-y divide-line">{(roster.data ?? []).map((student) => <li key={String(student.id)} className="py-3"><p className="font-medium text-ink">{String(student.full_name)}</p><p className="text-sm text-ink-muted">{student.email ? String(student.email) : 'Account setup pending'}</p></li>)}</ul>
          {!roster.isLoading && !roster.data?.length && <p className="mt-3 text-sm text-ink-muted">No students in this classroom.</p>}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-ink">Assigned learning</h2>
          <ul className="mt-4 divide-y divide-line">
            {(assignments.data ?? []).map((assignment) => (
              <li key={assignment.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="font-medium text-ink">{assignment.title}</p><p className="mt-1 text-sm text-ink-muted">{assignment.lesson_title ?? 'Lesson'}{assignment.challenge_title ? ` · ${assignment.challenge_title}` : ''}</p>{assignment.due_at && <p className="mt-1 text-xs text-ink-muted">Due {new Date(assignment.due_at).toLocaleString()}</p>}</div>
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
        <ul className="mt-4 divide-y divide-line">{(submissions.data ?? []).map((result) => <li key={result.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-ink">{result.full_name ?? 'Student'} · {result.assignment_title??'Assignment'}</p><p className="text-sm text-ink-muted">{result.status} · {result.submitted_at?new Date(result.submitted_at).toLocaleString():'Not timestamped'} · {result.review_status??'unreviewed'}</p></div><Link to={`/teacher/classes/${classroomId}/submissions/${result.id}`} className="text-sm font-semibold text-[#176255] underline underline-offset-4">Review</Link></li>)}</ul>
        {!submissions.isLoading && !submissions.data?.length && <p className="mt-3 text-sm text-ink-muted">No submitted results yet.</p>}
      </section>
    </main>
  );
}
