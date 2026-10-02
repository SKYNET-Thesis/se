import { TextStyle } from "react-native";
import { font, FontRole, type } from "../theme";

// SkyNex semantic text roles. Each role pairs a size step from theme.ts
// `type` with a font role from theme.ts `fontNames` — one real Be Vietnam
// Pro (or IBM Plex Mono) file at one real weight, so nothing is synthesized.
// Hierarchy comes from size first, then weight: one Bold role for the hero,
// SemiBold for headings and labels, Regular for reading.
type TextRoleSpec = {
  scale: TextStyle;
  family: FontRole;
};

export const textRoles = {
  // Hero stage caption title, onboarding headline. 700.
  hero: { scale: type.display, family: "displayBold" },
  // Screen titles (ScreenHeader) and primary card headings. 600.
  title: { scale: type.title, family: "display" },
  // 600.
  sectionTitle: { scale: type.bodyStrong, family: "display" },
  // Card / tile names. 600 — the same weight as a section title; a card
  // title sits inside its card, so position already separates the two.
  cardTitle: { scale: type.bodyStrong, family: "display" },
  // 400.
  body: { scale: type.body, family: "body" },
  // Metadata. 400.
  caption: { scale: type.small, family: "body" },
  // Status pills and connection state text (Connect, Camera). 600.
  status: { scale: type.label, family: "display" }
} as const satisfies Record<string, TextRoleSpec>;

export type TextRole = keyof typeof textRoles;

// Resolves a role to a ready-to-spread TextStyle. `fontsReady` follows the
// same contract as theme.ts `font()`: system fallbacks until custom fonts load.
export function textStyle(role: TextRole, fontsReady = true): TextStyle {
  const { scale, family } = textRoles[role];
  return { ...scale, ...font(family, fontsReady) };
}
