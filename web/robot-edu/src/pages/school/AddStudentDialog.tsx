import { useState } from 'react';
import { CopyIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClasses } from '../../components/ui/Field';
import { educationAdminApi, type ApiSchoolImportResult } from '../../lib/api';

type Outcome =
  | { kind: 'temporary'; schoolCode: string | null; studentCode: string; password: string; expiresAt: string | null }
  | { kind: 'setup'; schoolCode: string | null; studentCode: string; setupCode: string }
  | { kind: 'exists' }
  | { kind: 'pending' };

const EMPTY = { firstName: '', lastName: '', studentCode: '', gradeLevel: '', email: '' };

/** Create ONE student through the same provisioning path as the CSV importer, then show the one-time credential. */
export function AddStudentDialog({ open, organizationId, token, onClose, onCreated }: { open: boolean; organizationId: string; token: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const close = () => { setForm(EMPTY); setError(null); setOutcome(null); setCopied(null); onClose(); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null); setBusy(true);
    try {
      const result: ApiSchoolImportResult = await educationAdminApi.importUsers(organizationId, token, {
        kind: 'students',
        rows: [{ firstName: form.firstName.trim(), lastName: form.lastName.trim(), studentCode: form.studentCode.trim(), gradeLevel: form.gradeLevel.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}) }],
      });
      const row = result.results[0];
      if (!row || row.status === 'failed') { setError(row?.message ?? 'The student could not be created. Check the fields and try again.'); return; }
      if (row.credentialProvisioningPending) setOutcome({ kind: 'pending' });
      else if (row.temporaryPassword) setOutcome({ kind: 'temporary', schoolCode: result.schoolCode ?? null, studentCode: row.studentCode ?? form.studentCode.trim(), password: row.temporaryPassword, expiresAt: row.temporaryPasswordExpiresAt ?? null });
      else if (row.setupCode) setOutcome({ kind: 'setup', schoolCode: result.schoolCode ?? null, studentCode: row.studentCode ?? form.studentCode.trim(), setupCode: row.setupCode });
      else setOutcome({ kind: 'exists' });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The student could not be created.');
    } finally { setBusy(false); }
  };

  const copy = (text: string) => { void navigator.clipboard.writeText(text).then(() => setCopied('done')).catch(() => setCopied('failed')); };
  const credentialText = outcome?.kind === 'temporary' ? `${outcome.schoolCode ?? '—'} | ${outcome.studentCode} | ${outcome.password}` : outcome?.kind === 'setup' ? `${outcome.schoolCode ?? '—'} | ${outcome.studentCode} | ${outcome.setupCode}` : '';

  return <Dialog open={open} onClose={close} title="Add student" description={outcome ? undefined : 'Creates the student account and gives you a one-time credential to hand over.'}
    footer={outcome
      ? <>{credentialText && <Button variant="secondary" icon={<CopyIcon className="h-4 w-4" />} onClick={() => copy(credentialText)}>{copied === 'done' ? 'Copied' : 'Copy credentials'}</Button>}<Button onClick={close}>Done</Button></>
      : <><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" form="add-student-form" loading={busy} disabled={!form.firstName.trim() || !form.lastName.trim() || !form.studentCode.trim() || !form.gradeLevel.trim()}>Create student</Button></>}>
    {!outcome && <form id="add-student-form" onSubmit={(event) => void submit(event)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">{(p) => <input {...p} required className={inputClasses} value={form.firstName} onChange={set('firstName')} autoComplete="off" />}</Field>
        <Field label="Last name">{(p) => <input {...p} required className={inputClasses} value={form.lastName} onChange={set('lastName')} autoComplete="off" />}</Field>
        <Field label="Student code" hint="Unique in your school. Students sign in with it.">{(p) => <input {...p} required className={inputClasses} value={form.studentCode} onChange={set('studentCode')} autoComplete="off" />}</Field>
        <Field label="Grade">{(p) => <input {...p} required className={inputClasses} value={form.gradeLevel} onChange={set('gradeLevel')} autoComplete="off" />}</Field>
      </div>
      <Field label="Email (optional)">{(p) => <input {...p} type="email" className={inputClasses} value={form.email} onChange={set('email')} autoComplete="off" />}</Field>
      {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </form>}
    {outcome?.kind === 'temporary' && <div className="space-y-3"><p className="text-sm text-ink-muted">Share this with the student securely. It is shown once, is not stored, and must be changed at first sign-in. {outcome.expiresAt ? `It expires ${new Date(outcome.expiresAt).toLocaleString()}.` : ''}</p>
      <div className="rounded-md bg-sunken px-4 py-3"><p className="text-xs text-ink-muted">School code</p><p className="font-mono">{outcome.schoolCode ?? '—'}</p><p className="mt-2 text-xs text-ink-muted">Student code</p><p className="font-mono">{outcome.studentCode}</p><p className="mt-2 text-xs text-ink-muted">Temporary password</p><p className="break-all font-mono text-lg font-semibold">{outcome.password}</p></div>
      {copied === 'failed' && <p role="alert" className="text-sm text-danger">Could not copy. Select the password and copy it manually.</p>}</div>}
    {outcome?.kind === 'setup' && <div className="space-y-3"><p className="text-sm text-ink-muted">Share this one-time Setup Code with the student. They use it once to choose their own password.</p>
      <div className="rounded-md bg-sunken px-4 py-3"><p className="text-xs text-ink-muted">School code</p><p className="font-mono">{outcome.schoolCode ?? '—'}</p><p className="mt-2 text-xs text-ink-muted">Student code</p><p className="font-mono">{outcome.studentCode}</p><p className="mt-2 text-xs text-ink-muted">Setup code</p><p className="break-all font-mono text-lg font-semibold">{outcome.setupCode}</p></div>
      {copied === 'failed' && <p role="alert" className="text-sm text-danger">Could not copy. Select the code and copy it manually.</p>}</div>}
    {outcome?.kind === 'exists' && <p role="status" className="text-sm text-ink-muted">A student with this code already exists in your school, so nothing was changed and no new credential was issued. To give an existing student a new temporary password, use <strong>Reissue temporary password</strong> in the people list.</p>}
    {outcome?.kind === 'pending' && <p role="status" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">This account is still being finished. No credential was handed out. Try adding the same student again in a minute.</p>}
  </Dialog>;
}
