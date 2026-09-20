import { CircleCheck } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type Props = {
  colors: ThemeColors;
  fontsReady: boolean;
  subtitle?: string;
  title: string;
  visible: boolean;
};

// Lightweight, reusable confirmation toast — no toast/notification
// component existed anywhere in the codebase (checked src/components and
// src/screens). Deliberately a plain absolutely-positioned View, not this
// app's existing <Modal>-based overlay pattern (ResetConfirmModal,
// ManualConfirmModal): those are blocking confirmations that must capture
// touches, while a toast is passive/auto-dismissing and must never block
// interaction with the screen underneath it (pointerEvents="none" below).
// Stays mounted always and animates opacity/position instead of
// mounting/unmounting on `visible`, so the fade-out on hide isn't skipped.
export function Toast({ colors, fontsReady, subtitle, title, visible }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : 12, duration: 200, useNativeDriver: true })
    ]).start();
  }, [opacity, translateY, visible]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      pointerEvents="none"
      style={[styles.toast, { opacity, transform: [{ translateY }] }]}
    >
      <CircleCheck color={colors.accentStrong} size={18} />
      <View style={styles.text}>
        <Text style={[styles.title, font("display", fontsReady)]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, font("body", fontsReady)]}>{subtitle}</Text>}
      </View>
    </Animated.View>
  );
}

// Same surface/border/radius language as this app's existing modal cards
// (see ResetConfirmModal in App.tsx) — a toast is just the non-blocking
// version of the same "card floating on the page" visual.
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toast: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      bottom: spacing.xl,
      flexDirection: "row",
      gap: spacing.sm,
      left: spacing.xl,
      padding: spacing.md,
      position: "absolute",
      right: spacing.xl
    },
    text: {
      flex: 1,
      gap: 2
    },
    title: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    subtitle: {
      ...type.small,
      color: colors.textSecondary
    }
  });
}
