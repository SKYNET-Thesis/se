import { AlertTriangle, RotateCcw, ShieldAlert, User } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  // Home shows the avatar shortcut here; every other working screen leaves
  // this slot empty — ScreenHeader already carries back/title/subtitle for
  // those screens, so GlobalChrome doesn't need to repeat a brand wordmark.
  // E-STOP itself never moves or changes behavior either way — only the
  // left-hand slot's content changes.
  isHome?: boolean;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  // Home-only: the avatar is a shortcut into Settings > Tài khoản (account
  // management lives there, not as its own profile system). Unused when
  // isHome is false since only Home renders the avatar.
  onOpenAccount?: () => void;
};

export function GlobalChrome({
  emergencyStopped,
  fontsReady,
  isHome = false,
  onEmergencyStop,
  onOpenAccount,
  onResetEmergencyStop
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focusedControl, setFocusedControl] = useState<"reset" | "stop" | null>(null);

  return (
    <View style={styles.chrome}>
      {isHome ? (
        <Pressable
          accessibilityHint="Mở Cài đặt, mục Tài khoản"
          accessibilityLabel="Tài khoản"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenAccount}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <User color={colors.textSecondary} size={17} strokeWidth={2} />
        </Pressable>
      ) : (
        // Empty spacer, not just an omitted element: with only the stop
        // cluster left as a flex child, `justifyContent: space-between`
        // would collapse it to the row's start — this keeps E-STOP pinned
        // to the right, matching the Home layout it sits beside.
        <View style={styles.leftSlot} />
      )}

      <View style={styles.stopCluster}>
        {emergencyStopped && (
          <Pressable
            accessibilityHint="Xác nhận trước khi bỏ trạng thái dừng khẩn cấp"
            accessibilityLabel="Reset E-STOP"
            accessibilityRole="button"
            onBlur={() => setFocusedControl(null)}
            onFocus={() => setFocusedControl("reset")}
            onPress={onResetEmergencyStop}
            style={({ pressed }) => [styles.resetButton, focusedControl === "reset" && styles.focused, pressed && styles.pressed]}
          >
            <RotateCcw size={14} color={colors.textPrimary} />
            <Text style={[styles.resetText, font("display", fontsReady)]}>Reset</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityHint="Dừng chuyển động toàn hệ thống ngay lập tức"
          accessibilityLabel={emergencyStopped ? "Hệ thống đang E-STOP" : "Kích hoạt E-STOP"}
          accessibilityRole="button"
          accessibilityState={{ disabled: emergencyStopped }}
          disabled={emergencyStopped}
          onBlur={() => setFocusedControl(null)}
          onFocus={() => setFocusedControl("stop")}
          onPress={onEmergencyStop}
          style={({ pressed }) => [
            styles.stopButton,
            emergencyStopped && styles.stopButtonActive,
            focusedControl === "stop" && styles.focusedDanger,
            pressed && styles.pressed
          ]}
        >
          {emergencyStopped ? (
            <AlertTriangle size={15} color={colors.dangerForeground} />
          ) : (
            <ShieldAlert size={15} color={colors.dangerForeground} />
          )}
          <Text style={[styles.stopText, font("display", fontsReady)]}>
            {emergencyStopped ? "ĐÃ DỪNG" : "E-STOP"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// A function (not a module-level StyleSheet.create) because color values
// now come from whichever theme is active — this runs once per theme change
// (memoized above), not once per module load.
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chrome: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm
    },
    leftSlot: {
      width: 1
    },
    // Deliberately smaller than the E-STOP button (36 vs 40 minHeight) and
    // neutral (surface/border, no accent) so it never competes with E-STOP
    // for attention — E-STOP stays the unambiguous visual priority.
    avatar: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36
    },
    stopCluster: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs
    },
    stopButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: radius.button,
      flexDirection: "row",
      gap: spacing.xxs,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: spacing.sm
    },
    stopButtonActive: {
      opacity: 0.95
    },
    stopText: {
      ...type.label,
      color: colors.dangerForeground
    },
    resetButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.xxs,
      minHeight: 40,
      paddingHorizontal: spacing.sm
    },
    resetText: {
      ...type.label,
      color: colors.textPrimary
    },
    focused: {
      borderColor: colors.accentStrong
    },
    focusedDanger: {
      borderColor: colors.textPrimary,
      borderWidth: 2
    },
    pressed: {
      opacity: 0.78
    }
  });
}
