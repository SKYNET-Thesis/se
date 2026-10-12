import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyButton, SkyText } from "../../components/ui";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { font } from "../../theme";
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

// SkyNex's entrance: the step from the brand story (onboarding) into the
// app. A dominant visual stage, the promise, and the choices ranked by what
// actually works today: continuing without an account is the real path, so
// it is the one primary action. Accounts aren't available yet (no backend —
// see services/authService.ts); Sign in / Create account stay reachable as
// quiet previews under an honest line, never dressed as the main way in.
// No form fields, no social login, no robot status.
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
        <SkyText
          accessibilityRole="header"
          fontsReady={fontsReady}
          style={font("displayBold", fontsReady)}
          variant="sectionTitle"
        >
          SkyNex
        </SkyText>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        {/* Headline at the top of the panel, actions at the bottom: on tall
            phones the extra space opens between them and the actions stay
            in thumb reach. */}
        <View style={styles.message}>
          <SkyText fontsReady={fontsReady} style={styles.headline} variant="title">
            Trợ lý AI cho cuộc sống hằng ngày.
          </SkyText>
          <SkyText fontsReady={fontsReady} style={styles.headline} tone="secondary">
            Dùng ngay mọi tính năng hiện có, không cần tài khoản.
          </SkyText>
        </View>

        {/* Ranked by what works: one filled action that really enters the
            app, then the account previews as quiet text under a plain
            statement of their state. */}
        <View style={styles.actions}>
          <SkyButton
            accessibilityHint="Vào SkyNex ngay. Bạn có thể tạo tài khoản khi tính năng này ra mắt."
            fontsReady={fontsReady}
            onPress={continueAsGuest}
            size="lg"
          >
            Tiếp tục không cần tài khoản
          </SkyButton>

          <View style={styles.accounts}>
            <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
              Tài khoản SkyNex sắp ra mắt.
            </SkyText>
            <View style={styles.accountLinks}>
              <AccountLink
                fontsReady={fontsReady}
                hint="Xem trước màn hình đăng nhập. Đăng nhập chưa khả dụng."
                label="Đăng nhập"
                onPress={onLogin}
                styles={styles}
              />
              <View style={[styles.linkDot, { backgroundColor: colors.border }]} />
              <AccountLink
                fontsReady={fontsReady}
                hint="Xem trước các bước tạo tài khoản. Tạo tài khoản chưa khả dụng."
                label="Tạo tài khoản"
                onPress={onSignUp}
                styles={styles}
              />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// A quiet, text-level action that still has a full 44pt target.
function AccountLink({
  fontsReady,
  hint,
  label,
  onPress,
  styles
}: {
  fontsReady: boolean;
  hint: string;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <SkyText fontsReady={fontsReady} variant="cardTitle">
        {label}
      </SkyText>
    </Pressable>
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
    message: {
      gap: space.xs
    },
    headline: {
      // Keeps lines short enough to break calmly on every width instead of
      // one long run on wide phones.
      maxWidth: 320
    },
    actions: {
      gap: space.md
    },
    accounts: {
      alignItems: "center",
      gap: space.xxs
    },
    centered: {
      textAlign: "center"
    },
    accountLinks: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xs
    },
    link: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: space.sm
    },
    linkDot: {
      borderRadius: 2,
      height: 4,
      width: 4
    },
    pressed: {
      opacity: 0.7
    }
  });
}
