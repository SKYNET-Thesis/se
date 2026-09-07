import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Manrope_500Medium } from "@expo-google-fonts/manrope";
import { IBMPlexMono_400Regular, IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { FontSource } from "expo-font";
import { Platform, TextStyle } from "react-native";

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
