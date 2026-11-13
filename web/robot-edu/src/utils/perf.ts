/** Cheap User Timing marks (`vista:*`) so workspace start-up can be inspected in DevTools or by tests. No-ops when unsupported. */
export function perfMark(name: string): void {
  try { performance.mark(`vista:${name}`); } catch { /* User Timing unavailable */ }
}
