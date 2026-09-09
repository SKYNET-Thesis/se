import { Fragment } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors, font, radius, spacing, type } from "../theme";
import { OnboardingStat } from "./onboardingData";

// Compact instrument-panel readout overlaid on the persistent 3D hero — a
// single bordered card with icon + label/value stat columns, styled after a
// vehicle HUD (e.g. "23.0 mph") rather than a row of AI-chatbot pill
// badges. No decorative bullets; the value's own weight carries emphasis.
export function TelemetryHud({ stats }: { stats: readonly OnboardingStat[] }) {
  if (stats.length === 0) return null;

  return (
    <View style={styles.card}>
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Fragment key={stat.label}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.stat}>
              <View style={styles.labelRow}>
                <Icon color={colors.textLo} size={11} strokeWidth={2.25} />
                <Text style={[styles.label, font("mono")]}>{stat.label}</Text>
              </View>
              <Text style={[styles.value, font("monoStrong")]}>{stat.value}</Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

// Very soft depth cue for the hero card: a radial wash that's a shade
// lighter toward the center-bottom (where the robot stands) and settles
// back to the screen's own bg at the card edges — never a flat black panel.
export function HeroCardBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={style}>
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="70%" id="heroCardBackdrop" r="80%">
            <Stop offset="0%" stopColor={colors.surface2} stopOpacity={1} />
            <Stop offset="55%" stopColor={colors.surface} stopOpacity={1} />
            <Stop offset="100%" stopColor={colors.bg} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#heroCardBackdrop)" height="100%" width="100%" x="0" y="0" />
      </Svg>
    </View>
  );
}

// The card's signature mark: a few thin, concentric lime arcs tucked into
// the top-right corner — stroke only, never a filled shape, kept quiet
// enough to read as a technical detail rather than decoration.
export function HeroCardAccent() {
  return (
    <Svg height={100} pointerEvents="none" style={styles.accent} width={100}>
      <Circle cx={138} cy={-38} fill="none" opacity={0.55} r={60} stroke={colors.accent} strokeWidth={1.25} />
      <Circle cx={138} cy={-38} fill="none" opacity={0.32} r={82} stroke={colors.accent} strokeWidth={1} />
      <Circle cx={138} cy={-38} fill="none" opacity={0.16} r={104} stroke={colors.accent} strokeWidth={1} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "stretch",
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  divider: {
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
    width: 1
  },
  stat: {
    gap: spacing.xxs,
    justifyContent: "center"
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs
  },
  label: {
    ...type.mono,
    color: colors.textLo,
    fontSize: 10,
    letterSpacing: 1.5
  },
  value: {
    ...type.mono,
    color: colors.textHi,
    fontSize: 14,
    letterSpacing: 0.5
  },
  accent: {
    position: "absolute",
    right: 0,
    top: 0
  }
});
