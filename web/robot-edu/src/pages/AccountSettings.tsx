import { useState } from 'react';
import { isInternalAlias, useDisplayName } from '../lib/displayName';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { useRole } from '../contexts/RoleContext';
import { passwordProblem } from '../lib/passwordPolicy';

/** Password change for accounts that sign in with an e-mail address. The current password is verified first; other sessions are signed out afterwards. */
function StaffPasswordChange({ email }: { email: string }) {
  const { client } = useSupabaseSession();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setDone(false);
    const problem = passwordProblem(next, confirmation, current); if (problem) { setError(problem); return; }
    if (!client) { setError('Session manager is unavailable. Sign in again.'); return; }
    setBusy(true);
    try {
      const verified = await client.auth.signInWithPassword({ email, password: current });
      if (verified.error) throw new Error('Your current password is incorrect.');
      const { error: updateError } = await client.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      await client.auth.signOut({ scope: 'others' });
      setCurrent(''); setNext(''); setConfirmation(''); setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The password could not be changed. Please try again.'); } finally { setBusy(false); }
  };
  const field = 'mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent';
  return <form aria-label="Change password" className="mt-4 max-w-md space-y-4" onSubmit={(event) => void submit(event)}>
    <label className="block text-sm font-medium text-ink">Current password<input required autoComplete="current-password" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} className={field} /></label>
    <label className="block text-sm font-medium text-ink">New password<input required minLength={12} autoComplete="new-password" type="password" value={next} onChange={(event) => setNext(event.target.value)} className={field} /></label>
    <label className="block text-sm font-medium text-ink">Confirm new password<input required minLength={12} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={field} /></label>
    {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {done && <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok">Password changed. Your other sessions were signed out.</p>}
    <Button type="submit" variant="primary" loading={busy}>Change password</Button>
  </form>;
}

export function AccountSettings() {
  const { session } = useSupabaseSession(); const { role } = useRole(); const name = useDisplayName('VISTA account');
  const alias = isInternalAlias(session?.user.email);
  return <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
    <PageHeader title="Account Settings" description="Your authenticated VISTA identity." />
    <section aria-label="Identity" className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface px-5 text-sm shadow-hairline">
      <div className="py-4"><p className="text-ink-muted">Name</p><p className="mt-1 font-medium text-ink">{String(name)}</p></div>
      <div className="py-4"><p className="text-ink-muted">Email</p><p className="mt-1 font-medium text-ink">{alias ? 'No email on file (school code sign-in)' : session?.user.email}</p></div>
      <div className="py-4"><p className="text-ink-muted">Current role</p><p className="mt-1 font-medium capitalize text-ink">{role?.replace('_', ' ')}</p></div>
    </section>
    <section aria-labelledby="security-heading" className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6">
      <h2 id="security-heading" className="text-lg font-semibold text-ink">Password</h2>
      {alias
        ? <p className="mt-2 text-sm text-ink-muted">You sign in with your school code and student code. If you forgot your password, ask your school administrator for a one-time Recovery Code and use &ldquo;Forgot password?&rdquo; on the Student Code tab of the sign-in page.</p>
        : session?.user.email ? <StaffPasswordChange email={session.user.email} /> : null}
    </section>
  </main>;
}
