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

// Create Account only. The confirmation exists purely to catch typing
// mistakes on the client — it is never sent anywhere.
export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) return "Vui lòng xác nhận mật khẩu.";
  if (confirmation !== password) return "Mật khẩu xác nhận chưa khớp.";
  return null;
}

export function validateDisplayName(name: string): string | null {
  return name.trim().length === 0 ? "Vui lòng nhập tên của bạn." : null;
}

// The picker only offers real, non-future days, so the one thing left to
// check is that a date was chosen at all.
export function validateBirthDate(isoDate: string | null): string | null {
  return isoDate ? null : "Vui lòng chọn ngày sinh.";
}

// "Không muốn trả lời" is a valid answer; only "nothing chosen" is not.
export function validateGender(gender: string | null): string | null {
  return gender ? null : "Vui lòng chọn một lựa chọn.";
}
