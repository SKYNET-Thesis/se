import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentAuthApi } from '../lib/api';
import { Button } from '../components/ui/Button';

export function StudentPasswordChange() {
  const { client, session, loading } = useSupabaseSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading) return <main className="p-8" role="status">Loading your session…</main>;
  if (!session) return <Navigate to="/login" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
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

  return <main className="min-h-screen bg-[#f5f5f1] px-4 py-10"><section className="mx-auto max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Student account security</p><h1 className="mt-2 text-2xl font-semibold text-ink">Choose a new password</h1>
    <p className="mt-2 text-sm text-ink-muted">Change your temporary password to continue to your learning space.</p>
    <form className="mt-6 space-y-4" onSubmit={event => void submit(event)}>
      <label className="block text-sm font-medium">Temporary password<input required autoComplete="current-password" type={show ? 'text' : 'password'} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-line-strong bg-white px-3" /></label>
      <label className="block text-sm font-medium">New password<div className="relative mt-1"><input required minLength={12} autoComplete="new-password" type={show ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="h-11 w-full rounded-lg border border-line-strong bg-white px-3 pr-12" /><button type="button" onClick={() => setShow(value => !value)} aria-label={show ? 'Hide passwords' : 'Show passwords'} className="absolute right-2 top-2.5 p-1">{show ? <EyeOffIcon size={18}/> : <EyeIcon size={18}/>}</button></div><span className="mt-1 block text-xs text-ink-muted">At least 12 characters</span></label>
      <label className="block text-sm font-medium">Confirm new password<input required minLength={12} autoComplete="new-password" type={show ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-line-strong bg-white px-3" /></label>
      {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">Update password</Button>
    </form>
  </section></main>;
}
