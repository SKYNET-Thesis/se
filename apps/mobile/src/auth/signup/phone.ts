// Phone numbers for Create Account. Collection only: there is no OTP
// backend, so a number is never sent an SMS and never marked verified.
//
// Countries are data so more can be added without touching the screen;
// the country prefix becomes a selector only once there is a choice to make.

export type PhoneCountry = {
  id: string;
  name: string;
  dialCode: string;
  // Digits of the national significant number (without the trunk "0").
  nationalLength: number;
  // Domestic prefix users often type first (e.g. 0912…); dropped on save.
  trunkPrefix?: string;
};

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  // Vietnamese numbers are 10 digits written domestically with a leading 0
  // (0912 345 678), i.e. 9 digits after +84.
  { id: "VN", name: "Việt Nam", dialCode: "+84", nationalLength: 9, trunkPrefix: "0" }
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

// Spaces, dots, dashes and brackets are formatting, not part of the number.
function digitsOnly(value: string): string {
  return value.replace(/[\s.\-()]/g, "");
}

function nationalNumber(country: PhoneCountry, value: string): string {
  const digits = digitsOnly(value);
  return country.trunkPrefix && digits.startsWith(country.trunkPrefix)
    ? digits.slice(country.trunkPrefix.length)
    : digits;
}

export function validatePhone(country: PhoneCountry, value: string): string | null {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "Vui lòng nhập số điện thoại.";
  if (!/^\d+$/.test(digits) || nationalNumber(country, value).length !== country.nationalLength) {
    return "Số điện thoại chưa đúng định dạng.";
  }
  return null;
}

// E.164 for the payload, e.g. "+84912345678". Call only after validatePhone.
export function toE164(country: PhoneCountry, value: string): string {
  return `${country.dialCode}${nationalNumber(country, value)}`;
}

// Domestic display for the review step, e.g. "+84 912 345 678".
export function formatPhone(country: PhoneCountry, value: string): string {
  const national = nationalNumber(country, value);
  return `${country.dialCode} ${national.replace(/(\d{3})(?=\d)/g, "$1 ")}`.trim();
}
