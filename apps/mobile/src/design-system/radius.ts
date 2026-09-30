import { radius } from "../theme";

// SkyNex corner-radius foundation, mapped onto theme.ts's existing radii.
// `modal` deliberately reuses the card radius rather than inventing a larger
// sheet radius nothing has been designed against yet.
export const corner = {
  card: radius.card,
  // Premium product surfaces (Home's readiness/tools cards, featured skill
  // cards) — the softer corner FeaturedTaskCard and TaskCard already use
  // locally as 24. The one radius here with no theme.ts counterpart:
  // theme.ts tops out at radius.card (16).
  productCard: 24,
  button: radius.button,
  pill: radius.round,
  modal: radius.card,
  // Small status dots/indicators (e.g. Connect's status dot).
  indicator: radius.status
} as const;

export type CornerToken = keyof typeof corner;
