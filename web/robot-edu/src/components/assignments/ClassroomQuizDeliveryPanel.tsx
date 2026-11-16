import React, { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { PlusIcon, RotateCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { inputClasses } from '../ui/Field';
import { ApiError, assignmentApi, type ApiClassroomAssignment, type ApiPublishedQuiz } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';
import {
  QUIZ_ACCESS_MESSAGE, deliveryPhase, formatWhen, isQuizAccessDenied, isQuizDelivery, isStaleQuizError, quizDeliveryErrorMessage, quizDeliveryKeys, scheduleBody,
  validateSchedule, type ScheduleErrors, type ScheduleInput,
} from '../../queries/quizDeliveryModel';

/**
 * Quiz delivery for one classroom (A04): the classroom's quizzes first, then one primary action to assign another.
 * Assigning creates a draft; publishing makes it visible to the classroom's students. The server decides eligibility,
 * permission and classroom status; this panel explains its answers and refreshes when they show the screen is stale.
 * The page only renders it for a classroom an authorized classroom list returned; `onClassroomCheck` asks that list to
 * refresh when the quiz endpoints deny access, so a classroom that really was removed then disappears from the page.
 */
export function ClassroomQuizDeliveryPanel({ classroomId, token, classroomName, classroomStatus, onClassroomCheck }: { classroomId: string; token: string; classroomName?: string; classroomStatus?: string; onClassroomCheck?: () => void }) {
  const client = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [publishing, setPublishing] = useState<ApiClassroomAssignment | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inactive = Boolean(classroomStatus && classroomStatus !== 'active');
  const enabled = Boolean(classroomId && token);
  const quizzes = useQuery({ queryKey: quizDeliveryKeys.readyQuizzes(classroomId), queryFn: () => assignmentApi.publishedQuizzes(classroomId, token), enabled: enabled && !inactive });
  const deliveries = useQuery({ queryKey: quizDeliveryKeys.deliveries(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: quizDeliveryKeys.readyQuizzes(classroomId) }),
    client.invalidateQueries({ queryKey: quizDeliveryKeys.deliveries(classroomId) }),
    client.invalidateQueries({ queryKey: teacherLearningKeys.teachingClassrooms }),
  ]);
  // Quiz delivery needs `learning.delivery.manage` for this classroom. The server says so with 403, or with the scope
  // guard's 404 "Classroom was not found." (see isQuizAccessDenied); neither means the classroom is gone.
  const listDenied = isQuizAccessDenied(deliveries.error);
  const cannotManage = listDenied || isQuizAccessDenied(quizzes.error) || (quizzes.error instanceof ApiError && quizzes.error.status === 403);
  const rows = (deliveries.data ?? []).filter(isQuizDelivery);
  const room = classroomName ?? 'this classroom';
  const blockedReason = inactive ? `This classroom is ${classroomStatus === 'archived' ? 'archived' : 'no longer active'}. Its quizzes can’t be assigned or published until a school administrator reactivates it.`
    : listDenied ? QUIZ_ACCESS_MESSAGE
    : cannotManage ? 'You can see this classroom’s quizzes, but your account can’t assign or publish them.' : null;
  const checkRef = useRef(onClassroomCheck);
  checkRef.current = onClassroomCheck;
  useEffect(() => { if (listDenied) checkRef.current?.(); }, [listDenied]);

  if (!classroomId) return null;
  return (
    <section className="mt-6" aria-labelledby="classroom-quizzes-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} id="classroom-quizzes-heading" className="text-lg font-semibold text-ink focus:outline-none">Assigned quizzes{deliveries.isSuccess && <span className="ml-2 align-middle text-sm font-medium tabular-nums text-ink-muted">{rows.length}</span>}</h2>
          {!blockedReason && <p className="mt-1 text-sm text-ink-muted">New quizzes start as drafts. Students see them once you publish.</p>}
        </div>
        <Button variant="primary" icon={<PlusIcon className="h-4 w-4" aria-hidden />} onClick={() => setAssignOpen(true)} disabled={Boolean(blockedReason)} aria-describedby={blockedReason ? 'quiz-delivery-blocked' : undefined}>Assign a quiz</Button>
      </div>
      {blockedReason && <p id="quiz-delivery-blocked" role={listDenied ? 'alert' : undefined} className="mt-4 rounded-md bg-warn-soft px-3 py-2.5 text-sm text-ink">{blockedReason}</p>}

      {!listDenied && <div className="mt-4 rounded-lg border border-line bg-surface">
        {deliveries.isPending ? (
          <ul aria-label="Loading quizzes" className="divide-y divide-line">{[0, 1, 2].map((item) => <li key={item} className="space-y-2 p-4"><div className="h-4 w-1/2 rounded bg-sunken motion-safe:animate-pulse" /><div className="h-3 w-1/3 rounded bg-sunken motion-safe:animate-pulse" /></li>)}</ul>
        ) : deliveries.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-danger">
            <span>{quizDeliveryErrorMessage(deliveries.error, 'load')}</span>
            <Button size="sm" variant="secondary" onClick={() => void deliveries.refetch()} loading={deliveries.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-muted">No quizzes assigned yet.</p>
        ) : (
          <ul className="divide-y divide-line">{rows.map((row) => <DeliveryRow key={row.id} row={row} classroomActive={!inactive} canPublish={!blockedReason} onPublish={() => setPublishing(row)} />)}</ul>
        )}
      </div>}

      <AssignQuizDialog open={assignOpen} onClose={() => setAssignOpen(false)} classroomId={classroomId} token={token} room={room} quizzes={quizzes} refresh={refresh} />
      <PublishQuizDialog delivery={publishing} onClose={() => setPublishing(null)} classroomId={classroomId} token={token} room={room} refresh={refresh} onPublished={() => headingRef.current?.focus()} />
    </section>
  );
}

function Window({ row }: { row: Pick<ApiClassroomAssignment, 'available_from' | 'due_at' | 'close_at' | 'max_attempts'> }) {
  const items: Array<[string, string]> = [
    ['Opens', formatWhen(row.available_from) ?? 'When published'],
    ...(formatWhen(row.due_at) ? [['Due', formatWhen(row.due_at) as string] as [string, string]] : []),
    ...(formatWhen(row.close_at) ? [['Closes', formatWhen(row.close_at) as string] as [string, string]] : []),
    ['Attempts', row.max_attempts ? String(row.max_attempts) : 'Unlimited'],
  ];
  return <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">{items.map(([term, value]) => <div key={term} className="flex gap-1.5"><dt className="text-ink-muted">{term}</dt><dd className="font-medium tabular-nums text-ink">{value}</dd></div>)}</dl>;
}

function DeliveryRow({ row, classroomActive, canPublish, onPublish }: { row: ApiClassroomAssignment; classroomActive: boolean; canPublish: boolean; onPublish: () => void }) {
  const phase = deliveryPhase(row, Date.now(), classroomActive);
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words text-[15px] font-semibold text-ink">{row.title}</p>
        {row.lesson_title && <p className="mt-0.5 break-words text-sm text-ink-muted">Lesson: {row.lesson_title}</p>}
        <Window row={row} />
        <p className="mt-1.5 text-xs text-ink-subtle">{phase.note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
        <Badge tone={phase.tone} dot>{phase.label}</Badge>
        {phase.key === 'draft' && canPublish && <Button size="sm" variant="secondary" className="min-h-[44px] sm:min-h-0" onClick={onPublish} aria-label={`Publish ${row.title}`}>Publish</Button>}
      </div>
    </li>
  );
}

type ReadyQuizzes = UseQueryResult<ApiPublishedQuiz[]>;
const emptySchedule: ScheduleInput = { availableFrom: '', dueAt: '', closeAt: '', maxAttempts: '' };

function AssignQuizDialog({ open, onClose, classroomId, token, room, quizzes, refresh }: { open: boolean; onClose: () => void; classroomId: string; token: string; room: string; quizzes: ReadyQuizzes; refresh: () => Promise<unknown> }) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [quizId, setQuizId] = useState('');
  const [schedule, setSchedule] = useState<ScheduleInput>(emptySchedule);
  const [fieldErrors, setFieldErrors] = useState<ScheduleErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (open) { setQuizId(''); setSchedule(emptySchedule); setFieldErrors({}); setSubmitted(false); setError(null); } }, [open]);
  // The quiz list can finish loading after the dialog has focused Cancel: move focus to the first quiz once it exists.
  useEffect(() => {
    if (!open || quizzes.isPending) return undefined;
    const timer = window.setTimeout(() => {
      const panel = formRef.current?.closest<HTMLElement>('[role="dialog"]');
      const target = panel?.querySelector<HTMLElement>('input[name="quiz"], [data-retry], [data-cancel]');
      const active = document.activeElement as HTMLElement | null;
      if (target && panel && (!panel.contains(active) || active?.hasAttribute('data-cancel') || (active as HTMLButtonElement | null)?.disabled)) target.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, quizzes.isPending, quizzes.isError]);

  const [focusAfterError, setFocusAfterError] = useState<'retry' | 'list' | null>(null);
  const selected = quizzes.data?.find((quiz) => quiz.canonical_assignment_id === quizId);
  const create = useMutation({
    mutationFn: () => assignmentApi.createQuizDelivery(classroomId, token, scheduleBody(quizId, schedule)),
    onSuccess: async () => {
      onClose();
      toast.success('Quiz added as a draft', { description: `Publish ${selected?.quiz_title ?? 'it'} when students in ${room} should see it.` });
      await refresh();
    },
    onError: (reason) => {
      setError(quizDeliveryErrorMessage(reason, 'assign'));
      if (isStaleQuizError(reason)) { setQuizId(''); void refresh(); }
      // Retry stays one key press away when the choice is kept; otherwise (stale: the choice was cleared) go back to the
      // quiz list. Applied by the effect below once the mutation is no longer pending: onError runs while the controls
      // are still disabled, and focusing a disabled control drops focus to the page.
      setFocusAfterError(isStaleQuizError(reason) ? 'list' : 'retry');
    },
  });
  useEffect(() => {
    if (!focusAfterError || create.isPending) return;
    const panel = formRef.current?.closest<HTMLElement>('[role="dialog"]');
    const retry = focusAfterError === 'retry' ? panel?.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)') : null;
    (retry ?? formRef.current?.querySelector<HTMLElement>('input[name="quiz"]:not(:disabled), input:not(:disabled)'))?.focus();
    errorRef.current?.scrollIntoView?.({ block: 'nearest' }); // the message sits at the end of a scrolling dialog on phones
    setFocusAfterError(null);
  }, [focusAfterError, create.isPending]);
  const update = (field: keyof ScheduleInput, value: string) => {
    const next = { ...schedule, [field]: value };
    setSchedule(next); setError(null);
    if (submitted) setFieldErrors(validateSchedule(next));
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId || create.isPending) return;
    setSubmitted(true);
    const errors = validateSchedule(schedule);
    setFieldErrors(errors);
    const first = (Object.keys(errors) as Array<keyof ScheduleInput>)[0];
    if (first) { formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    create.mutate();
  };
  const field = (name: keyof ScheduleInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-ink">{label} <span className="font-normal text-ink-subtle">(optional)</span></span>
      <input name={name} value={schedule[name]} onChange={(event) => update(name, event.target.value)} disabled={create.isPending} aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `${formId}-${name}` : undefined} className={`${inputClasses} h-10 ${fieldErrors[name] ? 'border-danger' : ''}`} {...props} />
      {fieldErrors[name] && <span id={`${formId}-${name}`} className="block text-xs text-danger">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <Dialog open={open} onClose={() => { if (!create.isPending) onClose(); }} size="lg" title="Assign a quiz" description={<>Choose a quiz for <span className="font-medium text-ink">{room}</span> and when students can take it.</>}
      footer={<><Button data-cancel variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" form={formId} variant="primary" disabled={!quizId || Boolean(quizzes.isError)} loading={create.isPending}>{create.isPending ? 'Adding…' : 'Add as draft'}</Button></>}>
      <form ref={formRef} id={formId} onSubmit={submit} noValidate className="space-y-5">
        <fieldset>
          <legend className="text-[13px] font-medium text-ink">Quiz</legend>
          {quizzes.isPending ? (
            <p className="mt-2 text-sm text-ink-muted" role="status">Loading quizzes ready for this classroom…</p>
          ) : quizzes.isError ? (
            <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
              <span>{quizDeliveryErrorMessage(quizzes.error, 'load')}</span>
              <Button data-retry size="sm" variant="secondary" onClick={() => void quizzes.refetch()} loading={quizzes.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
            </div>
          ) : !quizzes.data?.length ? (
            <p className="mt-2 text-sm text-ink-muted">No quizzes are ready to assign. Quizzes appear here once VISTA publishes them in this classroom’s course, and ones already assigned here aren’t listed again.</p>
          ) : (
            <div className="mt-2 divide-y divide-line rounded-md border border-line">
              {quizzes.data.map((quiz) => (
                <label key={quiz.canonical_assignment_id} className={`flex cursor-pointer gap-3 p-3 ${quizId === quiz.canonical_assignment_id ? 'bg-accent-soft' : 'hover:bg-sunken'}`}>
                  <input type="radio" name="quiz" value={quiz.canonical_assignment_id} checked={quizId === quiz.canonical_assignment_id} onChange={() => { setQuizId(quiz.canonical_assignment_id); setError(null); }} disabled={create.isPending} className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-ink">{quiz.quiz_title}</span>
                    <span className="mt-0.5 block break-words text-[13px] text-ink-muted">{quiz.course_title} › {quiz.lesson_title}</span>
                    <span className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-ink-muted"><span>{quiz.question_count} {quiz.question_count === 1 ? 'question' : 'questions'}</span><span>Pass mark {quiz.pass_percent}%</span></span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* Nothing to schedule without a quiz to assign: keep the dialog to the problem and its way out. */}
        {!quizzes.isError && (quizzes.isPending || Boolean(quizzes.data?.length)) && <>
        <fieldset className="space-y-3">
          <legend className="text-[13px] font-medium text-ink">When students can take it</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('availableFrom', 'Opens', { type: 'datetime-local' })}
            {field('dueAt', 'Due', { type: 'datetime-local' })}
            {field('closeAt', 'Closes', { type: 'datetime-local' })}
            {field('maxAttempts', 'Attempts allowed', { type: 'number', inputMode: 'numeric', min: 1, max: 100, step: 1, placeholder: 'Unlimited' })}
          </div>
          <p className="text-xs text-ink-muted">Without an opening time, students can start as soon as you publish. After the closing time they can’t start it.</p>
        </fieldset>

        <p className="text-sm text-ink-muted">The quiz is added as a draft. Students see it once you publish it.</p>
        </>}
        {error && <p ref={errorRef} role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}

function PublishQuizDialog({ delivery, onClose, classroomId, token, room, refresh, onPublished }: { delivery: ApiClassroomAssignment | null; onClose: () => void; classroomId: string; token: string; room: string; refresh: () => Promise<unknown>; onPublished: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(false);
  const shown = useRef<ApiClassroomAssignment | null>(null);
  if (delivery) shown.current = delivery; // keep the content while the dialog animates out
  const row = delivery ?? shown.current;
  useEffect(() => { if (delivery) setError(null); }, [delivery]);
  const publish = useMutation({
    mutationFn: (target: ApiClassroomAssignment) => assignmentApi.publish(classroomId, target.assignment_id, token),
    onSuccess: async (_data, target) => {
      onClose();
      const opens = target.available_from && new Date(target.available_from).getTime() > Date.now() ? formatWhen(target.available_from) : null;
      toast.success('Quiz published', { description: opens ? `${target.title} opens for students in ${room} on ${opens}.` : `Students in ${room} can take ${target.title} now.` });
      await refresh();
      onPublished(); // the row's Publish button is gone, so focus would otherwise fall back to the page
    },
    onError: (reason) => {
      setError(quizDeliveryErrorMessage(reason, 'publish'));
      if (isStaleQuizError(reason)) void refresh();
      setRefocus(true); // applied once the button is enabled again (see the effect below)
    },
  });
  // onError runs while the confirm button is still disabled (pending); focus it once it is enabled again.
  useEffect(() => {
    if (!refocus || publish.isPending) return;
    confirmRef.current?.focus();
    setRefocus(false);
  }, [refocus, publish.isPending]);
  const opens = row ? formatWhen(row.available_from) : null;
  return (
    <Dialog open={Boolean(delivery)} onClose={() => { if (!publish.isPending) onClose(); }} size="sm" title="Publish this quiz?"
      description={row ? <span className="break-words font-medium text-ink">{row.title}</span> : undefined}
      footer={<><Button data-autofocus variant="secondary" onClick={onClose} disabled={publish.isPending}>Cancel</Button><Button ref={confirmRef} variant="primary" loading={publish.isPending} onClick={() => { if (delivery && !publish.isPending) publish.mutate(delivery); }}>{publish.isPending ? 'Publishing…' : 'Publish quiz'}</Button></>}>
      {row && (
        <div className="space-y-3 text-sm text-ink">
          <p>Students in <span className="font-medium">{room}</span> will see this quiz {opens ? <>from <span className="font-medium tabular-nums">{opens}</span></> : 'straight away'}.</p>
          <Window row={row} />
          <p className="text-ink-muted">Once published, a quiz can’t be moved back to draft here.</p>
          {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
