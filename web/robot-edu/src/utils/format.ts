import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isValid } from 'date-fns';

export function daysFromNow(days: number, hour = 17): string {
  const d = addDays(new Date(), days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function formatDate(iso: string, pattern = 'MMM d, yyyy'): string {
  const d = new Date(iso);
  return isValid(d) ? format(d, pattern) : '—';
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (!isValid(d)) return '—';
  return `${formatDistanceToNowStrict(d)} ago`;
}

export interface DueInfo {
  label: string;
  tone: 'neutral' | 'warn' | 'danger';
}

export function describeDue(iso: string): DueInfo {
  const d = new Date(iso);
  if (!isValid(d)) return { label: 'No due date', tone: 'neutral' };
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < 0) return { label: `Overdue · ${format(d, 'MMM d')}`, tone: 'danger' };
  if (diff === 0) return { label: 'Due today', tone: 'warn' };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'warn' };
  if (diff <= 7) return { label: `Due ${format(d, 'EEE, MMM d')}`, tone: 'neutral' };
  return { label: `Due ${format(d, 'MMM d')}`, tone: 'neutral' };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function formatClock(ms: number): string {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}