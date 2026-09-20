import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Manrope_500Medium } from "@expo-google-fonts/manrope";
import { IBMPlexMono_400Regular, IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { FontSource } from "expo-font";
import { Platform, TextStyle } from "react-native";

// Legacy flat palette — the original, still-dark-only token set every
// not-yet-migrated screen imports directly (TaskDetail, TasksScreen,
// Connect, Calibrate, Teleop, Camera, Status, onboarding, ...). Left
// completely unchanged so those screens keep rendering exactly as before,
// regardless of the app's theme mode. New/migrated code should prefer
// `useAppTheme().colors` (see ThemeContext.tsx) instead of importing this
// directly, so it participates in Light/Dark instead of hardcoding dark.
export const colors = {
  bg: "#0F0F12",
  surface: "#17171B",
  surface2: "#1F1F24",
  border: "#2A2A31",
  textHi: "#F3F2EE",
  textLo: "#9A9AA3",
  accent: "#C6F24E",
  accentText: "#12160A",
  danger: "#FF3B30",
  caution: "#F5A623"
} as const;

// ---------------------------------------------------------------------------
// Semantic theme architecture (Dark / Light)
// ---------------------------------------------------------------------------
// Components consume these named roles — never "is it light or dark, so
// which raw hex do I use" — so a component migrated once automatically
// renders correctly in both modes forever after.
//
// `accent` vs `accentStrong`: audited separately because plain lime
// (#C6F24E) is fine as an ICON/TEXT color on the near-black Dark surfaces
// (contrast ~14:1) but reads almost invisibly (~1.3:1) directly on Light's
// white/near-white surfaces. `accent` stays the literal brand lime and is
// only ever used as a FILLED background (paired with `accentForeground` on
// top of it); `accentStrong` is what components use when lime needs to sit
// as bare icon/text/border color directly against a surface — in Dark it
// simply equals `accent` (zero visual change), in Light it's a deepened
// olive-lime that keeps the same hue family but clears 4.5:1+.
//
// `border` vs `borderStrong`: `border` is the default, restrained card
// edge. `borderStrong` is reserved for a boundary that needs to read as
// LEVEL-1/high-priority without becoming a filled control (e.g. Connect's
// scan-status hero card vs its plain device cards) — not for every card.
// In Dark it equals `border` exactly (zero visual change, since Dark's own
// contrast already carries card definition without a second border tier).
//
// `controlStrong` / `controlStrongForeground`: the "dark neutral as
// structural anchor" pairing — a selected/active control that should read
// as unmistakable without spending the brand lime on it (e.g. Tasks'
// selected filter chip). In Dark these resolve to `surface`/`accent`,
// i.e. exactly the surface-fill + lime-text treatment Dark already used
// for that same selected state, so reusing the token there is a zero-visual-
// diff bridge, not a new Dark treatment.
export type ThemeMode = "dark" | "light";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentForeground: string;
  accentStrong: string;
  controlStrong: string;
  controlStrongForeground: string;
  danger: string;
  dangerForeground: string;
  caution: string;
};

// Dark is the reviewed, approved baseline — every value here is copied
// verbatim from the legacy `colors` above so Dark Mode stays pixel-identical
// to what shipped before this refactor. The two new tokens below are
// bridging values only (see the comments above) — nothing in Dark newly
// reads from them with a different color than it already had.
export const darkColors: ThemeColors = {
  background: "#0F0F12",
  surface: "#17171B",
  surfaceSecondary: "#1F1F24",
  border: "#2A2A31",
  borderStrong: "#2A2A31",
  textPrimary: "#F3F2EE",
  textSecondary: "#9A9AA3",
  accent: "#C6F24E",
  accentForeground: "#12160A",
  accentStrong: "#C6F24E",
  controlStrong: "#17171B",
  controlStrongForeground: "#C6F24E",
  danger: "#FF3B30",
  dangerForeground: "#0F0F12",
  caution: "#F5A623"
};

// Light: designed, not inverted. Warm off-white (not stark white) to avoid
// the "chối mắt" flatness of pure #FFFFFF everywhere; every text/icon/fill
// pairing below was checked against WCAG AA (4.5:1 for text, 3:1 for
// meaningful icons) — see the contrast decisions in the theme rollout report.
//
// Visual-hierarchy polish pass: background/surface/surfaceSecondary were
// previously clustered within ~1.1:1 of each other (measured), which read
// as flat and let cards "tan into" the page. surfaceSecondary was deepened
// (surface stays pure white, still the brightest, most "elevated" tone) so
// the background → surface → subtle border stack separates without relying
// on shadow. caution was darkened slightly so caution-as-text still clears
// 4.5:1 against the deepened background — everything else here is unchanged
// from the original approved Light direction.
//
// background was first deepened to #EDEDE7 alongside that pass, then tuned
// back up to this warmer #F1F1EB after visual review read #EDEDE7 as
// leaning utility-grey — this sits between the original #F5F5F1 and that
// #EDEDE7 step, keeping enough separation from white cards (re-verified:
// still clears 4.5:1 for every text/semantic color against it) while
// reading warmer/more premium.
export const lightColors: ThemeColors = {
  background: "#F1F1EB",
  surface: "#FFFFFF",
  surfaceSecondary: "#E1E2D9",
  border: "#C2C4B9",
  borderStrong: "#A7A99D",
  textPrimary: "#16161A",
  textSecondary: "#5B5C63",
  accent: "#C6F24E",
  accentForeground: "#12160A",
  accentStrong: "#4F6B12",
  controlStrong: "#232326",
  controlStrongForeground: "#F3F2EC",
  danger: "#C7261C",
  dangerForeground: "#FFFFFF",
  caution: "#875700"
};

export const themePalettes: Record<ThemeMode, ThemeColors> = {
  dark: darkColors,
  light: lightColors
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40
} as const;

export const radius = {
  status: 4,
  button: 10,
  card: 16,
  round: 999
} as const;

export const fontNames = {
  display: "SpaceGrotesk",
  body: "Manrope",
  mono: "IBMPlexMono",
  monoStrong: "IBMPlexMono-SemiBold"
} as const;

// Bundled as local app assets via @expo-google-fonts (no network fetch at
// runtime). The previous version pulled these from raw.githubusercontent.com
// at startup: if that fetch was slow or blocked on any single font, the
// whole `useFonts` Promise.all rejected and fontsReady stayed false forever,
// silently pinning the ENTIRE app to system fallback fonts with no visible
// error. Local require()'d assets resolve from the bundle instead — no
// network dependency, and Metro serves them as static files on web too, so
// no extra @font-face/webpack setup is needed there.
export const appFontSources: Record<string, FontSource> = {
  SpaceGrotesk: SpaceGrotesk_700Bold,
  Manrope: Manrope_500Medium,
  IBMPlexMono: IBMPlexMono_400Regular,
  "IBMPlexMono-SemiBold": IBMPlexMono_600SemiBold
};

const fallbackFonts = {
  display: Platform.select({ ios: "Avenir Next", android: "sans-serif-medium", default: "system-ui" }),
  body: Platform.select({ ios: "Avenir", android: "sans-serif", default: "system-ui" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  monoStrong: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" })
} as const;

export type FontRole = keyof typeof fontNames;

export function font(role: FontRole, fontsReady = true): TextStyle {
  return {
    fontFamily: fontsReady ? fontNames[role] : fallbackFonts[role]
  };
}

export const type = {
  display: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700"
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700"
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500"
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700"
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500"
  },
  mono: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  }
} satisfies Record<string, TextStyle>;
