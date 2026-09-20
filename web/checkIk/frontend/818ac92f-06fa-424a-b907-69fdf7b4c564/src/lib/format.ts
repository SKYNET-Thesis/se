export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatJoint(value: number | null, unit: '°' | '%'): string {
  if (value === null) return 'Not available';
  return unit === '%' ? `${Math.round(value)}%` : `${value.toFixed(1)}°`;
}

export const NOT_AVAILABLE = 'Not available';