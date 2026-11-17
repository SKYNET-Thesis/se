import { useEffect, useRef } from 'react';

/**
 * Moves focus to a heading when `value` changes (not on first render), so keyboard and screen-reader users land on the
 * new question after Previous, Next or the question map.
 */
export function useFocusOnChange(value: number) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } ref.current?.focus(); }, [value]);
  return ref;
}
