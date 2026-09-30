import { TextStyle } from "react-native";
import { font, FontRole, type } from "../theme";

// SkyNex semantic text roles. Each role is a pairing of an existing size
// step from theme.ts `type` with an existing font family from `fontNames`
// — no new sizes or families. Where two roles share a size step, the
// typeface carries the hierarchy (display face for section headings,
// body face for card titles).
type TextRoleSpec = {
  scale: TextStyle;
  family: FontRole;
};

export const textRoles = {
  // Hero stage caption title, onboarding headline.
  hero: { scale: type.display, family: "display" },
  // Screen titles (ScreenHeader) and primary card headings.
  title: { scale: type.title, family: "display" },
  sectionTitle: { scale: type.bodyStrong, family: "display" },
  cardTitle: { scale: type.bodyStrong, family: "body" },
  body: { scale: type.body, family: "body" },
  caption: { scale: type.small, family: "body" },
  // Status pills and connection state text (Connect, Camera).
  status: { scale: type.label, family: "display" }
} as const satisfies Record<string, TextRoleSpec>;

export type TextRole = keyof typeof textRoles;

// Resolves a role to a ready-to-spread TextStyle. `fontsReady` follows the
// same contract as theme.ts `font()`: system fallbacks until custom fonts load.
export function textStyle(role: TextRole, fontsReady = true): TextStyle {
  const { scale, family } = textRoles[role];
  return { ...scale, ...font(family, fontsReady) };
}
