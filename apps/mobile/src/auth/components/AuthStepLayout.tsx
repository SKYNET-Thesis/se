import { ArrowRight } from "lucide-react-native";
import { ReactNode, useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { AuthBackButton } from "./AuthFormLayout";

type Props = {
  // 0-based position and total, for the progress line.
  step: number;
  stepCount: number;
  question: string;
  // One short supporting line at most.
  hint?: string;
  onBack: () => void;
  // The step's 1–2 inputs.
  children: ReactNode;
  // Bottom row: an optional quiet element on the left (e.g. "Đã có tài
  // khoản? Đăng nhập") and the forward action on the right.
  bottomLeft?: ReactNode;
  // Defaults to the round "Tiếp tục" arrow; the final step passes its own
  // full-width action instead.
  action: ReactNode;
  fontsReady: boolean;
};

const FORM_MAX_WIDTH = 480;

// One question per screen for Create Account: back + a thin progress line
// on top, the question as the screen's title, the step's inputs, and a
// light forward action at the bottom (lifted above the keyboard on iOS;
// Android resizes the window). Generous space on purpose — no card, no
// "Bước 3/7" chrome.
export function AuthStepLayout({
  action,
  bottomLeft,
  children,
  fontsReady,
  hint,
  onBack,
  question,
  step,
  stepCount
}: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
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
          <View style={styles.topRow}>
            <AuthBackButton onPress={onBack} />
            <StepProgress colors={colors} step={step} stepCount={stepCount} />
          </View>

          <View style={styles.intro}>
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
              {question}
            </SkyText>
            {hint ? (
              <SkyText fontsReady={fontsReady} tone="secondary">
                {hint}
              </SkyText>
            ) : null}
          </View>

          {children}
        </View>

        {/* With nothing on the left, the round action sits bottom-right —
            where the thumb already is. */}
        <View style={[styles.column, styles.bottom, !bottomLeft && styles.bottomEnd]}>
          {bottomLeft ? <View style={styles.bottomLeft}>{bottomLeft}</View> : null}
          {action}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The round forward action for steps 1–6: present and obvious, but light —
// a lime circle rather than a full-width bar on every screen.
export function StepNextButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityLabel="Tiếp tục"
      accessibilityRole="button"
      aria-disabled={Boolean(disabled)}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.next, pressed && styles.nextPressed]}
    >
      <ArrowRight color={colors.onAccent} size={24} />
    </Pressable>
  );
}

// Thin segmented line: done and current segments filled, the rest quiet.
// The count is for screen readers only — no "Bước 3/7" on screen.
function StepProgress({ colors, step, stepCount }: { colors: SkyNexColors; step: number; stepCount: number }) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityLabel={`Bước ${step + 1} trên ${stepCount}`}
      accessibilityRole="progressbar"
      aria-valuemax={stepCount}
      aria-valuemin={1}
      aria-valuenow={step + 1}
      accessible
      style={styles.progress}
    >
      {Array.from({ length: stepCount }, (_, i) => (
        <View key={i} style={[styles.segment, i <= step && styles.segmentDone]} />
      ))}
    </View>
  );
}

const NEXT_SIZE = 56;

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
    topRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xs
    },
    progress: {
      flex: 1,
      flexDirection: "row",
      gap: space.xxs
    },
    segment: {
      backgroundColor: colors.border,
      borderRadius: corner.pill,
      flex: 1,
      height: 3
    },
    segmentDone: {
      backgroundColor: colors.accentInk
    },
    intro: {
      gap: space.xs,
      marginBottom: space.xl,
      marginTop: space.xxl
    },
    bottom: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      justifyContent: "space-between",
      marginTop: space.xxl
    },
    bottomEnd: {
      justifyContent: "flex-end"
    },
    bottomLeft: {
      flex: 1
    },
    next: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: corner.pill,
      height: NEXT_SIZE,
      justifyContent: "center",
      width: NEXT_SIZE
    },
    nextPressed: {
      opacity: 0.78
    }
  });
}
