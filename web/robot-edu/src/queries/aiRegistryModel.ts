import { ApiError } from '../lib/api';

/** How a registry list ended: the API answers 404 when the account may not use AI models at all (indistinguishable from "none"). */
export type RegistryState = 'ok' | 'unavailable' | 'error';
export function registryState(error: unknown): RegistryState {
  if (!error) return 'ok';
  return error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error';
}

const format = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (typeof value === 'string' && value.trim() && value.length <= 40) return value.trim();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return null;
};

/** Metrics exactly as stored: `name: value` for each scalar entry, in stored order. Nested or missing values are not invented. */
export function metricsSummary(metrics: unknown, limit = 6): string[] {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return [];
  const rows: string[] = [];
  for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
    const shown = format(value);
    if (shown !== null) rows.push(`${key.replace(/_/g, ' ')}: ${shown}`);
    if (rows.length >= limit) break;
  }
  return rows;
}

/** `repo@revision` for a Hugging Face reference, or null when none was recorded. */
export function sourceLabel(repo: string | null | undefined, revision: string | null | undefined): string | null {
  if (!repo) return null;
  return revision ? `${repo}@${revision}` : repo;
}

export function successRate(trialCount: number | null | undefined, successCount: number | null | undefined): string | null {
  if (!trialCount || trialCount <= 0 || successCount === null || successCount === undefined) return null;
  return `${successCount} of ${trialCount} trials succeeded`;
}

/** Plain-language state of a stored status/outcome value. */
export const statusTone = (status: string | null | undefined): 'ok' | 'warn' | 'danger' | 'neutral' => {
  const value = (status ?? '').toLowerCase();
  if (['active', 'completed', 'succeeded', 'passed', 'published', 'ready'].includes(value)) return 'ok';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'danger';
  if (['running', 'queued', 'pending', 'draft'].includes(value)) return 'warn';
  return 'neutral';
};
