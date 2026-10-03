import { ReactNode, useMemo } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { resolveSkillVisual } from "../../data/skillMedia";
import { corner } from "../../design-system/radius";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { MediaRef, Skill } from "../../types/skill";

// Frame shapes, fixed per placement and never dependent on whether media
// exists — that is what lets a real photo (or video) replace today's icon
// without any layout shift.
//   stage    — SkillHero, the tall visual stage. Portrait 4:5 by default
//              (~half of a phone's first viewport at full content width);
//              hero photography should be art-directed for a portrait crop.
//   featured — horizontal strips (16:9).
//   standard — library grid tiles (4:3: still most of the tile, but short
//              enough that a grid of them stays clearly below the stage).
export type SkillMediaShape = "stage" | "featured" | "standard";

export const SKILL_MEDIA_ASPECT: Record<SkillMediaShape, number> = {
  stage: 4 / 5,
  featured: 16 / 9,
  standard: 4 / 3
};

// Placeholder glyph size per frame: present but calm, so the empty state
// reads as intentional rather than as a missing image.
const ICON_SIZE: Record<SkillMediaShape, number> = {
  stage: 72,
  featured: 48,
  standard: 34
};

type Props = {
  skill: Pick<Skill, "media" | "icon">;
  shape: SkillMediaShape;
  // Frame size overrides for screens that size the stage themselves.
  // `height` wins over `aspectRatio`; with neither, the shape's ratio applies.
  aspectRatio?: number;
  height?: number;
  // Standalone use (SkillHero) rounds its own corners; inside a card the
  // card clips the frame instead.
  rounded?: boolean;
  // Overlays positioned by the caller (status, favorite).
  children?: ReactNode;
  // Placement-level art shown instead of the skill's own cover (the Skills
  // library hero). Same frame and fallback rules as a skill cover.
  cover?: MediaRef;
  style?: StyleProp<ViewStyle>;
};

// The visual area of a skill. Today every skill falls back to its
// placeholder icon; `media.cover` (bundled or remote, see
// data/skillMedia.ts) replaces it with a photo in the same frame.
//
// Video: `media.preview` is resolved by resolveSkillPreview(). No video
// player is installed yet, so the cover always renders as the poster; when
// one is added, it mounts here over the poster, for Skill Detail only —
// lists never autoplay (Skill Experience Principles §6).
//
// Decorative for screen readers: the card or hero around it carries the
// skill's name as its label.
export function SkillMedia({ aspectRatio, children, cover, height, rounded = false, shape, skill, style }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visual = resolveSkillVisual(cover ? { icon: skill.icon, media: { ...skill.media, cover } } : skill);
  const size = height !== undefined ? { height } : { aspectRatio: aspectRatio ?? SKILL_MEDIA_ASPECT[shape] };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, size, rounded && styles.rounded, style]}
    >
      {visual.kind === "media" ? (
        <View pointerEvents="none" style={styles.imageFill}>
          <Image accessibilityIgnoresInvertColors resizeMode="cover" source={visual.source} style={styles.image} />
        </View>
      ) : (
        <visual.Icon color={colors.textSecondary} size={ICON_SIZE[shape]} strokeWidth={1.5} />
      )}
      {children}
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    frame: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      justifyContent: "center",
      overflow: "hidden",
      width: "100%"
    },
    rounded: {
      borderRadius: corner.productCard
    },
    // Fills the whole frame regardless of any padding the caller adds — that
    // padding only re-centres the placeholder glyph (e.g. SkillHero clear of
    // a tray that overlaps its bottom edge); a photo still runs edge to edge.
    // The photo fills the WHOLE frame, padding included. An absolute
    // child's % size on native resolves against the frame's content box
    // (Yoga errata AbsolutePercentAgainstInnerSize), so a padded frame (the
    // Skills hero's sheet overlap) would cut the photo short on iOS/Android.
    // Edge insets span the padding box everywhere, so this wrapper is
    // exactly frame-sized; it has no padding, so the image's 100% is too.
    imageFill: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0
    },
    image: {
      height: "100%",
      width: "100%"
    }
  });
}
