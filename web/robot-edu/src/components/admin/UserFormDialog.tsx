import React, { useEffect, useState } from 'react';
import type { DemoUser, Role } from '../../types/user';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { createId } from '../../utils/id';

interface UserFormDialogProps {
  open: boolean;
  user: DemoUser | null;
  existingEmails: string[];
  onClose: () => void;
  onSave: (user: DemoUser) => void;
}

type Errors = Partial<Record<'name' | 'email' | 'group', string>>;

export function UserFormDialog({ open, user, existingEmails, onClose, onSave }: UserFormDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [status, setStatus] = useState<DemoUser['status']>('invited');
  const [group, setGroup] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'student');
    setStatus(user?.status ?? 'invited');
    setGroup(user?.group ?? '');
    setErrors({});
  }, [open, user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const normalized = email.trim().toLowerCase();
    if (name.trim().length < 2) next.name = 'Enter a full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) next.email = 'Enter a valid email address.';else
    if (existingEmails.includes(normalized) && normalized !== user?.email) next.email = 'A user with this email already exists.';
    if (!group.trim()) next.group = 'Enter a class or department.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ id: user?.id ?? createId('u'), name: name.trim(), email: normalized, role, status, group: group.trim(), lastActive: user?.lastActive ?? null });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? 'Edit user' : 'Add demo user'}
      description="Demo directory only. No invitation email is sent and no account is created."
      footer={
      <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form">
            {user ? 'Save user' : 'Add user'}
          </Button>
        </>
      }>
      
      <form id="user-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          {(p) => <input {...p} className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <input {...p} type="email" className={inputClasses} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Role">
          {(p) =>
          <select {...p} className={inputClasses} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Administrator</option>
            </select>
          }
        </Field>
        <Field label="Status">
          {(p) =>
          <select {...p} className={inputClasses} value={status} onChange={(e) => setStatus(e.target.value as DemoUser['status'])}>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          }
        </Field>
        <Field label="Class or department" error={errors.group} className="sm:col-span-2">
          {(p) => <input {...p} className={inputClasses} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Year 10 · Robotics A" />}
        </Field>
      </form>
    </Dialog>);

}