import { ComponentType, useMemo, useState } from "react";
import { Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

// Mock imageUrl values elsewhere in this app are placehold.co text-on-flat-
// color placeholders, not real photography (see TaskDetailScreen's own
// hasRealImage). Same check here, so a mock URL never renders as if it were
// a verified SO-ARM101 image.
function hasRealMedia(imageUrl?: string) {
  return !!imageUrl && !/placehold|placeholder|dummyimage/i.test(imageUrl);
}

// Short, fixed-opacity band stacks approximating a gradient, since this app
// has no gradient dependency — the same technique TaskDetailScreen's own
// hero fade already uses. The bottom fade blends the stage into whatever
// follows it; the top scrim is only there to keep a button overlaid on this
// stage (e.g. a screen's back button) legible once real media fills it —
// it renders at a fixed, deliberately small height and stays inert while
// the icon-emblem fallback is showing.
// Front-loaded darker than a plain linear ramp (was 0.04 at the top band)
// — a multi-line caption (title+subtitle+metadata) spans most of this
// zone, including its weakest/topmost band, so that band still needs
// enough contrast on its own against a bright photo, not just the fully
// opaque tail a short one-line caption could rely on.
const BOTTOM_FADE_OPACITIES = [0.2, 0.36, 0.5, 0.62, 0.74, 0.88, 1];
const TOP_SCRIM_OPACITIES = [0.3, 0.16, 0.06, 0];
const TOP_SCRIM_HEIGHT = 64;

export type HeroStageProps = {
  // Icon shown on the pedestal emblem while no real media is set.
  emblemIcon: IconComponent;
  emblemSize: number;
  // Height of the bottom fade transitioning the stage into whatever
  // follows it (as a fraction of `height`, computed by the caller).
  fadeHeight: number;
  // Only needed when `overline`/`title` are passed, for font selection —
  // optional so a caller with no caption (e.g. TasksScreen) never has to
  // pass it.
  fontsReady?: boolean;
  height: number;
  iconSize: number;
  // Where the interesting content sits vertically in the image, as a
  // fraction (0 = top, 1 = bottom; default 0.5/center) — biases the cover-
  // crop toward that region once the image's natural size and the stage's
  // rendered width are both known, instead of a plain centered crop.
  // Ignored while no image is set.
  imageFocalY?: number;
  // A bundled local asset (a `require(...)` result) — takes priority over
  // `imageUrl` when both are passed. This is how a verified, shipped
  // SO-ARM101 photo/render reaches the stage instead of a remote URL.
  imageSource?: ImageSourcePropType;
  // Reserved for a future verified SO-ARM101 cinematic image/task scene.
  // Undefined today, so the stage always renders the icon-emblem fallback
  // — passing a real URL later needs no structural change here: the media
  // layer already covers/crops it cleanly and lights it for overlaid UI.
  imageUrl?: string;
  // Optional identity caption overlaid at the bottom of the stage, inside
  // the existing bottom fade — this is what puts "product identity inside
  // the hero" instead of as a separate text block above/below it. Every
  // line is independently optional so each caller only renders what it
  // needs: TaskDetailScreen uses overline+title (small brand tag, large
  // task name); TasksScreen uses title+subtitle+metadata (large brand
  // name, tagline, capability line) with no overline.
  overline?: string;
  title?: string;
  subtitle?: string;
  metadata?: string;
};

// Reusable "product stage" hero visual: a dark graphite backdrop holding
// either a real media layer (future SO-ARM101 photo/task scene, cover-
// cropped, top-lit for overlaid buttons) or today's icon-emblem fallback —
// same premium treatment (soft ambient glow, bottom fade) TaskDetailScreen
// and TasksScreen both already settled on, now owned by one component
// instead of copied between them.
export function HeroStage({
  emblemIcon: Icon,
  emblemSize,
  fadeHeight,
  fontsReady = true,
  height,
  iconSize,
  imageFocalY = 0.5,
  imageSource,
  imageUrl,
  metadata,
  overline,
  subtitle,
  title
}: HeroStageProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showMedia = Boolean(imageSource) || hasRealMedia(imageUrl);
  const resolvedSource = imageSource ?? (imageUrl ? { uri: imageUrl } : undefined);

  // Stage width isn't known until layout, and the image's own pixel size
  // isn't known until it loads — until both are in, the plain 100%/100%
  // cover fallback below renders (native cover's own default center crop),
  // then this re-renders once with the biased crop. Same measure-then-
  // refine pattern as any RN focal-point crop; no library needed for it.
  const [stageWidth, setStageWidth] = useState(0);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const focalCrop = useMemo(() => {
    if (!imageNaturalSize || stageWidth <= 0) return null;

    // How tall the image renders once scaled to the stage's full width,
    // preserving its own aspect ratio — this is what native "cover" fills
    // the stage with when (as here) the stage is proportionally wider than
    // the image, cropping only top/bottom.
    const renderedHeight = stageWidth * (imageNaturalSize.height / imageNaturalSize.width);
    const overflow = renderedHeight - height;
    if (overflow <= 0) return null; // stage is taller than the image would cover width-first; plain cover already fits

    const focalPointY = renderedHeight * imageFocalY;
    const shift = Math.min(overflow, Math.max(0, focalPointY - height / 2));

    return { renderedHeight, shift };
  }, [height, imageFocalY, imageNaturalSize, stageWidth]);

  return (
    <View style={[styles.stage, { height }]} onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}>
      {showMedia && resolvedSource ? (
        <Image
          accessibilityIgnoresInvertColors
          onLoad={(event) => {
            const source = event?.nativeEvent?.source;

            if (!source) {
              return;
            }

            const width = source.width;
            const sourceHeight = source.height;

            if (width && sourceHeight) {
              setImageNaturalSize({
                width,
                height: sourceHeight,
              });
            }
          }}
          resizeMode="cover"
          source={resolvedSource}
          style={
            focalCrop
              ? [
                styles.media,
                {
                  height: focalCrop.renderedHeight,
                  position: "absolute",
                  top: -focalCrop.shift,
                  width: stageWidth
                }
              ]
              : styles.media
          }
        />
      ) : (
        <View style={styles.fallback}>
          <View
            style={[styles.glow, { borderRadius: emblemSize, height: emblemSize * 1.7, width: emblemSize * 1.7 }]}
          />
          <View style={[styles.emblem, { height: emblemSize, width: emblemSize }]}>
            <Icon color={colors.textPrimary} size={iconSize} strokeWidth={1.3} />
          </View>
        </View>
      )}

      {showMedia && (
        <View pointerEvents="none" style={styles.topScrim}>
          {TOP_SCRIM_OPACITIES.map((opacity, index) => (
            <View key={index} style={[styles.topScrimBand, { opacity }]} />
          ))}
        </View>
      )}

      <View pointerEvents="none" style={[styles.bottomFade, { height: fadeHeight }]}>
        {BOTTOM_FADE_OPACITIES.map((opacity, index) => (
          <View key={index} style={[styles.bottomFadeBand, { opacity }]} />
        ))}
      </View>

      {(overline || title || subtitle || metadata) && (
        <View pointerEvents="none" style={styles.caption}>
          {overline && (
            <Text style={[styles.captionOverline, font("display", fontsReady)]}>{overline}</Text>
          )}
          {title && <Text style={[styles.captionTitle, font("display", fontsReady)]}>{title}</Text>}
          {subtitle && (
            <Text style={[styles.captionSubtitle, font("body", fontsReady)]}>{subtitle}</Text>
          )}
          {metadata && (
            <Text style={[styles.captionMetadata, font("display", fontsReady)]}>{metadata}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // surfaceSecondary against the page's own `background` is this app's
    // established depth cue (no shadow/elevation anywhere) — that contrast
    // is what separates the stage from the content around it.
    stage: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      width: "100%"
    },
    // The dedicated media layer: cover + overflow hidden on the stage above
    // is what gives clean cropping for a portrait robot photo, a wider
    // task-action scene, or anything in between, with no per-orientation
    // handling needed.
    media: {
      height: "100%",
      width: "100%"
    },
    fallback: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center"
    },
    glow: {
      backgroundColor: colors.textPrimary,
      opacity: 0.05,
      position: "absolute"
    },
    emblem: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      justifyContent: "center"
    },
    topScrim: {
      flexDirection: "column",
      height: TOP_SCRIM_HEIGHT,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0
    },
    topScrimBand: {
      backgroundColor: colors.background,
      flex: 1
    },
    bottomFade: {
      bottom: 0,
      flexDirection: "column",
      left: 0,
      position: "absolute",
      right: 0
    },
    bottomFadeBand: {
      backgroundColor: colors.background,
      flex: 1
    },
    // Sits inside the bottom fade's fully-opaque zone, so it stays legible
    // against the theme's own background color regardless of what media is
    // behind it — no hardcoded dark scrim needed.
    caption: {
      bottom: spacing.lg,
      left: spacing.xl,
      position: "absolute",
      right: spacing.xl
    },
    captionOverline: {
      ...type.small,
      color: colors.textSecondary,
      letterSpacing: 1,
      marginBottom: spacing.xxs,
      textTransform: "uppercase"
    },
    captionTitle: {
      ...type.display,
      color: colors.textPrimary
    },
    // Same tighter-than-default lineHeight TasksScreen's own tagline used
    // before moving in here, so a literal "\n" two-line subtitle sits as
    // one calm unit under the title instead of drifting apart.
    captionSubtitle: {
      ...type.body,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: spacing.xxs
    },
    // Same subtle uppercase, letter-spaced micro-label idiom this app uses
    // for short capability facts, wherever it appears.
    captionMetadata: {
      ...type.small,
      color: colors.textSecondary,
      letterSpacing: 1,
      marginTop: spacing.xs
    }
  });
}
