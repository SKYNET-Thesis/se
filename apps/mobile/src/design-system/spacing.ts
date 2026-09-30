import { spacing } from "../theme";

// SkyNex spacing foundation. theme.ts owns the values; this file only gives
// them product meaning so new code picks spacing by role, not by number.
//
// The raw 4pt-based scale (xxs 4 → xxxl 40) is re-exported as-is — no new
// values — so `space.md` and `spacing.md` are always the same number.
export const space = spacing;

export type SpaceToken = keyof typeof space;

// Roles measured from what screens already do, so adopting them is a
// zero-visual-diff change: every top-level screen content container uses
// xl as its horizontal gutter, cards pad with md, and sm/xs are the
// dominant gaps between siblings (54 and 43 uses respectively).
export const layout = {
  screenGutter: spacing.xl,
  sectionGap: spacing.xl,
  cardPadding: spacing.md,
  // Pairs with corner.productCard (24): the larger corner needs more inset
  // so content doesn't crowd the curve.
  productCardPadding: spacing.lg,
  stackGap: spacing.sm,
  inlineGap: spacing.xs,
  hairlineGap: spacing.xxs
} as const;

export type LayoutToken = keyof typeof layout;
