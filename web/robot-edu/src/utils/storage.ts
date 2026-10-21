/**
 * Versioned browser persistence for the VISTA local demo layer.
 * Everything stored here lives only in this browser. Nothing is shared or sent to a server.
 */
export const STORAGE_PREFIX = 'vista.demo.';

export const STORAGE_KEYS = {
  programs: 'programs',
  experiments: 'experiments',
  learning: 'learning',
  catalog: 'catalog',
  submissions: 'submissions',
  admin: 'admin',
  role: 'role'
} as const;

export type LoadStatus = 'ok' | 'missing' | 'invalid' | 'outdated' | 'unavailable';

interface Envelope<T> {
  version: number;
  savedAt: string;
  data: T;
}

export interface LoadResult<T> {
  data: T | null;
  status: LoadStatus;
}

function storageAvailable(): boolean {
  try {
    const probe = `${STORAGE_PREFIX}__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadVersioned<T>(
key: string,
version: number,
isValid: (value: unknown) => value is T)
: LoadResult<T> {
  if (!storageAvailable()) return { data: null, status: 'unavailable' };
  const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
  if (raw === null) return { data: null, status: 'missing' };
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope<unknown>>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
      return { data: null, status: 'invalid' };
    }
    if (parsed.version !== version) return { data: null, status: 'outdated' };
    if (!isValid(parsed.data)) return { data: null, status: 'invalid' };
    return { data: parsed.data, status: 'ok' };
  } catch {
    return { data: null, status: 'invalid' };
  }
}

export function saveVersioned<T>(key: string, version: number, data: T): boolean {
  try {
    const envelope: Envelope<T> = { version, savedAt: new Date().toISOString(), data };
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearDemoStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {

    // Storage unavailable; nothing to clear.
  }}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}