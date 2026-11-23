import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { Button } from '../components/ui/Button';

/**
 * Staff password recovery (educators, school administrators, system administrators sign in with an organisational e-mail).
 * Students recover with a one-time Recovery Code from the sign-in page instead. The answer is identical whether or not an account exists,
 * so the form cannot be used to discover which e-mail addresses are registered.
 */
export function ForgotPassword() {
  const { client, configurationError } = useSupabaseSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!client) { setError(configurationError ?? 'Sign-in is not configured.'); return; }
    setBusy(true);
    try {
      const { error: requestError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      // Only a rate limit is reported; every other outcome (unknown address, mail error) looks the same to the visitor.
      if (requestError && (requestError as { status?: number }).status === 429) setError('Too many requests. Please wait a few minutes and try again.');
      else setDone(true);
    } catch { setDone(true); } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Account recovery</p>
    <h1 className="mt-2 text-2xl font-semibold text-ink">Reset your password</h1>
    <p className="mt-2 text-sm text-ink-muted">Enter the organisational e-mail address you sign in with. If an account exists, we will send a link to choose a new password. Students: use &ldquo;Forgot password?&rdquo; on the Student Code tab of the sign-in page.</p>
    {done ? <div role="status" className="mt-6 rounded-md bg-ok-soft p-3 text-sm text-ok">If an account exists for that address, a reset link is on its way. The link is valid for a short time and can be used once.</div> : (
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium text-ink">Email address
          <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-sm text-ink outline-none focus:border-accent" />
        </label>
        {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">Send reset link</Button>
      </form>)}
    <p className="mt-6 text-center text-sm"><Link to="/login" className="font-medium text-accent underline underline-offset-4">Back to sign in</Link></p>
  </section></main>;
}
