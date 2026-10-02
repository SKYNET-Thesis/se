// Honest client-side checks only: is something there, and does an email
// look like an email. No password length or complexity rules — those belong
// to the backend and none has been defined yet. Returns the message to
// show, or null when the value passes.

// Deliberately loose (something@something.tld): the backend is the
// authority on which addresses actually exist.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (value.length === 0) return "Vui lòng nhập email.";
  if (!EMAIL_PATTERN.test(value)) return "Email chưa đúng định dạng.";
  return null;
}

// Not trimmed: spaces can be part of a real password.
export function validatePassword(password: string): string | null {
  return password.length === 0 ? "Vui lòng nhập mật khẩu." : null;
}
