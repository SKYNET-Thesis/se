import React, { useEffect, useState } from 'react';
import type { Lesson } from '../../types/learning';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { createId } from '../../utils/id';

interface LessonEditorDialogProps {
  open: boolean;
  lesson: Lesson | null;
  onClose: () => void;
  onSave: (lesson: Lesson) => void;
}

type Errors = Partial<Record<'title' | 'minutes' | 'summary' | 'objectives', string>>;

export function LessonEditorDialog({ open, lesson, onClose, onSave }: LessonEditorDialogProps) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('20');
  const [summary, setSummary] = useState('');
  const [objectives, setObjectives] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const extraSections = lesson?.sections.filter((s) => s.kind !== 'text') ?? [];

  useEffect(() => {
    if (!open) return;
    setTitle(lesson?.title ?? '');
    setMinutes(String(lesson?.minutes ?? 20));
    setSummary(lesson?.summary ?? '');
    setObjectives(lesson?.objectives.join('\n') ?? '');
    setBody(
      lesson?.sections.
      filter((s): s is Extract<Lesson['sections'][number], {kind: 'text';}> => s.kind === 'text').
      map((s) => s.heading ? `## ${s.heading}\n${s.body}` : s.body).
      join('\n\n') ?? ''
    );
    setErrors({});
  }, [open, lesson]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const mins = Number(minutes);
    const objectiveList = objectives.split('\n').map((o) => o.trim()).filter(Boolean);
    if (!title.trim()) next.title = 'Title is required.';
    if (!Number.isInteger(mins) || mins < 5 || mins > 240) next.minutes = 'Enter 5–240 minutes.';
    if (!summary.trim()) next.summary = 'A one-line summary helps students choose.';
    if (objectiveList.length === 0) next.objectives = 'Add at least one learning objective.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const textSections = body.
    split(/\n\s*\n/).
    map((chunk) => chunk.trim()).
    filter(Boolean).
    map((chunk) => {
      const m = chunk.match(/^##\s+(.+)\n([\s\S]+)$/);
      return m ? { kind: 'text' as const, heading: m[1].trim(), body: m[2].trim() } : { kind: 'text' as const, body: chunk };
    });

    onSave({
      id: lesson?.id ?? createId('lesson'),
      title: title.trim(),
      minutes: mins,
      summary: summary.trim(),
      objectives: objectiveList,
      sections: [...textSections, ...extraSections]
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={lesson ? 'Edit lesson' : 'New lesson'}
      description="Saved to demo storage in this browser."
      footer={
      <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="lesson-form">
            Save lesson
          </Button>
        </>
      }>
      
      <form id="lesson-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Title" error={errors.title}>
          {(p) => <input {...p} className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />}
        </Field>
        <Field label="Minutes" error={errors.minutes}>
          {(p) => <input {...p} type="number" min={5} max={240} className={inputClasses} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
        </Field>
        <Field label="Summary" error={errors.summary} className="sm:col-span-2">
          {(p) => <input {...p} className={inputClasses} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <Field label="Learning objectives" hint="One per line." error={errors.objectives} className="sm:col-span-2">
          {(p) => <textarea {...p} rows={3} className={inputClasses} value={objectives} onChange={(e) => setObjectives(e.target.value)} />}
        </Field>
        <Field
          label="Lesson text"
          hint={`Separate paragraphs with a blank line. Start a paragraph with "## Heading" to title it.${extraSections.length ? ` ${extraSections.length} callout/step/term section(s) are kept as they are.` : ''}`}
          className="sm:col-span-2">
          
          {(p) => <textarea {...p} rows={8} className={`${inputClasses} font-mono text-[13px]`} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      </form>
    </Dialog>);

}