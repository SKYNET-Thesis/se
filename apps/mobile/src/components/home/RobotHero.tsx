import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "../../design-system/spacing";
import { useAppTheme } from "../../ThemeContext";
import { ArmModelViewer } from "../ArmModelViewer";
import { SkyText } from "../ui";

type Props = {
  fontsReady: boolean;
  // One-line human status under the name, e.g. "Sẵn sàng hỗ trợ bạn".
  headline: string;
  isRobotMotionActive: boolean;
  name: string;
  reduceMotion: boolean;
};

// GlobalChrome (single row) and the bottom tab bar are fixed heights that
// live outside this screen; sizing the hero against the space actually left
// after them keeps the title/subtitle visually tied to the thumb-zone CTAs.
const CHROME_HEIGHT = 64;
const TAB_BAR_HEIGHT = 64;
const HERO_FILL_RATIO = 0.63;
const MIN_HERO_HEIGHT = 320;

// Idle/presentation Home is a static pose shot, not a live workspace: the
// 3D camera (ArmModelViewer's fitCameraToBoundingSphere) centers the robot
// in its canvas with a fixed fit margin, leaving empty canvas space above
// it. In presentation mode we crop that dead band off the top via an
// overflow-hidden viewport — the inner hero block still measures out at
// the full, unchanged heroHeight (so ArmModelViewer never resizes and the
// robot never rescales), it's just shifted up and the surplus clipped from
// view. The crop amount is capped well below the empty band so the robot's
// own silhouette is never touched, only genuinely empty canvas.
// The moment Home drives live/real-time robot poses (isRobotMotionActive)
// or the user adjusts the model, the crop must be lifted — a raised or
// rotated arm has to be able to use the full vertical workspace without
// hitting a clipped edge.
//
// Lifting it only UNCLIPS the viewport; the layout offset stays. The
// hidden band then renders upward into the space above the hero instead of
// growing the layout by the crop height — which used to push the robot,
// its name and everything below down mid-gesture. The robot should be what
// responds to a drag, not the interface around it.
const HERO_PRESENTATION_CROP = 104;

// The same camera fit margin also leaves an empty band BELOW the floor
// shadow (~23% of heroHeight, measured on 390×844 and 360×740 renders),
// which pushed the name far from the robot it identifies. In presentation
// mode the copy is lifted into that band instead of cropping the canvas —
// the viewer keeps its full size, and the copy ignores touches so drags in
// the band still reach the model. Lifted by ratio so it tracks heroHeight
// across screen sizes. Constant for the life of the screen: it never moves
// during or after interaction.
const HERO_COPY_LIFT_RATIO = 0.16;

// Robot identity: the 3D model plus who it is and how it's doing, in one
// human line. Presentation only — readiness is decided by data/robot.ts and
// arrives here as ready-made copy. The viewer block below (crop, drag
// latch, theme remount) moved here from HomeScreen unchanged.
export function RobotHero({ fontsReady, headline, isRobotMotionActive, name, reduceMotion }: Props) {
  const { colors, mode } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Theme mode Settings switches while Home sits unfocused in the background
  // (the only place theme changes now happen) collapses this tab's layout to
  // 0×0 — remounting ArmModelViewer right then bakes a zero-size GL context
  // that never recovers, even once the tab is visible again and its layout
  // is back to normal. Deferring which mode the remount key reflects until
  // Home is actually focused again avoids that trap without touching
  // ArmModelViewer itself: the hero keeps showing its last-mounted colors
  // while backgrounded (invisible anyway) and only remounts once this
  // screen has real layout to mount into.
  const isFocused = useIsFocused();
  const [armViewerMode, setArmViewerMode] = useState(mode);
  useEffect(() => {
    if (isFocused) setArmViewerMode(mode);
  }, [isFocused, mode]);

  // The presentation crop assumes the model sits at its canonical/default
  // orientation. Once the user drags/pinches the hero, the arm can rotate
  // into the crop band and get clipped, so any manual interaction disables
  // the crop for the rest of this Home mount — there's no reset/recenter
  // signal from ArmModelViewer to know when the view is canonical again, so
  // re-enabling the crop mid-session would risk clipping a still-rotated
  // pose. isHeroInteracting covers the live gesture; hasUserAdjustedHero
  // latches that off-state once the gesture ends.
  const [isHeroInteracting, setIsHeroInteracting] = useState(false);
  const [hasUserAdjustedHero, setHasUserAdjustedHero] = useState(false);
  const handleHeroInteractionStart = useCallback(() => {
    setIsHeroInteracting(true);
    setHasUserAdjustedHero(true);
  }, []);
  const handleHeroInteractionEnd = useCallback(() => {
    setIsHeroInteracting(false);
  }, []);

  const availableHeight = windowHeight - insets.top - insets.bottom - CHROME_HEIGHT - TAB_BAR_HEIGHT;
  const heroHeight = Math.max(MIN_HERO_HEIGHT, Math.round(availableHeight * HERO_FILL_RATIO));
  // Full, unclipped workspace once Home drives live/real-time robot poses or
  // the user is/has been manually rotating the model; clipped presentation
  // pose only for the untouched, canonical idle view. Layout (and so the
  // robot's and text's on-screen position) is identical in both — see
  // HERO_PRESENTATION_CROP.
  const showFullHero = isRobotMotionActive || isHeroInteracting || hasUserAdjustedHero;
  const copyLift = Math.round(heroHeight * HERO_COPY_LIFT_RATIO);

  return (
    <View>
      <View
        style={[
          styles.heroViewport,
          {
            height: heroHeight - HERO_PRESENTATION_CROP,
            overflow: showFullHero ? "visible" : "hidden"
          }
        ]}
      >
        <View style={[styles.hero, { height: heroHeight, marginTop: -HERO_PRESENTATION_CROP }]}>
          <View style={styles.modelSlot}>
            <ArmModelViewer
              // ArmModelViewer bakes accentColor/backgroundColor/floorColor
              // into the GL scene once, at context-creation time, and never
              // re-applies them on prop changes (its render loop repaints
              // the same scene object every frame — see WebGL onContextCreate
              // internals, not touched here). Keying on theme mode forces a
              // full unmount/remount on Light/Dark switch instead, which is
              // the external, non-invasive way to get a correctly colored
              // scene without changing ArmModelViewer itself.
              key={`arm-viewer-${armViewerMode}`}
              accentColor={colors.accent}
              // Canvas fill matches the page background exactly, in both
              // modes — an earlier attempt used surfaceSecondary here for a
              // Light-only "stage," but that read as a rectangular media
              // placeholder box, not a subtle grounding. Blending the canvas
              // into the page (no seam, no box) is what actually gives the
              // robot presence without a card. Dark is unaffected since it
              // was always `background` here.
              backgroundColor={colors.background}
              compact
              floorColor={colors.surfaceSecondary}
              onInteractionEnd={handleHeroInteractionEnd}
              onInteractionStart={handleHeroInteractionStart}
              reduceMotion={reduceMotion}
              showFaults={false}
              softFloor
            />
          </View>
        </View>
      </View>

      <View pointerEvents="none" style={[styles.copy, { marginTop: -copyLift }]}>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} style={styles.centered} variant="hero">
          {name}
        </SkyText>
        <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="body">
          {headline}
        </SkyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroViewport: {
    width: "100%"
  },
  hero: {
    width: "100%"
  },
  modelSlot: {
    flex: 1,
    width: "100%"
  },
  copy: {
    alignItems: "center",
    gap: layout.hairlineGap
  },
  centered: {
    textAlign: "center"
  }
});
