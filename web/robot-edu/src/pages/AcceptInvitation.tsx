import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { identityApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { passwordFormState, passwordProblem } from '../lib/passwordPolicy';
import { PasswordFields } from '../components/auth/PasswordFields';

/**
 * Landing page of the e-mailed INVITATION link (Supabase "Invite user", redirect_to = /accept-invitation).
 * The invited person arrives signed in by the link but with NO password; this page makes them choose one (Password + Confirm, same policy as everywhere),
 * then calls the API once so the account is activated server-side (invited -> active, which needs a valid role membership) and continues into the
 * correct role workspace. The form is offered only when supabase-js validated the invitation token in this browser (see SupabaseSessionContext);
 * an expired, reused or forged link gets an explanation and never a password form.
 */
export function AcceptInvitation() {
  const { client, session, loading, invitationSetup, invitationLinkError, completeInvitation } = useSupabaseSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  if (loading) return <main className="p-8 text-sm text-ink-muted" role="status">Checking your invitation…</main>;
  if (!invitationSetup || !session || !client) {
    const expired = invitationLinkError === 'otp_expired' || invitationLinkError === 'access_denied';
    return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-ink">{expired ? 'This invitation has expired or was already used' : 'This invitation link cannot be used'}</h1>
      <p role="alert" className="mt-3 text-sm text-ink-muted">Ask your administrator to send a new invitation. If you already chose a password, sign in with it instead.</p>
      <p className="mt-6 text-sm"><Link to="/login" className="font-medium text-accent underline underline-offset-4">Go to sign in</Link></p>
    </section></main>;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError(null);
    const problem = passwordProblem(password, confirmation); if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      const { data } = await client.auth.getSession();
      if (!data.session) throw new Error('Your session ended. Open the invitation link again.');
      await identityApi.roles(data.session.access_token);          // first API call activates the invited account on the server (needs an active role membership)
      completeInvitation();
      navigate('/', { replace: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The password could not be saved. Open the invitation link again.'); } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm" aria-labelledby="accept-title">
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Invitation</p>
    <h1 id="accept-title" className="mt-2 text-2xl font-semibold text-ink">Choose your password</h1>
    <p className="mt-2 text-sm text-ink-muted">Welcome{session.user.email ? `, ${session.user.email}` : ''}. Choose the password you will use to sign in from now on.</p>
    <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
      <PasswordFields value={password} confirmation={confirmation} onValue={setPassword} onConfirmation={setConfirmation} disabled={busy} />
      {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} disabled={!passwordFormState(password, confirmation).valid || busy} className="w-full">{busy ? 'Saving…' : 'Set password and continue'}</Button>
    </form>
  </section></main>;
}
