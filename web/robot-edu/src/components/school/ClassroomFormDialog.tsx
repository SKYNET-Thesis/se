import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { educationAdminApi, type ApiSchoolClassroom } from '../../lib/api';
import {
  CLASSROOM_LIMITS, apiErrorPresentation, classroomFormFrom, emptyClassroomForm, firstErrorField, validateClassroomForm,
  type ClassroomFormErrors, type ClassroomFormField, type ClassroomFormMode, type ClassroomFormValues,
} from '../../queries/classroomsModel';
import type { SchoolScope } from '../../queries/schoolClassrooms';
import { ClassroomCodeTag } from './ClassroomBadges';

interface Props {
  open: boolean;
  mode: ClassroomFormMode;
  scope: SchoolScope;
  classroom?: ApiSchoolClassroom | null;
  pending: boolean;
  onSubmit: (values: ClassroomFormValues) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Create and edit share one form. Client checks mirror the DTO limits; the server answer is final and shown inside the
 * dialog, on the field it belongs to when it can be placed. Input is kept on every failure.
 */
export function ClassroomFormDialog({ open, mode, scope, classroom, pending, onSubmit, onClose }: Props) {
  const initial = mode === 'edit' && classroom ? classroomFormFrom(classroom) : emptyClassroomForm;
  const [values, setValues] = useState<ClassroomFormValues>(initial);
  const [touched, setTouched] = useState<Partial<Record<ClassroomFormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<{ field?: ClassroomFormField; message: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setValues(initial); setTouched({}); setSubmitted(false); setServer(null); setConfirmDiscard(false);
    // Reset only when the dialog opens or targets another classroom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, classroom?.id]);

  const courses = useQuery({
    queryKey: ['school-admin', scope.organizationId, 'published-courses'],
    queryFn: () => educationAdminApi.publishedCourses(scope.organizationId, scope.token),
    enabled: open && mode === 'create' && Boolean(scope.organizationId && scope.token),
  });

  const errors: ClassroomFormErrors = validateClassroomForm(values, mode, classroom?.capacity ?? null);
  const dirty = (Object.keys(values) as ClassroomFormField[]).some((field) => values[field] !== initial[field]);
  const shown = (field: ClassroomFormField) => (server?.field === field ? server.message : (touched[field] || submitted) ? errors[field] : undefined);
  const focusField = (field?: ClassroomFormField) => { if (field) window.setTimeout(() => formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus(), 0); };

  const change = (field: ClassroomFormField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const next = event.target.value;
    setValues((current) => ({ ...current, [field]: next }));
    if (server && (server.field === field || !server.field)) setServer(null);
  };
  const blur = (field: ClassroomFormField) => () => setTouched((current) => ({ ...current, [field]: true }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true); setServer(null);
    const first = firstErrorField(errors);
    if (first) { focusField(first); return; }
    try { await onSubmit(values); }
    catch (error) { const presented = apiErrorPresentation(error); setServer(presented); focusField(presented.field); }
  };
  const requestClose = () => { if (pending) return; if (dirty) setConfirmDiscard(true); else onClose(); };

  const noCourses = mode === 'create' && courses.isSuccess && courses.data.length === 0;
  const coursesFailed = mode === 'create' && courses.isError;
  const formId = `classroom-form-${mode}`;
  const textInput = (field: ClassroomFormField, label: string, options: { hint?: string; placeholder?: string; code?: boolean; required?: boolean } = {}) => (
    <Field label={`${label}${options.required ? '' : ' (optional)'}`} hint={options.hint} error={shown(field)}>
      {(props) => <input {...props} name={field} value={values[field]} onChange={change(field)} onBlur={blur(field)} placeholder={options.placeholder}
        aria-required={options.required || undefined} autoComplete="off" spellCheck={options.code ? false : undefined}
        className={`${inputClasses} h-10`} />}
    </Field>
  );

  return (
    <Dialog open={open} onClose={requestClose} className="vista-school"
      title={mode === 'create' ? 'Create classroom' : 'Edit classroom'}
      description={mode === 'create'
        ? 'Choose a published course. VISTA creates a school offering for it and assigns it to this classroom.'
        : <span className="inline-flex flex-wrap items-center gap-2">{classroom && <ClassroomCodeTag code={classroom.code} />}Changes keep members, enrollments and learning history.</span>}
      footer={confirmDiscard ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2" role="alertdialog" aria-label="Discard unsaved changes?">
          <p className="text-sm font-medium text-ink">Discard unsaved changes?</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setConfirmDiscard(false)} data-autofocus>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard</Button></div>
        </div>
      ) : (
        <><Button variant="secondary" onClick={requestClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" form={formId} loading={pending} disabled={noCourses || coursesFailed}>{pending ? 'Saving…' : mode === 'create' ? 'Create classroom' : 'Save changes'}</Button></>
      )}>
      <form id={formId} ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {server && !server.field && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{server.message}</p>}
        {server?.field && <p role="alert" className="sr-only">{server.message}</p>}
        {/* Shown before any field so nobody fills the form before learning it cannot be submitted. */}
        {noCourses && (
          <div role="status" className="border-l-4 border-warn bg-warn-soft p-3 text-sm text-ink">
            <p className="font-medium">Classroom creation is unavailable right now.</p>
            <p className="mt-1 text-ink-muted">A classroom needs a course from the VISTA course catalog, and none has been published there yet. Courses that belong only to your school cannot be used here. Ask a System Administrator to publish a catalog course, then try again.</p>
          </div>
        )}
        {coursesFailed && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
            <p>Published courses could not be loaded. Classroom creation needs this list.</p>
            <Button size="sm" variant="secondary" onClick={() => void courses.refetch()} loading={courses.isFetching}>Try again</Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          {textInput('name', 'Classroom name', { required: true, placeholder: 'e.g. Robotics 8A' })}
          {textInput('code', 'Classroom code', { required: true, placeholder: 'e.g. ROB-8A', code: true, hint: 'Unique in your school.' })}
        </div>
        {mode === 'create' && (
          <fieldset className="rounded-md border border-line px-4 pb-4 pt-2">
            <legend className="px-1 text-[13px] font-medium text-ink">Course</legend>
            <div className="space-y-4">
            <Field label="Published course" error={shown('courseId')}>
              {(props) => <select {...props} name="courseId" value={values.courseId} onChange={change('courseId')} onBlur={blur('courseId')} aria-required disabled={courses.isPending || noCourses || coursesFailed} className={`${inputClasses} h-10`}>
                <option value="">{courses.isPending ? 'Loading published courses…' : 'Choose a course'}</option>
                {courses.data?.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              {textInput('offeringCode', 'Offering code', { required: true, placeholder: 'e.g. ROB-2026-8A', code: true })}
              {textInput('offeringTitle', 'Offering title', { placeholder: 'Defaults to the course title' })}
            </div>
            </div>
          </fieldset>
        )}
        <Field label="Description (optional)" error={shown('description')} hint={`${values.description.trim().length} / ${CLASSROOM_LIMITS.description}`}>
          {(props) => <textarea {...props} name="description" value={values.description} onChange={change('description')} onBlur={blur('description')} rows={3} className={`${inputClasses} min-h-20`} />}
        </Field>
        <div className="sm:w-[200px]">
          <Field label="Capacity (optional)" error={shown('capacity')} hint="Maximum number of students.">
            {(props) => <input {...props} name="capacity" type="number" inputMode="numeric" min={CLASSROOM_LIMITS.capacityMin} max={CLASSROOM_LIMITS.capacityMax} step={1}
              value={values.capacity} onChange={change('capacity')} onBlur={blur('capacity')} className={`${inputClasses} h-10 tabular-nums`} />}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
