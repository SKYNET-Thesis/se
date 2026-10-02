import { Activity, Check, ShieldAlert, TriangleAlert, WifiOff } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { corner } from "../../design-system/radius";
import { space } from "../../design-system/spacing";
import { SkyNexColors, SkyNexColorToken, useSkyNexTokens } from "../../design-system/tokens";
import { SkyText } from "./SkyText";

// danger = E-STOP: red, never amber — amber stays for recoverable warnings
// such as calibration.
export type RobotStatus = "ready" | "running" | "warning" | "danger" | "offline";

const STATUS_LABEL: Record<RobotStatus, string> = {
  ready: "Sẵn sàng",
  running: "Đang chạy",
  warning: "Cảnh báo",
  danger: "E-STOP",
  offline: "Ngoại tuyến"
};

const STATUS_ICON = {
  ready: Check,
  running: Activity,
  warning: TriangleAlert,
  danger: ShieldAlert,
  offline: WifiOff
} satisfies Record<RobotStatus, typeof Check>;

const STATUS_COLOR: Record<RobotStatus, SkyNexColorToken> = {
  ready: "statusReady",
  running: "statusRunning",
  warning: "statusWarning",
  danger: "statusDanger",
  offline: "statusOffline"
};

export type StatusBadgeProps = Omit<ViewProps, "children"> & {
  status: RobotStatus;
  // Overrides the default product word, e.g. for a more specific state.
  label?: string;
  // Overrides the default glyph when a caller maps its own meaning onto a
  // status tone (e.g. a skill that is "learning" uses the warning tone but
  // not the warning triangle). Color still comes from `status`.
  icon?: typeof Check;
  fontsReady?: boolean;
};

// Robot/product status indicator. Same visual grammar as TaskStatusChip:
// neutral pill shell, signal carried by the icon color, label always shown
// so status never depends on color alone. Deliberately never lime-filled —
// a filled accent is reserved for the screen's primary action.
export function StatusBadge({ fontsReady = true, icon, label, status, style, ...rest }: StatusBadgeProps) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const text = label ?? STATUS_LABEL[status];
  const Icon = icon ?? STATUS_ICON[status];

  return (
    <View accessibilityLabel={text} accessibilityRole="text" {...rest} style={[styles.badge, style]}>
      <Icon color={colors[STATUS_COLOR[status]]} size={13} strokeWidth={2} />
      <SkyText fontsReady={fontsReady} tone={status === "offline" ? "secondary" : "primary"} variant="status">
        {text}
      </SkyText>
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    badge: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: space.xxs,
      minHeight: 28,
      paddingHorizontal: space.xs
    }
  });
}
