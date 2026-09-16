import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { font, radius, spacing, ThemeColors, ThemeMode, type } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { markOnboardingCompleted } from "../services/onboardingStorage";
import { BRAND_MARK, CTA_CONTINUE, CTA_SKIP, CTA_START, ONBOARDING_SLIDES, OnboardingSlide } from "./onboardingData";
import { MotionTrajectory } from "./MotionTrajectory";
import { OnboardingHero } from "./OnboardingHero";
import { HeroCardAccent, HeroCardBackdrop, TelemetryHud } from "./OnboardingVisuals";

// Not on the theme's radius scale (status/button/card/round) — a one-off
// for this screen's single large hero card.
const HERO_CARD_RADIUS = 28;

// The mark's large white sculptural surfaces read fine straight onto Dark's
// near-black background, but nearly vanish on Light's near-white one (see
// LOGO ASSET QA in the branding pass brief). Rather than inventing a new
// outline/backing treatment, Light reuses the already-approved dark-mark
// asset — a self-contained tile with its own dark field baked in — so the
// mark keeps full contrast without any geometry edits.
const BRAND_MARK_DARK_MODE = require("../../assets/brand/production/skynex-mark-transparent.png");
const BRAND_MARK_LIGHT_MODE = require("../../assets/brand/production/skynex-mark-dark.png");

type Props = {
  fontsReady: boolean;
  reduceMotion: boolean;
  onComplete: () => void;
};

const SLIDE_COUNT = ONBOARDING_SLIDES.length;

export function OnboardingScreen({ fontsReady, reduceMotion, onComplete }: Props) {
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  // The pager lives inside the hero card, not the raw screen — the card is
  // inset by margin + border, so the ScrollView's actual viewport is
  // narrower than `width`. Every slide (and the scrollTo/paging math) must
  // size itself to the ScrollView's own measured width, or a slide's
  // content overflows into its neighbor: the viewport was narrower than
  // each page, so page N's content bled off its right edge while page
  // N+1 peeked in from the left. Measured via onLayout on the ScrollView
  // itself (not an ancestor) so it exactly matches what the browser/native
  // paging engine actually scrolls by. Falls back to `width` only for the
  // first paint before onLayout fires.
  const [cardWidth, setCardWidth] = useState(width);
  const isLast = index === SLIDE_COUNT - 1;

  const finish = () => {
    void markOnboardingCompleted();
    onComplete();
  };

  const handleCardLayout = (event: LayoutChangeEvent) => {
    setCardWidth(event.nativeEvent.layout.width);
  };

  const goToIndex = (next: number) => {
    scrollRef.current?.scrollTo({ animated: !reduceMotion, x: next * cardWidth });
    setIndex(next);
  };

  const handleContinue = () => {
    if (isLast) {
      finish();
    } else {
      goToIndex(index + 1);
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
    setIndex(Math.max(0, Math.min(SLIDE_COUNT - 1, next)));
  };

  return (
    <View style={styles.screen}>
      <MotionTrajectory colors={colors} opacity={0.45} style={StyleSheet.absoluteFill} />

      {/* No wordmark here — the one deliberate brand moment lives in the
          first slide's own content (see SlidePage below), so it fades in
          with that slide instead of nagging as a persistent header on
          every screen. Skip is the only thing that needs to stay put. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityLabel={CTA_SKIP}
          accessibilityRole="button"
          hitSlop={8}
          onPress={finish}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={[styles.skipText, font("body", fontsReady)]}>{CTA_SKIP}</Text>
        </Pressable>
      </View>

      {/* One persistent hero: the robot never remounts between slides, only
          the text/HUD layer above it swaps as the pager scrolls. */}
      <View style={styles.body}>
        <View pointerEvents="none" style={styles.cardClip}>
          <HeroCardBackdrop colors={colors} style={StyleSheet.absoluteFill} />

          <OnboardingHero
            fallbackBackgroundColor={colors.background}
            groundShadowColor={colors.surfaceSecondary}
            reduceMotion={reduceMotion}
            style={StyleSheet.absoluteFill}
          />

          <Svg height={132} pointerEvents="none" style={styles.topScrim} width="100%">
            <Defs>
              <LinearGradient id="topScrim" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={colors.background} stopOpacity={0.92} />
                <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#topScrim)" height="100%" width="100%" />
          </Svg>

          <HeroCardAccent colors={colors} />
        </View>

        <Animated.ScrollView
          bounces={false}
          horizontal
          onLayout={handleCardLayout}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true
          })}
          pagingEnabled
          ref={scrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
        >
          {ONBOARDING_SLIDES.map((slide, i) => (
            <SlidePage
              colors={colors}
              fontsReady={fontsReady}
              index={i}
              key={slide.id}
              mode={mode}
              reduceMotion={reduceMotion}
              scrollX={scrollX}
              slide={slide}
              width={cardWidth}
            />
          ))}
        </Animated.ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.dots}>
          {ONBOARDING_SLIDES.map((slide, i) => (
            <View key={slide.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Pressable
          accessibilityLabel={isLast ? CTA_START : CTA_CONTINUE}
          accessibilityRole="button"
          onPress={handleContinue}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={[styles.ctaText, font("display", fontsReady)]}>{isLast ? CTA_START : CTA_CONTINUE}</Text>
          <View style={styles.ctaIcon}>
            <ArrowRight color={colors.accent} size={20} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function SlidePage({
  colors,
  fontsReady,
  index,
  mode,
  reduceMotion,
  scrollX,
  slide,
  width
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  index: number;
  mode: ThemeMode;
  reduceMotion: boolean;
  scrollX: Animated.Value;
  slide: OnboardingSlide;
  width: number;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  const opacity = reduceMotion
    ? 1
    : scrollX.interpolate({ extrapolate: "clamp", inputRange, outputRange: [0, 1, 0] });
  const translateY = reduceMotion
    ? 0
    : scrollX.interpolate({ extrapolate: "clamp", inputRange, outputRange: [14, 0, 14] });

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.slideContent, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.copyArea}>
          {/* Brand strongest here, on the very first slide only — mark +
              name read as the platform identity, with the slide's own
              headline right underneath introducing SO-ARM101 as the
              current hardware it drives. Every other slide stays free of
              this so it never repeats. */}
          {index === 0 && (
            <View style={styles.brandMoment}>
              <View style={[styles.brandMarkFrame, mode === "light" && styles.brandMarkFrameLight]}>
                <Image
                  resizeMode="cover"
                  source={mode === "light" ? BRAND_MARK_LIGHT_MODE : BRAND_MARK_DARK_MODE}
                  style={styles.brandMarkImage}
                />
              </View>
              <Text style={[styles.brandWordmark, font("display", fontsReady)]}>{BRAND_MARK}</Text>
            </View>
          )}

          <Text style={[styles.title, font("display", fontsReady)]}>
            <Text style={styles.titleMain}>{slide.titleMain}</Text>
            <Text style={styles.titleAccent}>{slide.titleAccent}</Text>
          </Text>
          <Text style={[styles.subtitle, font("body", fontsReady)]}>{slide.subtitle}</Text>
        </View>

        <View style={styles.hudArea}>
          <TelemetryHud colors={colors} stats={slide.stats} />
        </View>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.sm,
      zIndex: 2
    },
    skipButton: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: spacing.md
    },
    skipText: {
      ...type.label,
      color: colors.textPrimary
    },
    pressed: {
      opacity: 0.7
    },
    body: {
      borderColor: colors.border,
      borderRadius: HERO_CARD_RADIUS,
      borderWidth: 1,
      flex: 1,
      marginBottom: spacing.sm,
      marginHorizontal: spacing.lg,
      position: "relative"
    },
    cardClip: {
      borderRadius: HERO_CARD_RADIUS,
      bottom: 0,
      left: 0,
      overflow: "hidden",
      position: "absolute",
      right: 0,
      top: 0
    },
    topScrim: {
      left: 0,
      position: "absolute",
      right: 0,
      top: 0
    },
    pager: {
      flex: 1
    },
    slide: {
      flex: 1,
      overflow: "hidden"
    },
    slideContent: {
      flex: 1,
      paddingHorizontal: spacing.xl
    },
    copyArea: {
      gap: spacing.xs,
      paddingTop: spacing.lg
    },
    brandMoment: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
      marginBottom: spacing.xs
    },
    brandMarkFrame: {
      height: 32,
      overflow: "hidden",
      width: 32
    },
    // Only applied on Light — see BRAND_MARK_LIGHT_MODE above: that asset is
    // a filled dark tile, so rounding its corners here reads as a deliberate
    // small brand chip rather than a hard-edged photo. Dark's mark is
    // transparent, so its frame stays unrounded (there's no edge to round).
    brandMarkFrameLight: {
      borderRadius: 10
    },
    brandMarkImage: {
      height: "100%",
      width: "100%"
    },
    brandWordmark: {
      ...type.bodyStrong,
      color: colors.textPrimary,
      letterSpacing: 0.3
    },
    title: {
      ...type.display,
      fontSize: 46,
      includeFontPadding: true,
      letterSpacing: -0.5,
      lineHeight: 62,
      paddingTop: spacing.xxs
    },
    titleMain: {
      color: colors.textPrimary
    },
    // accentStrong, not bare accent — this text sits directly on the hero
    // card surface, and plain lime nearly disappears on Light (see the
    // theme.ts comment on accent vs accentStrong). Zero visual change on
    // Dark, where accentStrong equals accent.
    titleAccent: {
      color: colors.accentStrong
    },
    subtitle: {
      ...type.body,
      color: colors.textSecondary
    },
    hudArea: {
      flex: 1,
      justifyContent: "flex-end",
      paddingBottom: spacing.lg
    },
    footer: {
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm
    },
    dots: {
      alignSelf: "center",
      flexDirection: "row",
      gap: spacing.xs
    },
    dot: {
      backgroundColor: colors.border,
      borderRadius: radius.round,
      height: 6,
      width: 6
    },
    dotActive: {
      backgroundColor: colors.accent,
      width: 20
    },
    cta: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.card,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 60,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    ctaPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }]
    },
    ctaText: {
      ...type.title,
      color: colors.accentForeground
    },
    ctaIcon: {
      alignItems: "center",
      backgroundColor: colors.accentForeground,
      borderRadius: radius.round,
      height: 36,
      justifyContent: "center",
      width: 36
    }
  });
}
