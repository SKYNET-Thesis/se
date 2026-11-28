import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, KeyRoundIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { staffAccountApi, type ApiStaffCredential } from '../../lib/api';

type Role = 'school_admin' | 'instructor';
const ROLE_LABEL: Record<Role, string> = { school_admin: 'School Administrator', instructor: 'Instructor' };

/** True only when the server can really enforce the first-login password gate (so "Create account" is never offered without it). */
export function useStaffDirectAccounts() {
  const caps = useQuery({ queryKey: ['staff-direct-accounts-capability'], queryFn: staffAccountApi.capabilities, staleTime: 60_000 });
  return caps.data?.staffDirectAccountsEnabled === true;
}

/** Shows temporary credentials exactly once. The password lives only in this component's state and is discarded on close. */
export function CredentialReveal({ credential, onDone }: { credential: ApiStaffCredential; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Sign-in: ${credential.email}\nTemporary password: ${credential.temporaryPassword}`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="space-y-4" data-testid="staff-credentials">
      <p role="status" className="text-sm text-ink">Account created for <strong>{credential.fullName}</strong> ({ROLE_LABEL[credential.role]}). Give these credentials to the user through a secure channel.</p>
      <dl className="rounded-md border border-line bg-surface-muted p-3 text-sm">
        <div className="flex gap-2"><dt className="w-40 text-ink-muted">Sign-in (e-mail)</dt><dd className="font-mono text-ink">{credential.email}</dd></div>
        <div className="mt-1 flex gap-2"><dt className="w-40 text-ink-muted">Temporary password</dt><dd className="break-all font-mono text-ink" data-testid="temporary-password">{credential.temporaryPassword}</dd></div>
        {credential.temporaryPasswordExpiresAt ? <div className="mt-1 flex gap-2"><dt className="w-40 text-ink-muted">Expires</dt><dd className="text-ink">{new Date(credential.temporaryPasswordExpiresAt).toLocaleString()}</dd></div> : null}
      </dl>
      <p className="text-xs text-danger">This password is shown only once and is not stored. The user must choose a new password at the first sign-in.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" icon={<CopyIcon className="h-4 w-4" />} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy credentials'}</Button>
        <Button variant="primary" onClick={onDone}>I have saved them</Button>
      </div>
    </div>
  );
}

/**
 * Two independent provisioning methods for one role:
 *  - Create account: server generates a temporary password (works without e-mail);
 *  - Send invitation: Supabase e-mail invitation.
 */
export function StaffAccountDialog({ open, mode, role, organizationId, token, onClose, onChanged }: { open: boolean; mode: 'direct' | 'invite'; role: Role; organizationId: string; token: string; onClose: () => void; onChanged: () => void }) {
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [employeeCode, setEmployeeCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<ApiStaffCredential | null>(null); const [invited, setInvited] = useState<string | null>(null);
  useEffect(() => { if (!open) { setFullName(''); setEmail(''); setEmployeeCode(''); setError(null); setCredential(null); setInvited(null); } }, [open]);
  const valid = fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && (role !== 'instructor' || employeeCode.trim().length > 0);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !valid) return; setError(null); setBusy(true);
    try {
      const result = await staffAccountApi.create(token, organizationId, { method: mode, role, fullName: fullName.trim(), email: email.trim(), ...(role === 'instructor' ? { employeeCode: employeeCode.trim() } : {}) });
      if (mode === 'direct') setCredential(result); else setInvited(result.email);
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The request failed.'); } finally { setBusy(false); }
  };
  const title = mode === 'direct' ? `Create ${ROLE_LABEL[role]} account` : `Send invitation to a ${ROLE_LABEL[role]}`;
  const description = mode === 'direct'
    ? 'A temporary password is generated now. The person must replace it at the first sign-in. No e-mail is needed.'
    : 'The person receives an e-mail invitation and chooses their own password.';
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {credential ? <CredentialReveal credential={credential} onDone={onClose} /> : invited ? (
        <div className="space-y-4"><p role="status" className="text-sm text-ink">Invitation sent to {invited}. The account stays <strong>Pending invitation</strong> until they set a password.</p><Button variant="primary" onClick={onClose}>Done</Button></div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label="Full name">{(p) => <input {...p} className={inputClasses} value={fullName} maxLength={160} onChange={(e) => setFullName(e.target.value)} />}</Field>
          <Field label="E-mail (sign-in)">{(p) => <input {...p} type="email" className={inputClasses} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />}</Field>
          {role === 'instructor' ? <Field label="Employee code">{(p) => <input {...p} className={inputClasses} value={employeeCode} maxLength={64} onChange={(e) => setEmployeeCode(e.target.value)} />}</Field> : null}
          <p className="text-xs text-ink-muted">Role: {ROLE_LABEL[role]} · assigned to this school only.</p>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<KeyRoundIcon className="h-4 w-4" />} disabled={!valid || busy}>{busy ? 'Working…' : mode === 'direct' ? 'Create account' : 'Send invitation'}</Button></div>
        </form>)}
    </Dialog>
  );
}

/** Row actions for accounts that need help: recover a never-signed-in invitation, or re-issue pending temporary credentials. */
export function StaffCredentialAction({ kind, organizationId, userId, name, token, onChanged }: { kind: 'recover' | 'reset' | 'resend'; organizationId: string; userId: string; name: string; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [credential, setCredential] = useState<ApiStaffCredential | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const run = async () => {
    if (busy) return; setError(null); setNotice(null); setBusy(true);
    try { if (kind === 'resend') { const r = await staffAccountApi.resendInvitation(token, organizationId, userId); setNotice(`Invitation sent again to ${r.email}.`); onChanged(); return; } const r = kind === 'recover' ? await staffAccountApi.recoverPending(token, organizationId, userId) : await staffAccountApi.resetCredentials(token, organizationId, userId); setCredential(r); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The request failed.'); } finally { setBusy(false); }
  };
  return (<>
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run()} aria-label={`${kind === 'recover' ? 'Recover pending account of' : kind === 'resend' ? 'Resend invitation to' : 'Reset temporary credentials of'} ${name}`}>{kind === 'recover' ? 'Recover pending account' : kind === 'resend' ? 'Resend invitation' : 'Reset temporary credentials'}</Button>
    {notice ? <span role="status" className="text-xs text-ok">{notice}</span> : null}
    {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    <Dialog open={credential !== null} onClose={() => setCredential(null)} title="New temporary credentials">{credential ? <CredentialReveal credential={credential} onDone={() => setCredential(null)} /> : null}</Dialog>
  </>);
}
