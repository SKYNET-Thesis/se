import React, { useEffect, useState } from 'react';
import type { RobotResource } from '../../types/user';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { createId } from '../../utils/id';

interface RobotFormDialogProps {
  open: boolean;
  robot: RobotResource | null;
  onClose: () => void;
  onSave: (robot: RobotResource) => void;
}

export function RobotFormDialog({ open, robot, onClose, onSave }: RobotFormDialogProps) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [location, setLocation] = useState('');
  const [integration, setIntegration] = useState<RobotResource['integration']>('not_configured');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{name?: string;location?: string;}>({});

  useEffect(() => {
    if (!open) return;
    setName(robot?.name ?? '');
    setModel(robot?.model ?? '');
    setLocation(robot?.location ?? '');
    setIntegration(robot?.integration ?? 'not_configured');
    setNotes(robot?.notes ?? '');
    setErrors({});
  }, [open, robot]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (!location.trim()) next.location = 'Location is required.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ id: robot?.id ?? createId('r'), name: name.trim(), model: model.trim() || 'Unspecified', location: location.trim(), integration, notes: notes.trim() });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={robot ? 'Edit robot resource' : 'Register robot resource'}
      description="Registry entry only. It does not connect to the robot."
      footer={
      <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="robot-form">
            Save
          </Button>
        </>
      }>
      
      <form id="robot-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />}
        </Field>
        <Field label="Location" error={errors.location}>
          {(p) => <input {...p} className={inputClasses} value={location} onChange={(e) => setLocation(e.target.value)} />}
        </Field>
        <Field label="Model" className="sm:col-span-2">
          {(p) => <input {...p} className={inputClasses} value={model} onChange={(e) => setModel(e.target.value)} />}
        </Field>
        <Field label="Integration stage" hint="“Connected” becomes available once a verified robot backend reports it." className="sm:col-span-2">
          {(p) =>
          <select {...p} className={inputClasses} value={integration} onChange={(e) => setIntegration(e.target.value as RobotResource['integration'])}>
              <option value="not_configured">Not configured</option>
              <option value="pending_verification">Pending verification</option>
            </select>
          }
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          {(p) => <textarea {...p} rows={3} className={inputClasses} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </form>
    </Dialog>);

}