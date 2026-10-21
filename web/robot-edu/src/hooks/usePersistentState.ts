import { useEffect, useRef, useState } from 'react';
import { loadVersioned, saveVersioned, type LoadStatus } from '../utils/storage';

/**
 * React state mirrored to versioned localStorage. Falls back to `seed` when the
 * stored value is missing, outdated, or fails validation, and reports why.
 */
export function usePersistentState<T>(
key: string,
version: number,
seed: () => T,
isValid: (value: unknown) => value is T)
: [T, React.Dispatch<React.SetStateAction<T>>, LoadStatus] {
  const initial = useRef<{value: T;status: LoadStatus;} | null>(null);
  if (initial.current === null) {
    const result = loadVersioned(key, version, isValid);
    initial.current = { value: result.data ?? seed(), status: result.status };
  }
  const [state, setState] = useState<T>(initial.current.value);

  useEffect(() => {
    saveVersioned(key, version, state);
  }, [key, version, state]);

  return [state, setState, initial.current.status];
}