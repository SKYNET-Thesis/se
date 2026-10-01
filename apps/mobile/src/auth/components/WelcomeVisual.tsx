import { useMemo } from "react";
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { useAppTheme } from "../../ThemeContext";

// The brand mark's white sculptural surfaces vanish on Light's near-white
// field, so Light uses the approved dark-tile mark instead — the same rule
// OnboardingScreen's brand moment already follows. No new asset.
const MARK_DARK_MODE = require("../../../assets/brand/production/skynex-mark-transparent.png");
const MARK_LIGHT_MODE = require("../../../assets/brand/production/skynex-mark-dark.png");
const MARK_SIZE = 96;
// Light's tile is a filled square; rounding it reads as a deliberate brand
// chip (an app-icon presentation), not a hard-edged photo.
const MARK_TILE_RADIUS = 24;

type Props = {
  // A real campaign image (see auth/welcomeMedia.ts). Without one, the
  // calm brand fallback renders in the same frame — geometry never changes.
  media?: ImageSourcePropType | null;
  // Parts of the frame other UI covers (e.g. the status bar on top, the
  // action panel rising over the bottom). Only the fallback mark re-centres
  // in what is left; media always fills the whole frame, edge to edge.
  coveredTop?: number;
  coveredBottom?: number;
  style?: StyleProp<ViewStyle>;
};

// The Welcome screen's visual stage. The frame's size is the screen's
// decision; this only fills it. Decorative for screen readers — the
// screen's wordmark and headline carry the meaning.
export function WelcomeVisual({ coveredBottom = 0, coveredTop = 0, media, style }: Props) {
  const { colors } = useSkyNexTokens();
  const { mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, style]}
    >
      {media ? (
        <Image accessibilityIgnoresInvertColors resizeMode="cover" source={media} style={StyleSheet.absoluteFill} />
      ) : (
        // Intentionally almost empty: one mark on a quiet surface. No robot
        // illustration, iconography or technical graphics.
        <View style={[styles.fallback, { paddingBottom: coveredBottom, paddingTop: coveredTop }]}>
          <Image
            resizeMode="cover"
            source={mode === "light" ? MARK_LIGHT_MODE : MARK_DARK_MODE}
            style={[styles.mark, mode === "light" && styles.markTile]}
          />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    frame: {
      backgroundColor: colors.surfaceRaised,
      overflow: "hidden"
    },
    fallback: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center"
    },
    mark: {
      height: MARK_SIZE,
      width: MARK_SIZE
    },
    markTile: {
      borderRadius: MARK_TILE_RADIUS
    }
  });
}
