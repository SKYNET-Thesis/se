import { radius } from "../theme";

// SkyNex corner-radius foundation, mapped onto theme.ts's existing radii.
// No new values: `modal` deliberately reuses the card radius rather than
// inventing a larger sheet radius nothing has been designed against yet.
export const corner = {
  card: radius.card,
  button: radius.button,
  pill: radius.round,
  modal: radius.card,
  // Small status dots/indicators (e.g. Connect's status dot).
  indicator: radius.status
} as const;

export type CornerToken = keyof typeof corner;
