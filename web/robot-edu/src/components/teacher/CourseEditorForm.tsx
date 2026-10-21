import React, { useEffect, useState } from 'react';
import type { Course, CourseLevel } from '../../types/learning';
import { Button } from '../ui/Button';
import { Field, inputClasses } from '../ui/Field';
import { Switch } from '../ui/Switch';

interface CourseEditorFormProps {
  course: Course;
  onSave: (course: Course) => void;
}

const LEVELS: CourseLevel[] = ['Introductory', 'Intermediate', 'Advanced'];

export function CourseEditorForm({ course, onSave }: CourseEditorFormProps) {
  const [draft, setDraft] = useState(course);
  const [errors, setErrors] = useState<{title?: string;code?: string;summary?: string;}>({});

  useEffect(() => {
    setDraft(course);
    setErrors({});
  }, [course]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(course);
  const set = <K extends keyof Course,>(key: K, value: Course[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (!/^[A-Z]{2,5}\s?\d{2,4}$/.test(draft.code.trim())) next.code = 'Use a code like “ROB 101”.';
    if (draft.summary.trim().length < 20) next.summary = 'Write at least a short sentence (20+ characters).';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ ...draft, title: draft.title.trim(), code: draft.code.trim(), summary: draft.summary.trim() });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[140px_1fr_180px]">
      <Field label="Code" error={errors.code}>
        {(p) => <input {...p} className={inputClasses} value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />}
      </Field>
      <Field label="Title" error={errors.title}>
        {(p) => <input {...p} className={inputClasses} value={draft.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <Field label="Level">
        {(p) =>
        <select {...p} className={inputClasses} value={draft.level} onChange={(e) => set('level', e.target.value as CourseLevel)}>
            {LEVELS.map((l) =>
          <option key={l}>{l}</option>
          )}
          </select>
        }
      </Field>
      <Field label="Summary" error={errors.summary} className="sm:col-span-3">
        {(p) => <textarea {...p} rows={2} className={inputClasses} value={draft.summary} onChange={(e) => set('summary', e.target.value)} />}
      </Field>
      <div className="sm:col-span-2">
        <Switch checked={draft.published} onChange={(v) => set('published', v)} label="Published" description="Published courses appear in the student catalogue." />
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(course)}>
          Discard
        </Button>
        <Button type="submit" variant="primary" disabled={!dirty}>
          Save course
        </Button>
      </div>
    </form>);

}