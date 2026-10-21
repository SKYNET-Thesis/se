import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { starterPrograms } from '../../data/starterPrograms';
import { useLearning } from '../../contexts/LearningContext';
import { cn } from '../../utils/cn';

export interface NewProgramInput {
  name: string;
  starterId: string;
  assignmentId: string | null;
}

interface NewProgramDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProgramInput) => void;
  defaults?: Partial<NewProgramInput>;
}

export function NewProgramDialog({ open, onClose, onCreate, defaults }: NewProgramDialogProps) {
  const { assignments } = useLearning();
  const [name, setName] = useState('');
  const [starterId, setStarterId] = useState('blank');
  const [assignmentId, setAssignmentId] = useState<string>('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(defaults?.name ?? 'Untitled program');
      setStarterId(defaults?.starterId ?? 'blank');
      setAssignmentId(defaults?.assignmentId ?? '');
      setError(undefined);
    }
  }, [open, defaults?.name, defaults?.starterId, defaults?.assignmentId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give your program a name.');
    if (trimmed.length > 60) return setError('Keep the name under 60 characters.');
    onCreate({ name: trimmed, starterId, assignmentId: assignmentId || null });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New program"
      description="Programs are saved in this browser only."
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-program-form">
            Create program
          </Button>
        </>
      }>
      
      <form id="new-program-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" error={error}>
          {(p) => <input {...p} className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink">Start from</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {starterPrograms.map((s) =>
            <label
              key={s.id}
              className={cn(
                'flex cursor-pointer flex-col rounded-md border px-3 py-2.5 transition-colors duration-150',
                starterId === s.id ? 'border-accent bg-accent-soft/60' : 'border-line hover:border-line-strong'
              )}>
              
                <span className="flex items-center gap-2">
                  <input type="radio" name="starter" value={s.id} checked={starterId === s.id} onChange={() => setStarterId(s.id)} className="accent-[rgb(var(--accent))]" />
                  <span className="text-[13px] font-medium text-ink">{s.name}</span>
                </span>
                <span className="mt-0.5 pl-5 text-xs text-ink-muted">{s.description}</span>
              </label>
            )}
          </div>
        </fieldset>
        <Field label="Link to assignment" hint="Linked programs show the assignment brief and live criteria checks.">
          {(p) =>
          <select {...p} className={inputClasses} value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
              <option value="">Free practice (no assignment)</option>
              {assignments.map((a) =>
            <option key={a.id} value={a.id}>
                  {a.title}
                </option>
            )}
            </select>
          }
        </Field>
      </form>
    </Dialog>);

}