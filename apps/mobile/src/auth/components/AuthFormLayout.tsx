import { ChevronLeft, Info } from "lucide-react-native";
import { ReactNode, useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";

type Props = {
  title: string;
  subtitle: string;
  onBack: () => void;
  // Fields, then the primary action (and any notice under it).
  children: ReactNode;
  // Bottom cross-link, e.g. "Chưa có tài khoản?" + "Tạo tài khoản".
  footerPrompt: string;
  footerActionLabel: string;
  onFooterAction: () => void;
  fontsReady: boolean;
};

// Wide phones and tablets keep a comfortable form measure instead of
// stretching fields edge to edge.
const FORM_MAX_WIDTH = 480;

// The shared frame of the account screens (Login, Create Account): back
// chevron, one strong title with a supporting line, the form, and a quiet
// cross-link anchored at the bottom. No visual stage, no logo — focus and
// trust after Welcome's emotion. Owns the keyboard handling so every auth
// form behaves the same: the screen lifts above the keyboard, taps on buttons
// work while it is open, and short screens scroll instead of hiding an
// action. "padding" on Android too: the app draws edge-to-edge
// (edgeToEdgeEnabled, enforced on Android 15+), so the window no longer
// shrinks for the keyboard (adjustResize) — without this the keyboard covered
// the bottom actions on device.
export function AuthFormLayout({
  children,
  fontsReady,
  footerActionLabel,
  footerPrompt,
  onBack,
  onFooterAction,
  subtitle,
  title
}: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.md, paddingTop: insets.top + space.xs }
        ]}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <AuthBackButton onPress={onBack} />

          <View style={styles.intro}>
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
              {title}
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary">
              {subtitle}
            </SkyText>
          </View>

          {children}

          {/* Social providers go here once they are real: a "hoặc" divider,
              then "Tiếp tục với Google" / "Tiếp tục với Apple" as secondary
              SkyButtons. Nothing is rendered until then. */}
        </View>

        {/* Pushed to the bottom on tall screens; follows the form on short
            ones (the content scrolls rather than overlapping). */}
        <View style={[styles.column, styles.footer]}>
          <SkyText fontsReady={fontsReady} tone="secondary">
            {footerPrompt}
          </SkyText>
          <Pressable
            accessibilityLabel={footerActionLabel}
            accessibilityRole="button"
            onPress={onFooterAction}
            style={({ pressed }) => [styles.footerAction, pressed && styles.pressed]}
          >
            <SkyText fontsReady={fontsReady} variant="sectionTitle">
              {footerActionLabel}
            </SkyText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Same back affordance the app uses elsewhere (TaskDetail): a 44pt chevron,
// announced in Vietnamese.
export function AuthBackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityLabel="Quay lại"
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <ChevronLeft color={colors.textPrimary} size={24} />
    </Pressable>
  );
}

// The calm "not available yet" message under an auth form's action.
// Neutral on purpose (info icon, no red): information, not an error.
export function AuthNotice({ fontsReady, message }: { fontsReady: boolean; message: string }) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <Info color={colors.textSecondary} size={18} />
      <SkyText fontsReady={fontsReady} style={styles.noticeText} tone="secondary" variant="caption">
        {message}
      </SkyText>
    </View>
  );
}

// Spacing shared by the forms inside the layout.
export const authFormStyles = StyleSheet.create({
  form: {
    gap: space.lg
  },
  actions: {
    gap: space.md,
    marginTop: space.xxl
  }
});

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      flexGrow: 1,
      justifyContent: "space-between",
      paddingHorizontal: layout.screenGutter
    },
    column: {
      alignSelf: "center",
      maxWidth: FORM_MAX_WIDTH,
      width: "100%"
    },
    // Optically aligned with the text below it: the chevron's glyph, not its
    // 44pt box, sits on the gutter.
    back: {
      alignItems: "center",
      height: 44,
      justifyContent: "center",
      marginLeft: -space.sm,
      width: 44
    },
    intro: {
      gap: space.xs,
      marginBottom: space.xxl,
      marginTop: space.xxl
    },
    notice: {
      alignItems: "flex-start",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.card,
      flexDirection: "row",
      gap: space.sm,
      padding: layout.cardPadding
    },
    noticeText: {
      flexShrink: 1
    },
    footer: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.xxs,
      justifyContent: "center",
      marginTop: space.xxl
    },
    footerAction: {
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: space.xxs
    },
    pressed: {
      opacity: 0.7
    }
  });
}
