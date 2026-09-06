import { Bot, Cable, Camera, Check, Hand, Radio, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

export function HomeScreen({ emergencyStopped, fontsReady, reduceMotion, onOpenRoute }: Props) {
  const robot = mockHomeState.kind === "success" ? mockHomeState.robot : null;

  return (
    <ScrollView
      accessibilityLabel="Màn hình Home OmniArm"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.heroStage}>
        <View style={styles.modelStage}>
          <ArmModelViewer
            accentColor={colors.accent}
            backgroundColor={colors.bg}
            compact
            floorColor={colors.surface2}
            modelScale={1.75}
            reduceMotion={reduceMotion}
            showFaults={false}
          />
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.robotName, font("display", fontsReady)]}>{robot?.name ?? "SO-ARM101"}</Text>
          <Text style={[styles.robotRole, font("body", fontsReady)]}>
            {robot?.model ?? "Robot song tay"} cho vận hành trực tiếp
          </Text>
          <View style={styles.quickStatusRow}>
            <QuickStatus fontsReady={fontsReady} label="Kết nối" value="Online" />
            <QuickStatus fontsReady={fontsReady} label="Calibrate" value="OK" />
            <QuickStatus fontsReady={fontsReady} label="Chế độ" value="Monitor" />
          </View>
        </View>
      </View>

      <View style={styles.actionArea}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Vận hành</Text>
          <Text style={[styles.sectionMeta, font("mono", fontsReady)]}>MOCK</Text>
        </View>

        <View style={styles.actionGrid}>
          <ActionTile
            description="Quét cổng Follower/Leader"
            disabled={false}
            fontsReady={fontsReady}
            icon={<Cable size={20} color={colors.textHi} />}
            label="Connect"
            onPress={() => onOpenRoute("connect")}
          />
          <ActionTile
            description="Căn từng khớp và lưu hồ sơ"
            disabled={emergencyStopped}
            fontsReady={fontsReady}
            icon={<RotateCcw size={20} color={emergencyStopped ? colors.textLo : colors.textHi} />}
            label="Calibrate"
            onPress={() => onOpenRoute("calibrate")}
          />
          <ActionTile
            description="Jog tay trái/phải theo khớp"
            disabled={emergencyStopped}
            fontsReady={fontsReady}
            icon={<Hand size={21} color={emergencyStopped ? colors.textLo : colors.accentText} />}
            label="Teleop"
            onPress={() => onOpenRoute("teleop")}
            primary={!emergencyStopped}
          />
          <ActionTile
            description="top / wrist / side"
            disabled={false}
            fontsReady={fontsReady}
            icon={<Camera size={20} color={colors.textHi} />}
            label="Camera"
            onPress={() => onOpenRoute("camera")}
          />
        </View>
      </View>

      <HomeStatusSummary emergencyStopped={emergencyStopped} fontsReady={fontsReady} />
    </ScrollView>
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

function QuickStatus({ label, value, fontsReady }: { label: string; value: string; fontsReady: boolean }) {
  return (
    <View style={styles.quickStatus}>
      <View style={styles.quickDot} />
      <Text style={[styles.quickLabel, font("body", fontsReady)]}>{label}</Text>
      <Text style={[styles.quickValue, font(label === "Kết nối" ? "monoStrong" : "display", fontsReady)]}>{value}</Text>
    </View>
  );
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

function ActionTile({
  label,
  description,
  icon,
  primary,
  disabled,
  fontsReady,
  onPress
}: {
  label: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
  disabled: boolean;
  fontsReady: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionTile,
        primary && styles.actionTilePrimary,
        disabled && styles.actionTileDisabled,
        focused && styles.focused,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>{icon}</View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary, font("display", fontsReady)]}>
          {label}
        </Text>
        <Text style={[styles.actionDescription, primary && styles.actionDescriptionPrimary, font("body", fontsReady)]}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  content: {
    gap: spacing.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  heroStage: {
    alignItems: "center",
    gap: spacing.lg,
    minHeight: 360,
    justifyContent: "center"
  },
  modelStage: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    height: 252,
    overflow: "hidden",
    width: "100%"
  },
  heroCopy: {
    alignItems: "center",
    gap: spacing.xs
  },
  robotName: {
    ...type.display,
    color: colors.textHi,
    letterSpacing: 0,
    textAlign: "center"
  },
  robotRole: {
    ...type.body,
    color: colors.textLo,
    textAlign: "center"
  },
  quickStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    marginTop: spacing.sm
  },
  quickStatus: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  quickDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  quickLabel: {
    ...type.small,
    color: colors.textLo
  },
  quickValue: {
    ...type.small,
    color: colors.textHi
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
  actionArea: {
    gap: spacing.md
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    ...type.title,
    color: colors.textHi
  },
  sectionMeta: {
    ...type.mono,
    color: colors.textLo
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  actionTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexBasis: "47%",
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 104,
    minWidth: 150,
    padding: spacing.md
  },
  actionTilePrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  actionTileDisabled: {
    opacity: 0.45
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  actionIconPrimary: {
    backgroundColor: colors.textHi
  },
  actionCopy: {
    flex: 1,
    minWidth: 0
  },
  actionLabel: {
    ...type.label,
    color: colors.textHi
  },
  actionLabelPrimary: {
    color: colors.accentText
  },
  actionDescription: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xs
  },
  actionDescriptionPrimary: {
    color: colors.accentText
  },
  focused: {
    borderColor: colors.accent,
    borderWidth: 2
  },
  pressed: {
    opacity: 0.78
  }
});
