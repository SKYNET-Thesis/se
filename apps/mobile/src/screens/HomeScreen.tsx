import { Bot, Cable, Camera, Check, Hand, Radio, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArmModelViewer } from "../components/ArmModelViewer";
import { colors, font, radius, spacing, type } from "../theme";

export type HomeRoute = "connect" | "calibrate" | "teleop" | "camera";
type HomeDataState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; robot: RobotSummary }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "disabled"; reason: string };

type RobotSummary = {
  name: string;
  model: string;
  mode: "Monitor" | "Manual" | "Teleop";
  connected: boolean;
  calibrated: boolean;
  followerLatencyMs: number;
  leaderLatencyMs: number;
  activeProfile: string;
};

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  reduceMotion: boolean;
  onOpenRoute: (route: HomeRoute) => void;
};

const mockHomeState: HomeDataState = {
  kind: "success",
  robot: {
    name: "SO-ARM101",
    model: "Robot song tay",
    mode: "Monitor",
    connected: true,
    calibrated: true,
    followerLatencyMs: 12,
    leaderLatencyMs: 14,
    activeProfile: "SO101-LAB-A"
  }
};

// The primary pill's label follows the robot's actual readiness gate, so the
// one action worth thumb-reach always matches what the operator needs next.
const PRIMARY_LABEL: Record<HomeRoute, string> = {
  connect: "Kết nối",
  calibrate: "Hiệu chỉnh",
  teleop: "Điều khiển",
  camera: "Camera"
};

const SECONDARY_LABEL: Record<HomeRoute, string> = {
  connect: "Connect",
  calibrate: "Calibrate",
  teleop: "Teleop",
  camera: "Camera"
};

function renderRouteIcon(route: HomeRoute, color: string, size: number) {
  switch (route) {
    case "connect":
      return <Cable color={color} size={size} />;
    case "calibrate":
      return <RotateCcw color={color} size={size} />;
    case "teleop":
      return <Hand color={color} size={size} />;
    case "camera":
      return <Camera color={color} size={size} />;
  }
}

// GlobalChrome (single row) and the bottom tab bar are fixed heights that
// live outside this screen; sizing the hero against the space actually left
// after them keeps the title/subtitle visually tied to the thumb-zone CTAs.
const CHROME_HEIGHT = 64;
const TAB_BAR_HEIGHT = 64;
const HERO_FILL_RATIO = 0.63;
const MIN_HERO_HEIGHT = 320;

export function HomeScreen({ emergencyStopped, fontsReady, reduceMotion, onOpenRoute }: Props) {
  const robot = mockHomeState.kind === "success" ? mockHomeState.robot : null;
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const availableHeight = windowHeight - insets.top - insets.bottom - CHROME_HEIGHT - TAB_BAR_HEIGHT;
  const heroHeight = Math.max(MIN_HERO_HEIGHT, Math.round(availableHeight * HERO_FILL_RATIO));

  const primaryRoute: HomeRoute = !robot?.connected ? "connect" : !robot?.calibrated ? "calibrate" : "teleop";
  const isRouteDisabled = (route: HomeRoute) =>
    (route === "calibrate" || route === "teleop") && emergencyStopped;
  const secondaryRoutes = (["connect", "calibrate", "teleop", "camera"] as HomeRoute[]).filter(
    (route) => route !== primaryRoute
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight }]}>
        <View style={styles.modelSlot}>
          <ArmModelViewer
            accentColor={colors.accent}
            backgroundColor={colors.bg}
            compact
            floorColor={colors.surface2}
            reduceMotion={reduceMotion}
            showFaults={false}
            softFloor
          />
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.robotName, font("display", fontsReady)]}>{robot?.name ?? "SO-ARM101"}</Text>
          <Text style={[styles.robotSubtitle, font("body", fontsReady)]}>
            {robot?.model ?? "Robot song tay"}, vận hành trực tiếp
          </Text>
        </View>
      </View>

      <View style={styles.ctaCluster}>
        <PrimaryPill
          disabled={isRouteDisabled(primaryRoute)}
          fontsReady={fontsReady}
          label={PRIMARY_LABEL[primaryRoute]}
          onPress={() => onOpenRoute(primaryRoute)}
        />

        <View style={styles.secondaryRow}>
          {secondaryRoutes.map((route) => (
            <SecondaryAction
              disabled={isRouteDisabled(route)}
              fontsReady={fontsReady}
              icon={(color) => renderRouteIcon(route, color, 20)}
              key={route}
              label={SECONDARY_LABEL[route]}
              onPress={() => onOpenRoute(route)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function HomeStatusSummary({
  emergencyStopped,
  fontsReady
}: {
  emergencyStopped: boolean;
  fontsReady: boolean;
}) {
  const state = emergencyStopped
    ? ({ kind: "disabled", reason: "Hệ thống đang ở trạng thái E-STOP." } satisfies HomeDataState)
    : mockHomeState;

  return renderHomeState(state, fontsReady);
}

function renderHomeState(state: HomeDataState, fontsReady: boolean) {
  switch (state.kind) {
    case "idle":
      return (
        <StatePanel
          fontsReady={fontsReady}
          icon={<Radio size={18} color={colors.textLo} />}
          title="Chưa có phiên vận hành"
          tone="neutral"
          value="Idle"
        />
      );
    case "loading":
      return (
        <StatePanel
          fontsReady={fontsReady}
          icon={<Radio size={18} color={colors.caution} />}
          title="Đang đọc trạng thái robot"
          tone="caution"
          value="Loading"
        />
      );
    case "error":
      return (
        <StatePanel
          body={state.message}
          fontsReady={fontsReady}
          icon={<TriangleAlert size={18} color={colors.danger} />}
          title="Không đọc được robot"
          tone="danger"
          value="Error"
        />
      );
    case "empty":
      return (
        <StatePanel
          body="Chưa chọn robot trong workspace."
          fontsReady={fontsReady}
          icon={<Bot size={18} color={colors.textLo} />}
          title="Không có robot"
          tone="neutral"
          value="Empty"
        />
      );
    case "disabled":
      return (
        <StatePanel
          body={state.reason}
          fontsReady={fontsReady}
          icon={<ShieldAlert size={18} color={colors.danger} />}
          title="Vận hành đã dừng"
          tone="danger"
          value="Stopped"
        />
      );
    case "success":
      return <StatusPanel fontsReady={fontsReady} robot={state.robot} />;
  }
}

function StatusPanel({ robot, fontsReady }: { robot: RobotSummary; fontsReady: boolean }) {
  return (
    <View style={styles.statusPanel}>
      <View style={styles.statusHeader}>
        <View>
          <Text style={[styles.panelTitle, font("display", fontsReady)]}>Trạng thái tổng</Text>
          <Text style={[styles.panelCaption, font("body", fontsReady)]}>Dữ liệu mock, chưa nối thiết bị thật</Text>
        </View>
        <View style={styles.readyPill}>
          <Check size={14} color={colors.accentText} />
          <Text style={[styles.readyText, font("display", fontsReady)]}>Sẵn sàng</Text>
        </View>
      </View>

      <View style={styles.statusGrid}>
        <StatusMetric
          fontsReady={fontsReady}
          label="Kết nối"
          value={robot.connected ? "Online" : "Offline"}
        />
        <StatusMetric
          fontsReady={fontsReady}
          label="Calibrate"
          value={robot.calibrated ? "OK" : "Chưa"}
        />
        <StatusMetric fontsReady={fontsReady} label="Chế độ" value={robot.mode} />
        <StatusMetric fontsReady={fontsReady} label="Hồ sơ" value={robot.activeProfile} wide />
      </View>

      <View style={styles.latencyRow}>
        <Text style={[styles.latencyText, font("mono", fontsReady)]}>Follower {robot.followerLatencyMs} ms</Text>
        <Text style={[styles.latencyText, font("mono", fontsReady)]}>Leader {robot.leaderLatencyMs} ms</Text>
      </View>
    </View>
  );
}

function StatusMetric({
  label,
  value,
  wide,
  fontsReady
}: {
  label: string;
  value: string;
  wide?: boolean;
  fontsReady: boolean;
}) {
  return (
    <View style={[styles.metric, wide && styles.metricWide]}>
      <Text style={[styles.metricLabel, font("body", fontsReady)]}>{label}</Text>
      <Text style={[styles.metricValue, font(label === "Hồ sơ" ? "monoStrong" : "display", fontsReady)]}>{value}</Text>
    </View>
  );
}

function StatePanel({
  icon,
  title,
  value,
  body,
  tone,
  fontsReady
}: {
  icon: ReactNode;
  title: string;
  value: string;
  body?: string;
  tone: "neutral" | "caution" | "danger";
  fontsReady: boolean;
}) {
  return (
    <View style={[styles.statePanel, tone === "danger" && styles.statePanelDanger]}>
      <View style={styles.stateTitleRow}>
        {icon}
        <Text style={[styles.panelTitle, font("display", fontsReady)]}>{title}</Text>
        <Text
          style={[
            styles.stateValue,
            tone === "caution" && styles.stateValueCaution,
            tone === "danger" && styles.stateValueDanger,
            font("monoStrong", fontsReady)
          ]}
        >
          {value}
        </Text>
      </View>
      {body && <Text style={[styles.panelCaption, font("body", fontsReady)]}>{body}</Text>}
    </View>
  );
}

function PrimaryPill({
  label,
  disabled,
  fontsReady,
  onPress
}: {
  label: string;
  disabled: boolean;
  fontsReady: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryPill,
        disabled && styles.primaryPillDisabled,
        focused && styles.focused,
        pressed && !disabled && styles.pillPressed
      ]}
    >
      <Text
        style={[styles.primaryPillText, disabled && styles.primaryPillTextDisabled, font("display", fontsReady)]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryAction({
  label,
  icon,
  disabled,
  fontsReady,
  onPress
}: {
  label: string;
  icon: (color: string) => ReactNode;
  disabled: boolean;
  fontsReady: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryAction, pressed && !disabled && styles.pillPressed]}
    >
      <View style={[styles.secondaryIcon, disabled && styles.secondaryIconDisabled, focused && styles.focused]}>
        {icon(disabled ? colors.textLo : colors.textHi)}
      </View>
      <Text style={[styles.secondaryLabel, disabled && styles.secondaryLabelDisabled, font("body", fontsReady)]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl
  },
  hero: {
    width: "100%"
  },
  modelSlot: {
    flex: 1,
    width: "100%"
  },
  heroCopy: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.sm
  },
  robotName: {
    ...type.display,
    color: colors.textHi,
    letterSpacing: 0,
    textAlign: "center"
  },
  robotSubtitle: {
    ...type.body,
    color: colors.textLo,
    textAlign: "center"
  },
  statusPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.md
  },
  statusHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  panelTitle: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  panelCaption: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  readyPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  readyText: {
    ...type.label,
    color: colors.accentText
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metric: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 78,
    padding: spacing.sm
  },
  metricWide: {
    flexBasis: "100%"
  },
  metricLabel: {
    ...type.small,
    color: colors.textLo
  },
  metricValue: {
    ...type.label,
    color: colors.textHi
  },
  latencyRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingTop: spacing.md
  },
  latencyText: {
    ...type.mono,
    color: colors.textLo
  },
  statePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  statePanelDanger: {
    borderColor: colors.danger
  },
  stateTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  stateValue: {
    ...type.mono,
    color: colors.textLo,
    marginLeft: "auto"
  },
  stateValueCaution: {
    color: colors.caution
  },
  stateValueDanger: {
    color: colors.danger
  },
  ctaCluster: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs
  },
  primaryPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    height: 56,
    justifyContent: "center",
    width: "100%"
  },
  primaryPillDisabled: {
    backgroundColor: colors.surface2
  },
  primaryPillText: {
    ...type.bodyStrong,
    color: colors.accentText
  },
  primaryPillTextDisabled: {
    color: colors.textLo
  },
  secondaryRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  secondaryAction: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.xxs
  },
  secondaryIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.round,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  secondaryIconDisabled: {
    opacity: 0.58
  },
  secondaryLabel: {
    ...type.label,
    color: colors.textHi
  },
  secondaryLabelDisabled: {
    color: colors.textLo
  },
  focused: {
    borderColor: colors.accent,
    borderWidth: 2
  },
  pillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  }
});
