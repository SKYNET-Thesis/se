import { FontDisplay, FontSource } from "expo-font";
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

export const appFontSources: Record<string, FontSource> = {
  SpaceGrotesk: {
    uri: "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
    display: FontDisplay.SWAP
  },
  Manrope: {
    uri: "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf",
    display: FontDisplay.SWAP
  },
  IBMPlexMono: {
    uri: "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf",
    display: FontDisplay.SWAP
  },
  "IBMPlexMono-SemiBold": {
    uri: "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-SemiBold.ttf",
    display: FontDisplay.SWAP
  }
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
