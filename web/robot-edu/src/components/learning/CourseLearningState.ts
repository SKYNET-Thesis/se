export const sessionExpandedState: Record<string, Record<string, boolean>> = {};

export function resetSessionExpandedState() {
  for (const k in sessionExpandedState) {
    delete sessionExpandedState[k];
  }
}
