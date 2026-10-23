import { useEffect, useState } from 'react';

export function candidateSearchChange(searchInput: string) {
  return { searchInput, page: 1, selectedUserId: '' };
}
export function candidatePageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function candidateMutationBody(userId: string) {
  return { userId };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
