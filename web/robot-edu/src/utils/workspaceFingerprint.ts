/**
 * Order-insensitive fingerprint of a serialized Blockly workspace. "Dirty since the last ProgramVersion" must compare
 * what Blockly serializes now with what Blockly serialized when the version was taken, never with the server's stored
 * JSON string: the key order and layout metadata of the two differ even when the learner changed nothing.
 */
export function workspaceFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => [key, canonical(item)]));
    }
    return input;
  };
  return JSON.stringify(canonical(value));
}

/** True only when `current` really differs from the baseline. A missing baseline never counts as a modification. */
export const isModifiedSince = (baseline: string | null, current: unknown): boolean => baseline !== null && workspaceFingerprint(current) !== baseline;
