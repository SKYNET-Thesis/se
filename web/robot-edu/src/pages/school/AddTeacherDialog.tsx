import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClasses } from '../../components/ui/Field';
import { educationAdminApi } from '../../lib/api';

const EMPTY = { firstName: '', lastName: '', employeeCode: '', email: '' };

/** Invite ONE instructor through the same provisioning path as the CSV importer. */
export function AddTeacherDialog({ open, organizationId, token, onClose, onCreated }: { open: boolean; organizationId: string; token: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const close = () => { setForm(EMPTY); setError(null); setDone(null); onClose(); };
  const valid = form.firstName.trim() && form.lastName.trim() && form.employeeCode.trim() && /\S+@\S+\.\S+/.test(form.email.trim());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !valid) return; setError(null); setBusy(true);
    try {
      const result = await educationAdminApi.importUsers(organizationId, token, { kind: 'teachers', rows: [{ firstName: form.firstName.trim(), lastName: form.lastName.trim(), employeeCode: form.employeeCode.trim(), email: form.email.trim() }] });
      const row = result.results[0];
      if (!row || row.status === 'failed') { setError(row?.message ?? 'The instructor could not be added. Check the fields and try again.'); return; }
      setDone(row.status === 'unchanged' ? 'An instructor with this employee code already exists.' : `Invitation sent to ${form.email.trim()}.`); onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={close} title="Add instructor" description="The instructor receives an email invitation and joins this school only.">
      {done ? (<div className="space-y-4"><p role="status" className="text-sm text-ink">{done}</p><Button variant="primary" onClick={close}>Done</Button></div>) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">{(p) => <input {...p} className={inputClasses} value={form.firstName} maxLength={100} onChange={set('firstName')} />}</Field>
            <Field label="Last name">{(p) => <input {...p} className={inputClasses} value={form.lastName} maxLength={100} onChange={set('lastName')} />}</Field>
          </div>
          <Field label="Employee code">{(p) => <input {...p} className={inputClasses} value={form.employeeCode} maxLength={80} onChange={set('employeeCode')} />}</Field>
          <Field label="Email">{(p) => <input {...p} type="email" className={inputClasses} value={form.email} maxLength={254} onChange={set('email')} />}</Field>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add instructor'}</Button></div>
        </form>)}
    </Dialog>
  );
}
