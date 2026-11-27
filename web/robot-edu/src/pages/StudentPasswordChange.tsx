import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentAuthApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { PasswordFields } from '../components/auth/PasswordFields';
import { passwordFormState } from '../lib/passwordPolicy';

export function StudentPasswordChange() {
  const { client, session, loading } = useSupabaseSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading) return <main className="p-8" role="status">Loading your session…</main>;
  if (!session) return <Navigate to="/login" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError(null);
    if (newPassword.length < 12) { setError('Choose a password with at least 12 characters.'); return; }
    if (newPassword !== confirmation) { setError('The passwords do not match.'); return; }
    if (newPassword === currentPassword) { setError('Your new password must differ from the temporary password.'); return; }
    setBusy(true);
    try {
      const next = await studentAuthApi.changePassword(session.access_token, { currentPassword, newPassword });
      if (!client) throw new Error('Session manager is unavailable. Sign in again.');
      const { error: sessionError } = await client.auth.setSession({ access_token: next.access_token, refresh_token: next.refresh_token });
      if (sessionError) throw sessionError;
      navigate('/my-learning', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Password change failed. Please try again.');
    } finally { setBusy(false); }
  };

  const state = passwordFormState(newPassword, confirmation, currentPassword);
  const canSubmit = currentPassword.length > 0 && state.valid && !busy;
  return <main className="min-h-screen bg-[#f5f5f1] px-4 py-8 sm:py-12"><section className="mx-auto w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7" aria-labelledby="change-password-title">
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Student account security</p><h1 id="change-password-title" className="mt-2 text-2xl font-semibold text-ink">Choose a new password</h1>
    <p className="mt-2 text-sm text-ink-muted">Your school gave you a temporary password. Set a password only you know before you continue to your learning space.</p>
    <form className="mt-6 space-y-5" onSubmit={event => void submit(event)} noValidate>
      <div>
        <label htmlFor="current-password" className="block text-sm font-medium text-ink">Temporary password</label>
        <div className="relative mt-1">
          <input id="current-password" required autoComplete="current-password" disabled={busy} type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="block w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 pr-11 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25" />
          <button type="button" onClick={() => setShowCurrent(v => !v)} aria-pressed={showCurrent} aria-label={showCurrent ? 'Hide temporary password' : 'Show temporary password'} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{showCurrent ? <EyeOffIcon className="h-4 w-4" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}</button>
        </div>
      </div>
      <PasswordFields value={newPassword} confirmation={confirmation} onValue={setNewPassword} onConfirmation={setConfirmation} current={currentPassword} disabled={busy} />
      {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full">{busy ? 'Updating password…' : 'Update password'}</Button>
      <p className="text-center text-xs text-ink-muted">After the change, your temporary password stops working.</p>
    </form>
  </section></main>;
}
