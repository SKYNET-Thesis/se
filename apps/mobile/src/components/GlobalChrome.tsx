import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing, type } from "../theme";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
};

export function GlobalChrome({ emergencyStopped, fontsReady, onEmergencyStop, onResetEmergencyStop }: Props) {
  const [focusedControl, setFocusedControl] = useState<"reset" | "stop" | null>(null);

  return (
    <View style={styles.chrome}>
      <Text style={[styles.brand, font("display", fontsReady)]}>OmniArm</Text>

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
            <RotateCcw size={14} color={colors.textHi} />
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
            <AlertTriangle size={15} color={colors.bg} />
          ) : (
            <ShieldAlert size={15} color={colors.bg} />
          )}
          <Text style={[styles.stopText, font("display", fontsReady)]}>
            {emergencyStopped ? "ĐÃ DỪNG" : "E-STOP"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  brand: {
    ...type.body,
    color: colors.textHi
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
    color: colors.bg
  },
  resetButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
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
    color: colors.textHi
  },
  focused: {
    borderColor: colors.accent
  },
  focusedDanger: {
    borderColor: colors.textHi,
    borderWidth: 2
  },
  pressed: {
    opacity: 0.78
  }
});
