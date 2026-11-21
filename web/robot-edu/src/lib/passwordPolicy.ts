/** Same minimum as the student password flows (12 characters). Returns a user-facing message, or null when the password is acceptable. */
export const MIN_PASSWORD_LENGTH = 12;
export function passwordProblem(next: string, confirmation: string, current?: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirmation) return 'The passwords do not match.';
  if (current !== undefined && next === current) return 'Your new password must differ from the current one.';
  return null;
}
