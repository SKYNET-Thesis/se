import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyButton, SkyText } from "../../components/ui";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { useAuth } from "../AuthContext";
import { WelcomeVisual } from "../components/WelcomeVisual";
import { WELCOME_MEDIA } from "../welcomeMedia";

type Props = {
  fontsReady: boolean;
  onLogin: () => void;
  onSignUp: () => void;
};

// The action panel rises this far over the stage, with matching top
// corners — the same stage → sheet composition as the Skills library, so
// the entrance and the app read as one product. Equal values keep the
// stage (never the page) behind the curved corners.
const PANEL_RADIUS = 28;
const PANEL_OVERLAP = PANEL_RADIUS;
// On very short screens (or large accessibility text) the stage gives way
// first, but never collapses; past that the screen scrolls instead of
// hiding an action.
const STAGE_MIN_HEIGHT = 200;
// The stage never takes more than this share of the screen, so tall phones
// don't push the message and actions into a cramped strip; the panel takes
// the rest instead (see panel / stage styles).
const STAGE_MAX_SHARE = 0.6;

// SkyNex's entrance: the step from the brand story (onboarding) to account
// access. A dominant visual stage, one line of human copy, and three
// clearly ranked choices. No form fields, no social login, no robot status.
export function WelcomeScreen({ fontsReady, onLogin, onSignUp }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { continueAsGuest } = useAuth();
  // Measured where the panel begins (the stage runs under it by the overlap).
  const stageMaxHeight = Math.round(windowHeight * STAGE_MAX_SHARE) + PANEL_OVERLAP;

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {/* Full bleed, under the status bar. Takes all the height the panel
          doesn't need, up to 60% of the screen. */}
      <WelcomeVisual
        coveredBottom={PANEL_OVERLAP}
        coveredTop={insets.top}
        media={WELCOME_MEDIA}
        style={[styles.stage, { maxHeight: stageMaxHeight }]}
      />

      {/* The one brand presence: the wordmark. The fallback stage shows the
          mark alone, without text, so the name is never repeated. */}
      <View pointerEvents="none" style={[styles.wordmark, { top: insets.top + space.md }]}>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
          SkyNex
        </SkyText>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        {/* Headline at the top of the panel, actions at the bottom: on tall
            phones the extra space opens between them and the actions stay
            in thumb reach. */}
        <SkyText fontsReady={fontsReady} style={styles.headline} variant="title">
          Trợ lý AI cho cuộc sống hằng ngày.
        </SkyText>

        {/* Ranked by weight, not color alone: a filled button, an outlined
            neutral button, then plain text. */}
        <View style={styles.actions}>
          <SkyButton fontsReady={fontsReady} onPress={onLogin} size="lg">
            Đăng nhập
          </SkyButton>
          <SkyButton fontsReady={fontsReady} onPress={onSignUp} size="lg" variant="secondary">
            Tạo tài khoản
          </SkyButton>
          <Pressable
            accessibilityHint="Dùng SkyNex ngay, có thể tạo tài khoản sau"
            accessibilityLabel="Tiếp tục không cần tài khoản"
            accessibilityRole="button"
            hitSlop={4}
            onPress={continueAsGuest}
            style={({ pressed }) => [styles.guest, pressed && styles.pressed]}
          >
            <SkyText fontsReady={fontsReady} tone="secondary" variant="cardTitle">
              Tiếp tục không cần tài khoản
            </SkyText>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      flexGrow: 1
    },
    // Space goes to the stage first (far larger grow factor) until it hits
    // its max height; only then does the panel grow.
    stage: {
      flexGrow: 1000,
      marginBottom: -PANEL_OVERLAP,
      minHeight: STAGE_MIN_HEIGHT
    },
    wordmark: {
      left: layout.screenGutter,
      position: "absolute"
    },
    panel: {
      backgroundColor: colors.background,
      borderTopLeftRadius: PANEL_RADIUS,
      borderTopRightRadius: PANEL_RADIUS,
      flexGrow: 1,
      gap: space.xl,
      justifyContent: "space-between",
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.xxl
    },
    headline: {
      // Keeps the line short enough to break into two calm lines on every
      // width instead of one long run on wide phones.
      maxWidth: 320
    },
    actions: {
      gap: space.sm
    },
    // Text-level action, but still a full 44pt target.
    guest: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44
    },
    pressed: {
      opacity: 0.7
    }
  });
}
