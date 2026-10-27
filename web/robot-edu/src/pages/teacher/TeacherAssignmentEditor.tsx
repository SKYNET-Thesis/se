import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { assignmentApi, instructorApi } from '../../lib/api';
import { createDraftBody, createUpdateBody, deliveryCourseTitle, draftForDeliveryOption, teacherLearningInvalidations, teacherLearningKeys } from '../../queries/teacherLearningQueries';

export function TeacherAssignmentEditor() {
  const { classroomId: routeClassroomId, assignmentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const editing = Boolean(assignmentId);
  const [classroomId, setClassroomId] = useState(routeClassroomId ?? '');
  const [lessonId, setLessonId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const assignments = useQuery({ queryKey: teacherLearningKeys.assignments(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled: Boolean(token && classroomId && editing) });
  const deliveryOptions = useQuery({ queryKey: teacherLearningKeys.deliveryOptions(classroomId), queryFn: () => assignmentApi.deliveryOptions(classroomId, token), enabled: Boolean(token && classroomId) });
  const existing = useMemo(() => assignments.data?.find((item) => item.assignment_id === assignmentId), [assignmentId, assignments.data]);

  useEffect(() => { if (!editing && !classroomId && classrooms.data?.length === 1) setClassroomId(classrooms.data[0].id); }, [classroomId, classrooms.data, editing]);
  useEffect(() => { if (existing) { setLessonId(existing.lesson_id); setChallengeId(existing.challenge_id ?? ''); setTitle(existing.title); setInstructions(existing.instructions ?? ''); } }, [existing]);

  const invalidate = async () => {
    await Promise.all(teacherLearningInvalidations(classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    await queryClient.invalidateQueries({ queryKey: teacherLearningKeys.teachingClassrooms });
  };
  const save = useMutation({
    mutationFn: () => editing && assignmentId ? assignmentApi.update(classroomId, assignmentId, token, createUpdateBody(title, instructions)) : assignmentApi.create(classroomId, token, createDraftBody({ lessonId, challengeId, title, instructions })),
    onSuccess: async () => { await invalidate(); navigate('/teacher/assignments'); },
    onError: (reason) => setActionError(reason instanceof Error ? reason.message : 'Assignment could not be saved.'),
  });
  const selectedOption = deliveryOptions.data?.find((option) => option.lesson_id === lessonId);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setActionError(null); save.mutate(); };
  const queryError = classrooms.error ?? assignments.error ?? deliveryOptions.error;
  const missingEditAssignment = editing && assignments.isSuccess && !existing;

  return <main className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-9">
    <Link to="/teacher/assignments" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><ChevronLeftIcon className="h-4 w-4" aria-hidden />Assignments</Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-[#176255]">Education API · Classroom delivery</p>
    <h1 className="mt-2 text-[28px] font-semibold tracking-[-.03em] text-ink">{editing ? 'Edit assignment' : 'New assignment draft'}</h1>
    <p className="mt-2 text-sm text-ink-muted">{editing ? 'Update the server-backed assignment content.' : 'Drafts persist in the classroom but remain hidden from students until explicitly published.'}</p>
    {(queryError || actionError) && <p role="alert" className="mt-6 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{actionError ?? (queryError instanceof Error ? queryError.message : 'Assignment data could not be loaded.')}</p>}
    {missingEditAssignment && <p role="alert" className="mt-6 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">Assignment was not found in this classroom.</p>}
    <form onSubmit={submit} className="mt-8 space-y-6"><section className="grid gap-4 sm:grid-cols-2">
      <Field label="Classroom" hint="Only classrooms you are authorized to teach.">{(props) => <select {...props} required disabled={editing} className={inputClasses} value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setLessonId(''); setChallengeId(''); setTitle(''); setInstructions(''); }}><option value="">Select a teaching classroom</option>{(classrooms.data ?? []).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select>}</Field>
      <Field label="Course">{(props) => <input {...props} readOnly className={inputClasses} value={deliveryCourseTitle(deliveryOptions.data ?? []) || (classroomId && deliveryOptions.isLoading ? 'Loading…' : '')} placeholder="Select a classroom" />}</Field>
      <Field label="Lesson">{(props) => <select {...props} required disabled={editing || !classroomId} className={inputClasses} value={lessonId} onChange={(event) => { const next = draftForDeliveryOption(deliveryOptions.data?.find((item) => item.lesson_id === event.target.value)); setLessonId(next.lessonId); setChallengeId(next.challengeId); setTitle(next.title); setInstructions(next.instructions); }}><option value="">Select an existing lesson</option>{(deliveryOptions.data ?? []).map((option) => <option key={option.lesson_id} value={option.lesson_id}>{option.lesson_title}</option>)}</select>}</Field>
      <Field label="Blockly challenge" hint="Optional; only backend-approved published challenges are listed.">{(props) => <select {...props} disabled={editing || !lessonId} className={inputClasses} value={challengeId} onChange={(event) => setChallengeId(event.target.value)}><option value="">No challenge</option>{(selectedOption?.challenges ?? []).map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.title}</option>)}</select>}</Field>
      <Field label="Title" className="sm:col-span-2">{(props) => <input {...props} required maxLength={200} className={inputClasses} value={title} onChange={(event) => setTitle(event.target.value)} />}</Field>
      <Field label="Instructions" className="sm:col-span-2">{(props) => <textarea {...props} rows={6} className={inputClasses} value={instructions} onChange={(event) => setInstructions(event.target.value)} />}</Field>
    </section><div className="flex items-center justify-between gap-3 border-t border-line pt-5"><p className="text-xs text-ink-muted">Publishing is a separate action from the Assignments page.</p><div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => navigate('/teacher/assignments')}>Cancel</Button><Button type="submit" variant="primary" disabled={save.isPending || !classroomId || !lessonId || !title.trim() || missingEditAssignment}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}</Button></div></div></form>
  </main>;
}
