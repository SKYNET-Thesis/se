import { useMemo } from "react";
import { ThemeColors } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { motion } from "./motion";
import { corner } from "./radius";
import { layout, space } from "./spacing";
import { textRoles } from "./typography";

// SkyNex semantic token layer. theme.ts stays the single source of truth
// for every raw value, and ThemeContext stays the only thing that decides
// Dark vs Light — this file just renames existing theme roles into product
// meanings. It never holds a hex value of its own.
//
// Colors are mode-dependent, so they're derived from the active
// ThemeColors rather than frozen at import time.
export function skyNexColors(c: ThemeColors) {
  return {
    background: c.background,
    surface: c.surface,
    surfaceRaised: c.surfaceSecondary,
    // The robot's stage (HeroStage): surfaceSecondary against `background`
    // is the app's established depth cue — there is no shadow/elevation.
    robotSurface: c.surfaceSecondary,
    border: c.border,
    borderEmphasis: c.borderStrong,

    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,

    // Brand lime as a FILL, with its paired foreground.
    accent: c.accent,
    onAccent: c.accentForeground,
    // Lime as bare icon/text/border on a surface (contrast-safe in Light).
    accentInk: c.accentStrong,

    selected: c.controlStrong,
    onSelected: c.controlStrongForeground,

    statusReady: c.accentStrong,
    // Same lime family as ready — StatusBadge separates the two by icon and
    // label, never by color alone.
    statusRunning: c.accentStrong,
    statusWarning: c.caution,
    statusOffline: c.textSecondary,
    statusDanger: c.danger,
    onDanger: c.dangerForeground
  } as const;
}

export type SkyNexColors = ReturnType<typeof skyNexColors>;
export type SkyNexColorToken = keyof SkyNexColors;

// Mode-independent foundations, grouped for discoverability.
export const SkyNexTokens = {
  space,
  layout,
  corner,
  motion,
  textRoles
} as const;

// Theme-aware entry point for migrated components.
export function useSkyNexTokens() {
  const { colors } = useAppTheme();
  return useMemo(() => ({ ...SkyNexTokens, colors: skyNexColors(colors) }), [colors]);
}
