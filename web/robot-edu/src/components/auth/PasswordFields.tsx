import { useId, useState } from 'react';
import { CheckIcon, CircleIcon, EyeIcon, EyeOffIcon, XIcon } from 'lucide-react';
import { passwordFormState } from '../../lib/passwordPolicy';

const STRENGTH_TONE = ['bg-line-strong', 'bg-danger', 'bg-warn', 'bg-accent', 'bg-ok'] as const;
const field = 'block w-full rounded-md border bg-surface px-3 py-2.5 pr-11 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25';

function Reveal({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={shown ? `Hide ${label}` : `Show ${label}`}
      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {shown ? <EyeOffIcon className="h-4 w-4" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/**
 * New password + confirmation with live, request-free validation: requirement checklist, advisory strength meter and an immediately-updating match message.
 * Each field has its own show/hide control (toggling never resets validation); paste is allowed; autocomplete tokens support password managers.
 * `current` (optional) adds the real "different from the temporary password" rule.
 */
export function PasswordFields({ value, confirmation, onValue, onConfirmation, current, disabled }: { value: string; confirmation: string; onValue: (next: string) => void; onConfirmation: (next: string) => void; current?: string; disabled?: boolean }) {
  const id = useId();
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const state = passwordFormState(value, confirmation, current);
  const mismatch = state.matchState === 'mismatch';
  return (
    <>
      <div>
        <label htmlFor={`${id}-new`} className="block text-sm font-medium text-ink">New password</label>
        <div className="relative mt-1">
          <input id={`${id}-new`} required minLength={12} autoComplete="new-password" disabled={disabled} type={showNew ? 'text' : 'password'} value={value} onChange={(event) => onValue(event.target.value)}
            aria-describedby={`${id}-rules ${id}-strength`} className={`${field} border-line-strong`} />
          <Reveal shown={showNew} onToggle={() => setShowNew((v) => !v)} label="new password" />
        </div>
        <ul id={`${id}-rules`} className="mt-2 space-y-1 text-sm" aria-label="Password requirements">
          {state.checks.map((check) => (
            <li key={check.id} className={`flex items-center gap-2 ${check.met ? 'text-ok' : 'text-ink-muted'}`} data-met={check.met}>
              {check.met ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <CircleIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{check.label}</span><span className="sr-only">{check.met ? ' — met' : ' — not met yet'}</span>
            </li>
          ))}
        </ul>
        <div id={`${id}-strength`} className="mt-2" data-testid="password-strength">
          <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full ${state.strength.score >= step ? STRENGTH_TONE[state.strength.score] : 'bg-line'}`} />)}</div>
          <p className="mt-1 text-xs text-ink-muted">Strength: <span className="font-medium text-ink">{value ? state.strength.label : '—'}</span> <span>(guidance only)</span></p>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className="block text-sm font-medium text-ink">Confirm new password</label>
        <div className="relative mt-1">
          <input id={`${id}-confirm`} required minLength={12} autoComplete="new-password" disabled={disabled} type={showConfirm ? 'text' : 'password'} value={confirmation} onChange={(event) => onConfirmation(event.target.value)}
            aria-invalid={mismatch} aria-describedby={`${id}-match`} className={`${field} ${mismatch ? 'border-danger' : state.matchState === 'match' ? 'border-ok' : 'border-line-strong'}`} />
          <Reveal shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} label="confirmation" />
        </div>
        <p id={`${id}-match`} role="status" aria-live="polite" className={`mt-1.5 flex min-h-5 items-center gap-1.5 text-sm ${mismatch ? 'text-danger' : 'text-ok'}`} data-state={state.matchState}>
          {state.matchState === 'match' ? <><CheckIcon className="h-4 w-4" aria-hidden="true" />Passwords match</> : mismatch ? <><XIcon className="h-4 w-4" aria-hidden="true" />Passwords do not match</> : null}
        </p>
      </div>
    </>
  );
}
