import { useRef, useState } from "react";
import {
  Animated,
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
import { colors, font, radius, spacing, type } from "../theme";
import { markOnboardingCompleted } from "../services/onboardingStorage";
import { BRAND_MARK, CTA_CONTINUE, CTA_SKIP, CTA_START, ONBOARDING_SLIDES, OnboardingSlide } from "./onboardingData";
import { MotionTrajectory } from "./MotionTrajectory";
import { OnboardingHero } from "./OnboardingHero";
import { HeroCardAccent, HeroCardBackdrop, TelemetryHud } from "./OnboardingVisuals";

// Not on the theme's radius scale (status/button/card/round) — a one-off
// for this screen's single large hero card.
const HERO_CARD_RADIUS = 28;

type Props = {
  fontsReady: boolean;
  reduceMotion: boolean;
  onComplete: () => void;
};

const SLIDE_COUNT = ONBOARDING_SLIDES.length;

export function OnboardingScreen({ fontsReady, reduceMotion, onComplete }: Props) {
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
      <MotionTrajectory opacity={0.45} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[styles.brand, font("display", fontsReady)]}>{BRAND_MARK}</Text>
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
          <HeroCardBackdrop style={StyleSheet.absoluteFill} />

          <OnboardingHero reduceMotion={reduceMotion} style={StyleSheet.absoluteFill} />

          <Svg height={132} pointerEvents="none" style={styles.topScrim} width="100%">
            <Defs>
              <LinearGradient id="topScrim" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={colors.bg} stopOpacity={0.92} />
                <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#topScrim)" height="100%" width="100%" />
          </Svg>

          <HeroCardAccent />
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
              fontsReady={fontsReady}
              index={i}
              key={slide.id}
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
  fontsReady,
  index,
  reduceMotion,
  scrollX,
  slide,
  width
}: {
  fontsReady: boolean;
  index: number;
  reduceMotion: boolean;
  scrollX: Animated.Value;
  slide: OnboardingSlide;
  width: number;
}) {
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
          <Text style={[styles.title, font("display", fontsReady)]}>
            <Text style={styles.titleMain}>{slide.titleMain}</Text>
            <Text style={styles.titleAccent}>{slide.titleAccent}</Text>
          </Text>
          <Text style={[styles.subtitle, font("body", fontsReady)]}>{slide.subtitle}</Text>
        </View>

        <View style={styles.hudArea}>
          <TelemetryHud stats={slide.stats} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    zIndex: 2
  },
  brand: {
    ...type.label,
    color: colors.textLo,
    letterSpacing: 2
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
    color: colors.textHi
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
  title: {
    ...type.display,
    fontSize: 46,
    includeFontPadding: true,
    letterSpacing: -0.5,
    lineHeight: 62,
    paddingTop: spacing.xxs
  },
  titleMain: {
    color: colors.textHi
  },
  titleAccent: {
    color: colors.accent
  },
  subtitle: {
    ...type.body,
    color: colors.textLo
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
    color: colors.accentText
  },
  ctaIcon: {
    alignItems: "center",
    backgroundColor: colors.accentText,
    borderRadius: radius.round,
    height: 36,
    justifyContent: "center",
    width: 36
  }
});
