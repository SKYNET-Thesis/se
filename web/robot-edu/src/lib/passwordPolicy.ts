/** Same minimum as the student password flows (12 characters). Returns a user-facing message, or null when the password is acceptable. */
export const MIN_PASSWORD_LENGTH = 12;
export function passwordProblem(next: string, confirmation: string, current?: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirmation) return 'The passwords do not match.';
  if (current !== undefined && next === current) return 'Your new password must differ from the current one.';
  return null;
}

export type PasswordCheck = { id: 'length' | 'different'; label: string; met: boolean };
export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong' };

/**
 * Live state of the password form. The ONLY enforced rules are the real ones (12 characters minimum, new differs from the current/temporary password,
 * confirmation matches); strength is advisory and never blocks submission. Pure and synchronous: no request is made while typing.
 */
export function passwordFormState(next: string, confirmation: string, current?: string) {
  const checks: PasswordCheck[] = [{ id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: next.length >= MIN_PASSWORD_LENGTH }];
  if (current !== undefined) checks.push({ id: 'different', label: 'Different from your temporary password', met: next.length > 0 && next !== current });
  const matchState: 'empty' | 'match' | 'mismatch' = confirmation.length === 0 ? 'empty' : confirmation === next ? 'match' : 'mismatch';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(next)).length;
  let score = 0;
  if (next.length >= MIN_PASSWORD_LENGTH) score = Math.min(4, 1 + (classes >= 3 ? 1 : 0) + (next.length >= 16 ? 1 : 0) + (next.length >= 20 && classes >= 2 ? 1 : 0));
  const label: PasswordStrength['label'] = next.length === 0 ? 'Too short' : next.length < MIN_PASSWORD_LENGTH ? 'Too short' : (['Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const)[score];
  return { checks, matchState, strength: { score: score as PasswordStrength['score'], label }, valid: checks.every((check) => check.met) && matchState === 'match' };
}

/** User-facing sign-in error: provider wording is never shown, and the message never reveals whether an account exists. Role errors raised by the app pass through. */
export function signInErrorMessage(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : '';
  if (/rate limit|too many|\b429\b/i.test(text)) return 'Too many attempts. Wait a minute and try again.';
  if (/network|failed to fetch|timeout|unreachable/i.test(text)) return 'We could not reach the sign-in service. Check your connection and try again.';
  if (!text || /invalid login credentials|invalid_credentials|invalid grant|email not confirmed|user not found|\b400\b|auth(?:api)?error/i.test(text)) return 'The details you entered are incorrect. Check them and try again.';
  return text;   // messages raised by the app itself (role or first-time-setup validation) are already user-facing
}
