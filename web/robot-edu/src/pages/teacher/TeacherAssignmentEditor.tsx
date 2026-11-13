import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, ChevronLeftIcon, FileQuestionIcon, InfoIcon, LockIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ClassroomQuizDeliveryPanel } from '../../components/assignments/ClassroomQuizDeliveryPanel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field, inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { UNSAVED_MESSAGE, useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { assignmentApi, instructorApi, type ApiClassroomAssignment } from '../../lib/api';
import { statusPresentation } from '../../queries/teacherAssignmentsModel';
import { createDraftBody, createUpdateBody, draftForDeliveryOption, teacherLearningInvalidations, teacherLearningKeys } from '../../queries/teacherLearningQueries';

type AssignmentKind = 'blockly' | 'quiz';

export interface AssignmentFormValues { classroomId: string; lessonId: string; challengeId: string; title: string; instructions: string }
export type AssignmentFormErrors = Partial<Record<keyof AssignmentFormValues, string>>;

/** Required-field validation shared by Save Draft and Publish. */
export function validateAssignmentForm(values: AssignmentFormValues): AssignmentFormErrors {
  const errors: AssignmentFormErrors = {};
  if (!values.classroomId) errors.classroomId = 'Choose the classroom that will receive this assignment.';
  if (!values.lessonId) errors.lessonId = 'Choose the lesson this assignment belongs to.';
  if (!values.title.trim()) errors.title = 'Enter an assignment title.';
  else if (values.title.trim().length > 200) errors.title = 'The title can be at most 200 characters.';
  return errors;
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${step}`} className="rounded-lg border border-line bg-surface p-5">
      <h2 id={`section-${step}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink" aria-hidden>{step}</span>{title}</h2>
      {description && <p className="mt-1 text-[13px] text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Note = ({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) => (
  <p className={`flex gap-2 rounded-md border px-3 py-2 text-[13px] ${tone === 'warn' ? 'border-warn/30 bg-warn-soft text-warn' : 'border-line bg-sunken/60 text-ink-muted'}`}><InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{children}</span></p>
);

export function TeacherAssignmentEditor() {
  const { classroomId: routeClassroomId, assignmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const existingMode = Boolean(assignmentId);
  const viewRoute = existingMode && !location.pathname.endsWith('/edit');

  const [kind, setKind] = useState<AssignmentKind>('blockly');
  const [classroomId, setClassroomId] = useState(routeClassroomId ?? '');
  const [lessonId, setLessonId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [touched, setTouched] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<{ notice?: string } | null>(null);
  const busy = useRef(false);
  const initial = useRef<AssignmentFormValues | null>(null);

  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const assignments = useQuery({ queryKey: teacherLearningKeys.assignments(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled: Boolean(token && classroomId && existingMode) });
  const deliveryOptions = useQuery({ queryKey: teacherLearningKeys.deliveryOptions(classroomId), queryFn: () => assignmentApi.deliveryOptions(classroomId, token), enabled: Boolean(token && classroomId) });
  const existing = useMemo<ApiClassroomAssignment | undefined>(() => assignments.data?.find((item) => item.assignment_id === assignmentId), [assignmentId, assignments.data]);

  useEffect(() => { if (!existingMode && !classroomId && classrooms.data?.length === 1) setClassroomId(classrooms.data[0].id); }, [classroomId, classrooms.data, existingMode]);
  useEffect(() => {
    if (!existing) return;
    setLessonId(existing.lesson_id); setChallengeId(existing.challenge_id ?? ''); setTitle(existing.title); setInstructions(existing.instructions ?? '');
    initial.current = { classroomId, lessonId: existing.lesson_id, challengeId: existing.challenge_id ?? '', title: existing.title, instructions: existing.instructions ?? '' };
  }, [existing, classroomId]);

  const readOnly = existingMode && (viewRoute || (existing ? existing.status !== 'draft' : true));
  const lockedStructure = existingMode; // the API only updates title and instructions of a draft
  const values: AssignmentFormValues = { classroomId, lessonId, challengeId, title, instructions };
  const errors = validateAssignmentForm(values);
  const dirty = !readOnly && (existingMode
    ? Boolean(initial.current) && (title !== initial.current!.title || instructions !== initial.current!.instructions)
    : Boolean(lessonId || title || instructions || challengeId));
  useUnsavedChangesWarning(dirty && !leaveTo);
  useEffect(() => { if (leaveTo) navigate('/teacher/assignments', { replace: true, state: leaveTo.notice ? { notice: leaveTo.notice } : undefined }); }, [leaveTo, navigate]);

  const option = deliveryOptions.data?.find((item) => item.lesson_id === lessonId);
  const challenge = option?.challenges.find((item) => item.id === challengeId);
  const rubric = option?.rubric ?? [];
  const classroom = classrooms.data?.find((item) => item.id === classroomId);
  const courseTitle = deliveryOptions.data?.[0]?.course_title ?? '';
  const visibleError = (field: keyof AssignmentFormValues) => (touched ? errors[field] : undefined);

  const refresh = async (room: string) => {
    await Promise.all(teacherLearningInvalidations(room).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    await queryClient.invalidateQueries({ queryKey: teacherLearningKeys.teachingClassrooms });
  };
  /** Persists the draft once. A retry after a failed publish updates the same draft instead of creating a duplicate. */
  const persistDraft = async (): Promise<string> => {
    const draftId = existingMode ? assignmentId! : savedDraftId;
    if (draftId) { await assignmentApi.update(classroomId, draftId, token, createUpdateBody(title, instructions)); return draftId; }
    const created = await assignmentApi.create(classroomId, token, createDraftBody({ lessonId, challengeId, title, instructions })) as { assignment_id: string };
    setSavedDraftId(created.assignment_id);
    return created.assignment_id;
  };
  const run = useMutation({
    mutationFn: async (publish: boolean) => {
      const draftId = await persistDraft();
      if (publish) await assignmentApi.publish(classroomId, draftId, token);
      return { draftId, publish };
    },
    onSuccess: async ({ publish }) => { await refresh(classroomId); setLeaveTo({ notice: publish ? 'Assignment published to the classroom.' : 'Draft saved. Students cannot see it until you publish.' }); },
    onError: (reason, publish) => setActionError(`${reason instanceof Error ? reason.message : 'Assignment could not be saved.'}${publish && (savedDraftId || existingMode) ? ' The draft was saved; you can retry publishing.' : ''}`),
    onSettled: () => { busy.current = false; },
  });
  const submit = (publish: boolean) => {
    setTouched(true); setActionError(null);
    if (Object.keys(errors).length || busy.current || run.isPending) return;
    busy.current = true;
    run.mutate(publish);
  };
  const onFormSubmit = (event: FormEvent) => { event.preventDefault(); submit(false); };
  const requestCancel = () => (dirty ? setConfirmCancel(true) : setLeaveTo({}));

  const queryError = classrooms.error ?? assignments.error ?? deliveryOptions.error;
  const missing = existingMode && assignments.isSuccess && !existing;
  const heading = readOnly && existingMode ? 'Assignment details' : existingMode ? 'Edit draft' : 'Create assignment';
  const status = existing ? statusPresentation(existing.status) : null;
  const disabledAll = readOnly || run.isPending;

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8">
      <Link to="/teacher/assignments" onClick={(event) => { if (dirty) { event.preventDefault(); setConfirmCancel(true); } }} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><ChevronLeftIcon className="h-4 w-4" aria-hidden />Back to assignments</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">{heading}</h1>
        {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
      </div>
      <p className="mt-1.5 text-[15px] text-ink-muted">{readOnly && existingMode ? 'Published assignments are read-only so that students always see the content they were given.' : 'Drafts are saved in the classroom and stay hidden from students until you publish them.'}</p>

      {(queryError || actionError) && <p role="alert" className="mt-5 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{actionError ?? (queryError instanceof Error ? queryError.message : 'Assignment data could not be loaded.')}</p>}
      {missing && <p role="alert" className="mt-5 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">Assignment was not found in this classroom.</p>}
      {readOnly && existing && existing.status !== 'draft' && <p className="mt-5"><Link className="text-sm font-semibold text-accent-ink underline underline-offset-4" to={`/teacher/submissions?classroomId=${classroomId}&assignmentId=${assignmentId}`}>View submissions for this assignment</Link></p>}

      <form onSubmit={onFormSubmit} noValidate className="mt-6 space-y-5" aria-label="Assignment form">
        <Section step={1} title="Basic information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Classroom" error={visibleError('classroomId')} hint="Only classrooms you teach.">{(props) => (
              <select {...props} required disabled={disabledAll || lockedStructure} className={inputClasses} value={classroomId}
                onChange={(event) => { setClassroomId(event.target.value); setLessonId(''); setChallengeId(''); setTitle(''); setInstructions(''); }}>
                <option value="">Select a teaching classroom</option>{(classrooms.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>)}</Field>
            <Field label="Course" hint="Set by the classroom’s course offering.">{(props) => <input {...props} readOnly className={`${inputClasses} bg-sunken`} value={courseTitle || (classroomId && deliveryOptions.isLoading ? 'Loading…' : '')} placeholder="Select a classroom" />}</Field>
            <Field label="Lesson" error={visibleError('lessonId')}>{(props) => (
              <select {...props} required disabled={disabledAll || lockedStructure || !classroomId} className={inputClasses} value={lessonId}
                onChange={(event) => { const next = draftForDeliveryOption(deliveryOptions.data?.find((item) => item.lesson_id === event.target.value)); setLessonId(next.lessonId); setChallengeId(next.challengeId); setTitle(next.title); setInstructions(next.instructions); }}>
                <option value="">Select a lesson</option>{(deliveryOptions.data ?? []).map((item) => <option key={item.lesson_id} value={item.lesson_id}>{item.lesson_title}</option>)}
              </select>)}</Field>
            <div className="hidden sm:block" />
            <Field label="Assignment title" error={visibleError('title')} className="sm:col-span-2">{(props) => <input {...props} required maxLength={200} disabled={disabledAll} className={inputClasses} value={title} onChange={(event) => setTitle(event.target.value)} />}</Field>
            <Field label="Description / instructions" hint="Shown to students on the assignment page." className="sm:col-span-2">{(props) => <textarea {...props} rows={6} disabled={disabledAll} className={inputClasses} value={instructions} onChange={(event) => setInstructions(event.target.value)} />}</Field>
          </div>
        </Section>

        <Section step={2} title="Assignment type" description="Only types the platform can already deliver and grade are offered.">
          <div role="radiogroup" aria-label="Assignment type" className="grid gap-3 sm:grid-cols-2">
            {([['blockly', 'Blockly programming', 'Students build a Blockly program, simulate it and submit a final version.', BotIcon], ['quiz', 'Question Bank quiz', 'Assign an already-published knowledge-check quiz. Machine-graded.', FileQuestionIcon]] as const).map(([value, label, hint, Icon]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${kind === value ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-sunken/50'} ${existingMode ? 'pointer-events-none opacity-70' : ''}`}>
                <input type="radio" name="assignment-kind" className="mt-1" checked={kind === value} disabled={existingMode} onChange={() => setKind(value)} />
                <span><span className="flex items-center gap-1.5 text-sm font-medium text-ink"><Icon className="h-4 w-4" aria-hidden />{label}</span><span className="mt-0.5 block text-xs text-ink-muted">{hint}</span></span>
              </label>))}
          </div>
        </Section>

        {kind === 'quiz' ? (
          <section aria-label="Quiz delivery" className="rounded-lg border border-line bg-surface p-5">
            {classroomId ? <ClassroomQuizDeliveryPanel key={classroomId} classroomId={classroomId} token={token} /> : <Note>Choose a classroom in step 1 to see its published quizzes.</Note>}
          </section>
        ) : (
          <>
            <Section step={3} title="Blockly challenge" description="Optional. Challenges are published, organization-approved, and have persisted success conditions.">
              <Field label="Challenge">{(props) => (
                <select {...props} disabled={disabledAll || lockedStructure || !lessonId} className={inputClasses} value={challengeId} onChange={(event) => setChallengeId(event.target.value)}>
                  <option value="">No challenge</option>{(option?.challenges ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>)}</Field>
              {challenge ? (
                <dl className="mt-4 space-y-3 rounded-md border border-line bg-sunken/40 p-4 text-sm" aria-label="Challenge details">
                  <div><dt className="text-xs text-ink-subtle">Lesson</dt><dd className="font-medium text-ink">{option?.lesson_title}</dd></div>
                  <div><dt className="text-xs text-ink-subtle">Description and requirements</dt><dd className="whitespace-pre-wrap text-ink-muted">{challenge.description?.trim() || 'This challenge has no written description.'}</dd></div>
                  <div><dt className="text-xs text-ink-subtle">Evaluation criteria</dt><dd>{challenge.conditions?.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">{challenge.conditions.map((condition, index) => <li key={`${condition.ruleKey}-${index}`}><span className="capitalize">{condition.type}</span>: {condition.description?.trim() || condition.ruleKey}</li>)}</ul> : <span className="text-ink-muted">No criteria are stored for this challenge.</span>}</dd></div>
                </dl>
              ) : <div className="mt-4"><Note>{lessonId ? 'Without a challenge, students program freely and there are no stored success conditions to validate against.' : 'Choose a lesson to see its challenges.'}</Note></div>}
            </Section>

            <Section step={4} title="Submission settings">
              <ul className="space-y-2 text-sm text-ink-muted">
                <li><strong className="font-medium text-ink">Attempts:</strong> students work in an attempt, run simulations as often as they like (a simulation never submits), and submit explicitly. A submission is final; a retry is a new attempt where the classroom delivery allows it.</li>
                <li><strong className="font-medium text-ink">Attachments:</strong> students can attach files to an attempt before submitting; you can download them while reviewing.</li>
              </ul>
              <div className="mt-3"><Note>Due dates and attempt limits are not configurable for Blockly assignments yet, so no controls are shown.</Note></div>
            </Section>

            <Section step={5} title="Grading settings">
              <h3 className="text-[13px] font-semibold text-ink">Rubric</h3>
              {rubric.length ? (
                <table className="mt-2 w-full text-left text-sm"><thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-1.5 pr-3 font-medium">Criterion</th><th scope="col" className="py-1.5 text-right font-medium">Max points</th></tr></thead>
                  <tbody className="divide-y divide-line">{rubric.map((criterion, index) => <tr key={`${criterion.title}-${index}`}><td className="py-2 pr-3"><span className="font-medium text-ink">{criterion.title}</span>{criterion.description && <span className="block text-xs text-ink-muted">{criterion.description}</span>}</td><td className="py-2 text-right tabular-nums text-ink-muted">{Number(criterion.maxPoints)}</td></tr>)}</tbody></table>
              ) : <div className="mt-2"><Note tone="warn">{lessonId ? 'No rubric is stored for this lesson, so there is nothing to score yet. Students can still submit.' : 'Choose a lesson to see its rubric.'}</Note></div>}
              {!existingMode && rubric.length > 0 && <p className="mt-2 text-xs text-ink-subtle">The new assignment copies these criteria from the most recent assignment of this lesson in your school.</p>}
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li><strong className="font-medium text-ink">Teacher grading:</strong> you score every criterion, add comments, and save the assessment.</li>
                <li><strong className="font-medium text-ink">Machine validation:</strong> {challenge?.conditions?.length ? `deterministic symbolic checks from the challenge (${challenge.conditions.length} stored condition${challenge.conditions.length === 1 ? '' : 's'}) run on student simulations and appear as evidence for you.` : 'available only for challenges with stored conditions; none is selected.'}</li>
                <li className="flex items-start gap-1.5"><LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><strong className="font-medium text-ink">Release:</strong> grades and feedback stay private until you release them. There is no automatic release and no AI scoring.</span></li>
              </ul>
            </Section>

            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
              <p className="text-xs text-ink-muted">{classroom ? <>For <strong className="text-ink">{classroom.name}</strong>{classroom.student_count ? ` · ${classroom.student_count} students` : ''}</> : 'Choose a classroom to begin.'}{dirty && <span className="ml-2 font-medium text-warn">Unsaved changes</span>}</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={requestCancel}>{readOnly ? 'Close' : 'Cancel'}</Button>
                {!readOnly && <Button type="submit" variant="secondary" loading={run.isPending && run.variables === false} disabled={run.isPending || missing}>Save Draft</Button>}
                {!readOnly && <Button variant="primary" loading={run.isPending && run.variables === true} disabled={run.isPending || missing} onClick={() => { setTouched(true); if (!Object.keys(errors).length) setConfirmPublish(true); }}>Publish</Button>}
              </div>
            </div>
          </>
        )}
      </form>

      <ConfirmDialog open={confirmPublish} tone="primary" title="Publish to the classroom?"
        description={`“${title.trim()}” will be visible to the students of ${classroom?.name ?? 'the classroom'} right away. It stays hidden from every other classroom.`}
        confirmLabel="Publish" onCancel={() => setConfirmPublish(false)} onConfirm={() => { setConfirmPublish(false); submit(true); }} />
      <ConfirmDialog open={confirmCancel} title="Discard unsaved changes?" description={UNSAVED_MESSAGE} confirmLabel="Discard" onCancel={() => setConfirmCancel(false)} onConfirm={() => { setConfirmCancel(false); setLeaveTo({}); }} />
    </main>
  );

}
