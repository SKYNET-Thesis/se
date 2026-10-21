import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeftIcon, FileQuestionIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Assignment } from '../../types/learning';
import { useLearning } from '../../contexts/LearningContext';
import { starterPrograms } from '../../data/starterPrograms';
import { CriteriaEditor } from '../../components/teacher/CriteriaEditor';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, inputClasses } from '../../components/ui/Field';
import { LinkButton } from '../../components/ui/LinkButton';
import { Switch } from '../../components/ui/Switch';
import { DemoTag } from '../../components/ui/DemoTag';
import { createId } from '../../utils/id';
import { daysFromNow } from '../../utils/format';

type Errors = Partial<Record<'title' | 'course' | 'lesson' | 'summary' | 'instructions' | 'due' | 'points' | 'criteria', string>>;

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

export function TeacherAssignmentEditor() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { courses, getAssignment, upsertAssignment } = useLearning();
  const existing = assignmentId ? getAssignment(assignmentId) : undefined;

  const blank = useMemo<Assignment>(
    () => ({
      id: createId('asg'),
      courseId: courses[0]?.id ?? '',
      lessonId: courses[0]?.lessons[0]?.id ?? '',
      title: '',
      summary: '',
      instructions: [],
      objectives: [],
      criteria: [{ id: createId('c'), text: 'Program validates with no errors', check: { kind: 'no_errors' } }],
      dueDate: daysFromNow(7),
      points: 10,
      published: false,
      starterId: 'blank'
    }),
    [courses]
  );

  const [draft, setDraft] = useState<Assignment>(existing ?? blank);
  const [instructions, setInstructions] = useState((existing ?? blank).instructions.join('\n'));
  const [objectives, setObjectives] = useState((existing ?? blank).objectives.join('\n'));
  const [due, setDue] = useState(format(new Date((existing ?? blank).dueDate), "yyyy-MM-dd'T'HH:mm"));
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (existing) {
      setDraft(existing);
      setInstructions(existing.instructions.join('\n'));
      setObjectives(existing.objectives.join('\n'));
      setDue(format(new Date(existing.dueDate), "yyyy-MM-dd'T'HH:mm"));
    }
    // Only re-sync when navigating to a different assignment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  if (assignmentId && !existing) {
    return <EmptyState icon={<FileQuestionIcon />} title="Assignment not found" action={<LinkButton to="/teacher/assignments">All assignments</LinkButton>} />;
  }

  const course = courses.find((c) => c.id === draft.courseId);
  const set = <K extends keyof Assignment,>(key: K, value: Assignment[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const dueDate = new Date(due);
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (!course) next.course = 'Choose a course.';
    if (!course?.lessons.some((l) => l.id === draft.lessonId)) next.lesson = 'Choose a lesson from this course.';
    if (!draft.summary.trim()) next.summary = 'Add a one-line summary.';
    if (lines(instructions).length === 0) next.instructions = 'Add at least one instruction.';
    if (Number.isNaN(dueDate.getTime())) next.due = 'Enter a valid date and time.';
    if (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 100) next.points = 'Points must be 1–100.';
    if (draft.criteria.length === 0) next.criteria = 'Add at least one criterion.';else
    if (draft.criteria.some((c) => !c.text.trim())) next.criteria = 'Every criterion needs a description.';
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Check the highlighted fields');
      return;
    }
    upsertAssignment({
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      instructions: lines(instructions),
      objectives: lines(objectives),
      criteria: draft.criteria.map((c) => ({ ...c, text: c.text.trim() })),
      dueDate: dueDate.toISOString()
    });
    toast.success(existing ? 'Assignment updated' : 'Assignment created', { description: 'Saved to demo storage in this browser.' });
    navigate('/teacher/assignments');
  };

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-9">
      <Link to="/teacher/assignments" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <ChevronLeftIcon className="h-4 w-4" aria-hidden /> Assignments
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink">{existing ? 'Edit assignment' : 'New assignment'}</h1>
        <DemoTag label="Local demo storage" />
      </div>

      <form onSubmit={submit} noValidate className="mt-8 space-y-8">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={errors.title} className="sm:col-span-2">
            {(p) => <input {...p} className={inputClasses} value={draft.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Course" error={errors.course}>
            {(p) =>
            <select
              {...p}
              className={inputClasses}
              value={draft.courseId}
              onChange={(e) => {
                const c = courses.find((x) => x.id === e.target.value);
                setDraft((d) => ({ ...d, courseId: e.target.value, lessonId: c?.lessons[0]?.id ?? '' }));
              }}>
              
                {courses.map((c) =>
              <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
              )}
              </select>
            }
          </Field>
          <Field label="Lesson" error={errors.lesson}>
            {(p) =>
            <select {...p} className={inputClasses} value={draft.lessonId} onChange={(e) => set('lessonId', e.target.value)}>
                {course?.lessons.length ? null : <option value="">No lessons in this course</option>}
                {course?.lessons.map((l) =>
              <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
              )}
              </select>
            }
          </Field>
          <Field label="Summary" error={errors.summary} className="sm:col-span-2">
            {(p) => <input {...p} className={inputClasses} value={draft.summary} onChange={(e) => set('summary', e.target.value)} />}
          </Field>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Instructions" hint="One step per line." error={errors.instructions}>
            {(p) => <textarea {...p} rows={6} className={inputClasses} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}
          </Field>
          <Field label="Learning objectives" hint="One per line.">
            {(p) => <textarea {...p} rows={6} className={inputClasses} value={objectives} onChange={(e) => setObjectives(e.target.value)} />}
          </Field>
        </section>

        <CriteriaEditor criteria={draft.criteria} onChange={(c) => set('criteria', c)} error={errors.criteria} />

        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Due" error={errors.due}>
            {(p) => <input {...p} type="datetime-local" className={inputClasses} value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
          <Field label="Points" error={errors.points}>
            {(p) => <input {...p} type="number" min={1} max={100} className={inputClasses} value={draft.points} onChange={(e) => set('points', Number(e.target.value))} />}
          </Field>
          <Field label="Starter program">
            {(p) =>
            <select {...p} className={inputClasses} value={draft.starterId ?? 'blank'} onChange={(e) => set('starterId', e.target.value)}>
                {starterPrograms.map((s) =>
              <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
              )}
              </select>
            }
          </Field>
        </section>

        <div className="max-w-md">
          <Switch checked={draft.published} onChange={(v) => set('published', v)} label="Published" description="Published assignments appear on student dashboards in this browser." />
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <LinkButton to="/teacher/assignments" variant="ghost">
            Cancel
          </LinkButton>
          <Button type="submit" variant="primary">
            {existing ? 'Save changes' : 'Create assignment'}
          </Button>
        </div>
      </form>
    </div>);

}