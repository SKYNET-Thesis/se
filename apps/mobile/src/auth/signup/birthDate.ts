// Birth dates are kept as ISO calendar strings ("YYYY-MM-DD") — no time,
// no timezone — and only ever chosen from the picker, which offers real
// calendar days up to today.

export type DateParts = { year: number; month: number; day: number };

// The picker reaches back this many years; nothing older is plausible.
export const BIRTH_YEAR_SPAN = 120;

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function todayParts(now = new Date()): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate({ day, month, year }: DateParts): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= daysInMonth(parts.year, parts.month)
    ? parts
    : null;
}

// Vietnamese numeric style: 15/03/1998.
export function formatBirthDate(value: string): string {
  const parts = parseIsoDate(value);
  return parts ? `${pad(parts.day)}/${pad(parts.month)}/${parts.year}` : "";
}

// Keeps a selection on a real day that is not in the future, e.g. after the
// month or year changes under it.
export function clampToValidPast(parts: DateParts, today = todayParts()): DateParts {
  const year = Math.min(Math.max(parts.year, today.year - BIRTH_YEAR_SPAN), today.year);
  const maxMonth = year === today.year ? today.month : 12;
  const month = Math.min(Math.max(parts.month, 1), maxMonth);
  const lastDay = year === today.year && month === today.month ? today.day : daysInMonth(year, month);
  const day = Math.min(Math.max(parts.day, 1), lastDay);
  return { day, month, year };
}
