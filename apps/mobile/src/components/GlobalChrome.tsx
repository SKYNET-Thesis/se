import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing, type } from "../theme";

export type LinkStatus = "online" | "connecting" | "offline" | "error";

type RobotLink = {
  label: "Follower" | "Leader";
  status: LinkStatus;
  latencyMs?: number;
};

type Props = {
  follower: RobotLink;
  leader: RobotLink;
  emergencyStopped: boolean;
  fontsReady: boolean;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
};

const statusLabels: Record<LinkStatus, string> = {
  online: "Đã nối",
  connecting: "Đang nối",
  offline: "Mất tín hiệu",
  error: "Lỗi"
};

const statusColors: Record<LinkStatus, string> = {
  online: colors.accent,
  connecting: colors.caution,
  offline: colors.textLo,
  error: colors.danger
};

export function GlobalChrome({
  follower,
  leader,
  emergencyStopped,
  fontsReady,
  onEmergencyStop,
  onResetEmergencyStop
}: Props) {
  const [focusedControl, setFocusedControl] = useState<"reset" | "stop" | null>(null);

  return (
    <View style={styles.chrome}>
      <View style={styles.topRow}>
        <View style={styles.brandBlock}>
          <Text style={[styles.brand, font("display", fontsReady)]}>OmniArm</Text>
          <Text style={[styles.caption, font("body", fontsReady)]}>SO-ARM101 Ops</Text>
        </View>

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
              <RotateCcw size={15} color={colors.textHi} />
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
              <AlertTriangle size={17} color={colors.bg} />
            ) : (
              <ShieldAlert size={17} color={colors.bg} />
            )}
            <Text style={[styles.stopText, font("display", fontsReady)]}>
              {emergencyStopped ? "ĐÃ DỪNG" : "E-STOP"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.linkRail}>
        <LinkPill link={follower} fontsReady={fontsReady} />
        <View style={styles.divider} />
        <LinkPill link={leader} fontsReady={fontsReady} />
      </View>
    </View>
  );
}

function LinkPill({ link, fontsReady }: { link: RobotLink; fontsReady: boolean }) {
  const color = statusColors[link.status];

  return (
    <View accessibilityLabel={`${link.label} ${statusLabels[link.status]}`} style={styles.linkPill}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View style={styles.linkCopy}>
        <Text style={[styles.linkLabel, font("display", fontsReady)]}>{link.label}</Text>
        <Text style={[styles.linkStatus, font("body", fontsReady)]}>{statusLabels[link.status]}</Text>
      </View>
      {typeof link.latencyMs === "number" && (
        <Text style={[styles.latency, font("mono", fontsReady)]}>{link.latencyMs} ms</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  brand: {
    ...type.title,
    color: colors.textHi,
    letterSpacing: 0
  },
  brandBlock: {
    flex: 1,
    minWidth: 0
  },
  caption: {
    ...type.small,
    color: colors.textLo,
    marginTop: 2
  },
  stopCluster: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs
  },
  stopButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.button,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: spacing.md
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
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  resetText: {
    ...type.label,
    color: colors.textHi
  },
  linkRail: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 64,
    paddingHorizontal: spacing.sm
  },
  linkPill: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
    paddingHorizontal: spacing.xs
  },
  statusDot: {
    borderRadius: radius.status,
    height: 10,
    width: 10
  },
  linkCopy: {
    flex: 1,
    minWidth: 0
  },
  linkLabel: {
    ...type.label,
    color: colors.textHi
  },
  linkStatus: {
    ...type.small,
    color: colors.textLo,
    marginTop: 2
  },
  latency: {
    ...type.mono,
    color: colors.textHi
  },
  divider: {
    backgroundColor: colors.border,
    height: 32,
    width: 1
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
