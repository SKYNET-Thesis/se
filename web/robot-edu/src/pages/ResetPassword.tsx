import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { Button } from '../components/ui/Button';
import { passwordFormState, passwordProblem } from '../lib/passwordPolicy';
import { PasswordFields } from '../components/auth/PasswordFields';

/**
 * Landing page of the e-mailed recovery link. The form is shown ONLY when the browser arrived through a recovery link
 * (the session context records Supabase's PASSWORD_RECOVERY event, which is emitted only after a genuine recovery token was validated; a `type=recovery` URL fragment alone proves nothing); an ordinary signed-in visitor
 * or an expired/used link sees an explanation instead and is never offered a password change without proof.
 * On success every session of the account is revoked and the user signs in again with the new password.
 */
export function ResetPassword() {
  const { client, session, loading, passwordRecovery } = useSupabaseSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  if (loading) return <main className="p-8 text-sm text-ink-muted" role="status">Checking your reset link…</main>;
  if (!passwordRecovery || !session || !client) {
    return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-ink">This reset link cannot be used</h1>
      <p role="alert" className="mt-3 text-sm text-ink-muted">The link is invalid, has expired, or was already used. Request a new one. If you are signed in and just want to change your password, use Account Settings.</p>
      <p className="mt-6 flex gap-4 text-sm"><Link to="/forgot-password" className="font-medium text-accent underline underline-offset-4">Request a new link</Link><Link to="/login" className="font-medium text-accent underline underline-offset-4">Back to sign in</Link></p>
    </section></main>;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError(null);
    const problem = passwordProblem(password, confirmation); if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      await client.auth.signOut({ scope: 'global' });                       // revoke every session, including the recovery one
      navigate('/login?reason=PASSWORD_RESET', { replace: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The password could not be changed. Request a new link and try again.'); } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Account recovery</p>
    <h1 className="mt-2 text-2xl font-semibold text-ink">Choose a new password</h1>
    <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
      <PasswordFields value={password} confirmation={confirmation} onValue={setPassword} onConfirmation={setConfirmation} disabled={busy} />
      {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} disabled={!passwordFormState(password, confirmation).valid || busy} className="w-full">{busy ? 'Updating password…' : 'Update password'}</Button>
    </form>
  </section></main>;
}
