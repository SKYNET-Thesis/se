import { CircleAlert, Eye, EyeOff } from "lucide-react-native";
import { forwardRef, ReactNode, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, TextInputProps, TextStyle, View } from "react-native";
import { SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { font, type } from "../../theme";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  // Shown under the field with an icon, so it never relies on color alone.
  error?: string | null;
  // e.g. the password visibility toggle; sits inside the field, right side.
  rightAccessory?: ReactNode;
  fontsReady?: boolean;
};

// The SkyNex account-form field: a visible label above a calm filled field.
// Focus is carried by the border (accent), an error by border + icon +
// message. Kept small on purpose — the auth screens' field, not a form
// library. The ref is the TextInput's, for next/done focus flow.
export const AuthTextField = forwardRef<TextInput, Props>(function AuthTextField(
  { editable = true, error, fontsReady = true, label, onBlur, onFocus, rightAccessory, ...inputProps },
  ref
) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.root}>
      {/* Hidden from screen readers: the input carries the same label. */}
      <SkyText accessible={false} fontsReady={fontsReady} importantForAccessibility="no" variant="status">
        {label}
      </SkyText>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          Boolean(error) && styles.fieldError,
          !editable && styles.fieldDisabled
        ]}
      >
        <TextInput
          {...inputProps}
          accessibilityLabel={label}
          // Read after the label, so the problem is announced with the field.
          accessibilityHint={error ?? undefined}
          editable={editable}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.textSecondary}
          ref={ref}
          style={[styles.input, font("body", fontsReady), !editable && styles.inputDisabled]}
        />
        {rightAccessory}
      </View>

      {error ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          <CircleAlert color={colors.statusDanger} size={14} strokeWidth={2.25} />
          <SkyText fontsReady={fontsReady} style={styles.errorText} variant="caption">
            {error}
          </SkyText>
        </View>
      ) : null}
    </View>
  );
});

// Password visibility toggle for AuthTextField's rightAccessory. A full
// 44pt target inside the field, not a tiny icon.
export function PasswordVisibilityToggle({
  disabled,
  onToggle,
  visible
}: {
  disabled?: boolean;
  onToggle: () => void;
  visible: boolean;
}) {
  const { colors } = useSkyNexTokens();
  const Icon = visible ? EyeOff : Eye;

  return (
    <Pressable
      accessibilityLabel={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [toggleStyles.toggle, pressed && toggleStyles.pressed]}
    >
      <Icon color={colors.textSecondary} size={20} />
    </Pressable>
  );
}

const FIELD_HEIGHT = 52;

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    root: {
      gap: space.xs
    },
    // Same height as the md SkyButton, so fields and actions share a rhythm.
    field: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.card,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: FIELD_HEIGHT,
      paddingLeft: layout.cardPadding,
      // The accessory brings its own 44pt box; without one, mirror the left.
      paddingRight: space.xxs
    },
    fieldFocused: {
      borderColor: colors.accentInk
    },
    fieldError: {
      borderColor: colors.statusDanger
    },
    fieldDisabled: {
      opacity: 0.6
    },
    input: {
      ...type.body,
      color: colors.textPrimary,
      flex: 1,
      minHeight: FIELD_HEIGHT - 2,
      // The browser draws its own square focus ring inside the rounded
      // field; the field's accent border already shows focus. Web only —
      // "none" is a CSS value React Native's native style types don't know.
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : null),
      paddingRight: space.sm,
      paddingVertical: 0
    },
    inputDisabled: {
      color: colors.textSecondary
    },
    error: {
      alignItems: "center",
      flexDirection: "row",
      gap: layout.inlineGap - 2
    },
    errorText: {
      color: colors.statusDanger,
      flexShrink: 1
    }
  });
}

const toggleStyles = StyleSheet.create({
  toggle: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  pressed: {
    opacity: 0.6
  }
});
