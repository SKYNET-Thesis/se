import { Bot, Cable, ChevronRight, Gauge, Hand, Lock, RotateCcw, ShieldAlert, Smartphone } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SkyCard, SkySection, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { READINESS_BADGE_LABEL, RobotReadiness, RobotSummary } from "../data/robot";
import { useRobotSummary } from "../hooks/useRobotSummary";

export type RobotHubRoute = "teleop" | "phone-teleop" | "connect" | "calibrate" | "status";

type Props = {
  // Owned by App.tsx — the same flag GlobalChrome sets and resets. The hub
  // only reads it; it never stops or resets anything itself.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onOpenRoute: (route: RobotHubRoute) => void;
};

type HubRow = {
  key: string;
  title: string;
  description: string;
  icon: typeof Hand;
  // Where a press goes. A motion control on a robot that isn't ready yet
  // goes to the step that unblocks it instead of opening an unusable screen.
  target: RobotHubRoute;
  disabled: boolean;
  // Replaces the description when the row can't do its own job right now.
  note?: string;
};

const ESTOP_NOTE = "Tạm khóa khi E-STOP đang bật";
const NEEDS_CONNECT_NOTE = "Cần kết nối robot trước";
const NEEDS_CALIBRATION_NOTE = "Cần hiệu chỉnh trước";

// Motion controls follow the shared readiness gate in data/robot.ts, in its
// order: offline → connect first, E-STOP → locked (same rule as Home's
// tools), needs-calibration → calibrate first, ready → open the controller.
function motionRow(
  readiness: RobotReadiness,
  row: Pick<HubRow, "key" | "title" | "description" | "icon" | "target">
): HubRow {
  switch (readiness) {
    case "offline":
      return { ...row, disabled: false, note: NEEDS_CONNECT_NOTE, target: "connect" };
    case "stopped":
      return { ...row, disabled: true, note: ESTOP_NOTE };
    case "needs-calibration":
      return { ...row, disabled: false, note: NEEDS_CALIBRATION_NOTE, target: "calibrate" };
    case "ready":
      return { ...row, disabled: false };
  }
}

function controlRows(readiness: RobotReadiness): HubRow[] {
  return [
    motionRow(readiness, {
      key: "teleop",
      title: "Điều khiển thủ công",
      description: "Điều khiển robot trực tiếp.",
      icon: Hand,
      target: "teleop"
    }),
    motionRow(readiness, {
      key: "phone-teleop",
      title: "Điều khiển bằng điện thoại",
      description: "Dùng chuyển động điện thoại để điều khiển.",
      icon: Smartphone,
      target: "phone-teleop"
    })
  ];
}

function setupRows(readiness: RobotReadiness): HubRow[] {
  // Calibration moves the arm, so it is locked under E-STOP exactly like
  // Home's Calibration tool; it still needs a connection first.
  const calibrate: HubRow =
    readiness === "stopped"
      ? { key: "calibrate", title: "Hiệu chỉnh", description: "", icon: RotateCcw, target: "calibrate", disabled: true, note: ESTOP_NOTE }
      : readiness === "offline"
        ? { key: "calibrate", title: "Hiệu chỉnh", description: "", icon: RotateCcw, target: "connect", disabled: false, note: NEEDS_CONNECT_NOTE }
        : {
            key: "calibrate",
            title: "Hiệu chỉnh",
            description:
              readiness === "needs-calibration"
                ? "Robot cần hiệu chỉnh để di chuyển chính xác."
                : "Giúp robot di chuyển chính xác.",
            icon: RotateCcw,
            target: "calibrate",
            disabled: false
          };

  return [
    {
      key: "connect",
      title: "Kết nối robot",
      description: readiness === "offline" ? "Robot chưa kết nối." : "Kết nối lại hoặc đổi robot.",
      icon: Cable,
      target: "connect",
      // Connecting stays allowed under E-STOP (data/robot.ts gate order).
      disabled: false
    },
    calibrate,
    {
      key: "status",
      title: "Trạng thái",
      description: "Kết nối, hiệu chỉnh và camera.",
      icon: Gauge,
      target: "status",
      disabled: false
    }
  ];
}

// Robot tab root. Answers "what state is my robot in, and where do I
// operate or manage it?": a compact state line (no second 3D hero — Home
// owns the robot's identity), then motion controls, then setup. Navigation
// only: no primary CTA, no telemetry, no E-STOP of its own.
export function RobotHubScreen({ emergencyStopped, fontsReady, onOpenRoute }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Same readiness source as Home and Skill Detail — never recomputed here.
  const robot = useRobotSummary({ emergencyStopped });


  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {robot && (
        <>
          <View style={styles.state}>
            <View style={styles.identity}>
              <View style={styles.deviceIcon}>
                <Bot color={colors.textPrimary} size={24} strokeWidth={1.75} />
              </View>
              <View style={styles.identityText}>
                <SkyText accessibilityRole="header" fontsReady={fontsReady} numberOfLines={1} variant="title">
                  {robot.name}
                </SkyText>
                <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[robot.readiness]} status={robot.status} />
              </View>
            </View>

            {robot.readiness === "stopped" ? (
              // Explains the stop; Reset stays in GlobalChrome only.
              <View accessibilityRole="alert" style={styles.safety}>
                <ShieldAlert color={colors.statusDanger} size={18} />
                <View style={styles.safetyText}>
                  <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
                    E-STOP đang bật
                  </SkyText>
                  <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                    {robot.message}
                  </SkyText>
                </View>
              </View>
            ) : (
              <SkyText fontsReady={fontsReady} tone="secondary">
                {robot.message}
              </SkyText>
            )}
          </View>

          <SkySection fontsReady={fontsReady} title="Điều khiển">
            <RowGroup colors={colors} fontsReady={fontsReady} onOpenRoute={onOpenRoute} rows={controlRows(robot.readiness)} styles={styles} />
          </SkySection>

          <SkySection fontsReady={fontsReady} title="Thiết lập">
            <RowGroup colors={colors} fontsReady={fontsReady} onOpenRoute={onOpenRoute} rows={setupRows(robot.readiness)} styles={styles} />
          </SkySection>
        </>
      )}
    </ScrollView>
  );
}

// One grouped surface of quiet rows (Home tools' grammar): icon, title, one
// line of context, chevron — or a lock when the row is unavailable, so the
// state never rests on dimming alone.
function RowGroup({
  colors,
  fontsReady,
  onOpenRoute,
  rows,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onOpenRoute: (route: RobotHubRoute) => void;
  rows: HubRow[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <SkyCard style={styles.group}>
      {rows.map(({ key, title, description, icon: Icon, target, disabled, note }, index) => {
        const subtitle = note ?? description;
        const Trailing = disabled ? Lock : ChevronRight;

        return (
          <Fragment key={key}>
            {index > 0 && <View style={styles.divider} />}
            <Pressable
              accessibilityHint={subtitle}
              accessibilityLabel={title}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onOpenRoute(target)}
              style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Icon color={disabled ? colors.textSecondary : colors.textPrimary} size={19} />
              </View>
              <View style={styles.rowText}>
                <SkyText fontsReady={fontsReady} variant="cardTitle">
                  {title}
                </SkyText>
                <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                  {subtitle}
                </SkyText>
              </View>
              <Trailing color={colors.textSecondary} size={disabled ? 16 : 18} />
            </Pressable>
          </Fragment>
        );
      })}
    </SkyCard>
  );
}

const ICON_SIZE = 40;

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: layout.sectionGap,
      paddingBottom: space.xxxl,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    state: {
      gap: space.sm
    },
    identity: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md
    },
    deviceIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 56,
      justifyContent: "center",
      width: 56
    },
    identityText: {
      flex: 1,
      gap: space.xs
    },
    safety: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.sm
    },
    safetyText: {
      flex: 1,
      gap: space.xxs
    },
    group: {
      borderRadius: corner.productCard,
      overflow: "hidden",
      padding: 0
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
      minHeight: 64,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.sm
    },
    // Inset to the text column, iOS grouped-list style.
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.productCardPadding + ICON_SIZE + space.sm
    },
    iconWrap: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.pill,
      height: ICON_SIZE,
      justifyContent: "center",
      width: ICON_SIZE
    },
    rowText: {
      flex: 1,
      gap: 2
    },
    disabled: {
      opacity: 0.52
    },
    pressed: {
      opacity: 0.78
    }
  });
}
