import { ReactNode, useMemo } from "react";
import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { SkyText } from "./SkyText";

export type SkyButtonVariant = "primary" | "secondary" | "danger";

export type SkyButtonProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: SkyButtonVariant;
  loading?: boolean;
  fontsReady?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Reusable SkyNex action button.
// - primary: the brand lime fill. Meant to be the ONE dominant action on a
//   screen — the same rule TaskDetail's "Chạy tác vụ" CTA already follows.
// - secondary: neutral raised fill + border (Connect's action buttons).
// - danger: red fill (GlobalChrome's E-STOP treatment).
// Loading keeps the label visible next to a spinner so the button reads as
// the same action in progress, not as a different control.
export function SkyButton({
  accessibilityLabel,
  accessibilityState,
  children,
  disabled = false,
  fontsReady = true,
  loading = false,
  style,
  variant = "primary",
  ...rest
}: SkyButtonProps) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inactive = Boolean(disabled) || loading;
  const foreground =
    variant === "primary" ? colors.onAccent : variant === "danger" ? colors.onDanger : colors.textPrimary;

  return (
    <Pressable
      {...rest}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: inactive }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !inactive && styles.pressed,
        style
      ]}
    >
      {loading && <ActivityIndicator color={foreground} size="small" />}
      {typeof children === "string" ? (
        <SkyText fontsReady={fontsReady} numberOfLines={1} style={{ color: foreground }} variant="sectionTitle">
          {children}
        </SkyText>
      ) : (
        children
      )}
    </Pressable>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    // 52pt matches the app's existing full-width action buttons (Connect,
    // Calibrate) and clears the 44pt minimum touch target.
    base: {
      alignItems: "center",
      borderRadius: corner.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: layout.inlineGap,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: space.lg
    },
    primary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent
    },
    secondary: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border
    },
    danger: {
      backgroundColor: colors.statusDanger,
      borderColor: colors.statusDanger
    },
    // Same pressed/disabled opacities the existing screens already use.
    pressed: {
      opacity: 0.78
    },
    disabled: {
      opacity: 0.52
    }
  });
}
