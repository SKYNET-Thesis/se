import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { assignmentApi, type ApiClassroomAssignment } from '../../lib/api';
import { scheduleBody, validateSchedule, type ScheduleErrors } from '../../queries/quizDeliveryModel';

const input = 'mt-1 block h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink';
const queryKeys = (classroomId: string) => ({ quizzes: ['classroom-quizzes', classroomId], assignments: ['classroom-assignments', classroomId] });

export function ClassroomQuizDeliveryPanel({ classroomId, token }: { classroomId: string; token: string }) {
  const client = useQueryClient();
  const [quizId, setQuizId] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [scheduleErrors, setScheduleErrors] = useState<ScheduleErrors>({});
  const quizzes = useQuery({ queryKey: queryKeys(classroomId).quizzes, queryFn: () => assignmentApi.publishedQuizzes(classroomId, token), enabled: Boolean(classroomId && token) });
  const deliveries = useQuery({ queryKey: queryKeys(classroomId).assignments, queryFn: () => assignmentApi.list(classroomId, token), enabled: Boolean(classroomId && token) });
  const refresh = async () => Promise.all(Object.values(queryKeys(classroomId)).map((queryKey) => client.invalidateQueries({ queryKey })));
  const create = useMutation({ mutationFn: () => assignmentApi.createQuizDelivery(classroomId, token, scheduleBody(quizId, { availableFrom, dueAt, closeAt, maxAttempts })), onSuccess: async () => { setQuizId(''); setAvailableFrom(''); setDueAt(''); setCloseAt(''); setMaxAttempts(''); setScheduleErrors({}); await refresh(); } });
  const publish = useMutation({ mutationFn: (assignmentId: string) => assignmentApi.publish(classroomId, assignmentId, token), onSuccess: refresh });
  const quizDeliveries = (deliveries.data ?? []).filter((row) => (row.constraints as { kind?: string } | undefined)?.kind === 'knowledge_check');
  const selected = quizzes.data?.find((quiz) => quiz.canonical_assignment_id === quizId);
  const error = quizzes.error ?? deliveries.error ?? create.error ?? publish.error;

  return <section className="mt-5 rounded-xl border border-line bg-surface p-5 sm:p-6" aria-label="Classroom quiz assignments">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Learning content</p><h3 className="mt-1 text-lg font-semibold text-ink">Assign a published quiz</h3><p className="mt-1 text-sm text-ink-muted">The course quiz stays canonical. This creates a separate classroom delivery; publishing it makes it available to learners.</p></div>
    {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{error instanceof Error ? error.message : 'Quiz delivery could not be saved.'}</p>}
    {!classroomId && <p className="mt-4 text-sm text-ink-muted">Select a classroom to manage quiz delivery.</p>}
    {classroomId && <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); const errors = validateSchedule({ availableFrom, dueAt, closeAt, maxAttempts }); setScheduleErrors(errors); if (quizId && !create.isPending && Object.keys(errors).length === 0) create.mutate(); }}>
      <label className="block text-sm font-medium text-ink">Published canonical quiz<select className={input} value={quizId} onChange={(event) => setQuizId(event.target.value)} disabled={quizzes.isLoading || create.isPending}><option value="">{quizzes.isLoading ? 'Loading eligible quizzes…' : 'Select a quiz'}</option>{quizzes.data?.map((quiz) => <option key={quiz.canonical_assignment_id} value={quiz.canonical_assignment_id}>{quiz.quiz_title} · {quiz.course_title} / {quiz.lesson_title} · {quiz.question_count} questions · Published</option>)}</select></label>
      {selected && <p className="rounded-md bg-sunken p-3 text-sm text-ink-muted">{selected.instructions || 'No instructions'} · Passing score {selected.pass_percent}% · {selected.question_count} questions</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([['availableFrom', 'Available from', availableFrom, setAvailableFrom], ['dueAt', 'Due date', dueAt, setDueAt], ['closeAt', 'Close date', closeAt, setCloseAt]] as const).map(([name, label, value, setValue]) => <label key={name} className="text-sm">{label}<input name={name} aria-label={label} aria-invalid={Boolean(scheduleErrors[name])} aria-describedby={scheduleErrors[name] ? `${name}-error` : undefined} className={`${input} ${scheduleErrors[name] ? 'border-danger' : ''}`} type="datetime-local" value={value} onChange={(event) => { setValue(event.target.value); setScheduleErrors(validateSchedule({ availableFrom: name === 'availableFrom' ? event.target.value : availableFrom, dueAt: name === 'dueAt' ? event.target.value : dueAt, closeAt: name === 'closeAt' ? event.target.value : closeAt, maxAttempts })); }} />{scheduleErrors[name] && <span id={`${name}-error`} className="mt-1 block text-xs text-danger">{scheduleErrors[name]}</span>}</label>)}<label className="text-sm">Maximum attempts<input name="maxAttempts" aria-label="Maximum attempts" aria-invalid={Boolean(scheduleErrors.maxAttempts)} aria-describedby={scheduleErrors.maxAttempts ? 'maxAttempts-error' : undefined} className={`${input} ${scheduleErrors.maxAttempts ? 'border-danger' : ''}`} type="number" min={1} max={100} value={maxAttempts} onChange={(event) => { setMaxAttempts(event.target.value); setScheduleErrors(validateSchedule({ availableFrom, dueAt, closeAt, maxAttempts: event.target.value })); }} placeholder="Unlimited" />{scheduleErrors.maxAttempts && <span id="maxAttempts-error" className="mt-1 block text-xs text-danger">{scheduleErrors.maxAttempts}</span>}</label></div>
      <Button type="submit" variant="primary" disabled={!quizId || create.isPending || quizzes.isLoading || Object.keys(scheduleErrors).length > 0} loading={create.isPending}>Save quiz as draft</Button>
    </form>}
    <div className="mt-6 border-t border-line pt-4"><h4 className="text-sm font-semibold text-ink">Quiz deliveries in this classroom</h4>{deliveries.isLoading ? <p className="mt-3 text-sm text-ink-muted">Loading classroom assignments…</p> : quizDeliveries.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No quiz deliveries yet.</p> : <ul className="mt-3 divide-y divide-line">{quizDeliveries.map((assignment: ApiClassroomAssignment) => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-ink">{assignment.title}</p><p className="text-xs text-ink-muted">{assignment.lesson_title} · {assignment.status}</p></div>{assignment.status === 'draft' && <Button size="sm" variant="primary" disabled={publish.isPending} loading={publish.isPending && publish.variables === assignment.assignment_id} onClick={() => publish.mutate(assignment.assignment_id)}>Publish to learners</Button>}</li>)}</ul>}</div>
  </section>;
}
