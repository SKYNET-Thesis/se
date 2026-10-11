import { Bot, ChevronDown, ChevronUp, CircleAlert, CircleCheck, FlaskConical, ShieldAlert } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import {
  describeRobotArm,
  getActiveArms,
  getRobotLinkMode,
  pickArmToCalibrate,
  READINESS_BADGE_LABEL,
  ROBOT_ARM_MODEL,
  RobotArmSide,
  RobotArmState
} from "../data/robot";
import { useRobotSetup, useRobotSummary } from "../hooks/useRobotSummary";
import { font } from "../theme";

type Props = {
  // Owned by App.tsx (floating E-STOP / Reset). Read only here.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
  // Connect, optionally with one arm brought into view.
  onConnect: (armId?: string) => void;
  // Calibrate, optionally with one arm preselected.
  onCalibrate: (armId?: string) => void;
  // Manual Control — it still requires its own deliberate arm step.
  onOpenControl: () => void;
};

// Only sides worth saying in words; "custom" has no fixed meaning.
const SIDE_LABEL: Partial<Record<RobotArmSide, string>> = {
  left: "Trái",
  right: "Phải"
};

// Clears the floating E-STOP (bottom-left by default, 58pt + caption) so
// the last action can always be scrolled above it.
const ESTOP_CLEARANCE = 96;

// Robot Status V2. The overview between the Robot hub and Connect /
// Calibrate: is the active setup ready, which arms are connected and
// calibrated, which one needs attention, and what to do next. Readiness is
// the shared aggregate (useRobotSummary); per-arm facts come from the shared
// setup (useRobotSetup). Nothing here is measured hardware data — no ports,
// latency, battery or firmware — and nothing arms or moves the robot.
export function StatusScreen({ emergencyStopped, fontsReady, onBack, onCalibrate, onConnect, onOpenControl }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const setup = useRobotSetup();
  const robot = useRobotSummary({ emergencyStopped });
  const arms = useMemo(() => getActiveArms(setup), [setup]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const prototype = getRobotLinkMode() === "prototype";

  const connectedCount = arms.filter((arm) => arm.connected).length;
  const uncalibratedCount = arms.filter((arm) => !arm.calibrated).length;

  const handleCalibrate = () => onCalibrate(pickArmToCalibrate(arms) ?? undefined);

  return (
    <ScrollView
      accessibilityLabel="Trạng thái robot"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={onBack}
        subtitle="Tổng quan hệ thống và từng tay robot."
        title="Trạng thái robot"
      />

      <SetupCard
        armCount={arms.length}
        colors={colors}
        connectedCount={connectedCount}
        emergencyStopped={emergencyStopped}
        fontsReady={fontsReady}
        robot={robot}
        styles={styles}
        uncalibratedCount={uncalibratedCount}
      />

      {emergencyStopped && (
        // Global — the arm facts below stay visible. Reset lives only beside
        // the floating E-STOP.
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.safety}>
          <ShieldAlert color={colors.statusDanger} size={18} />
          <View style={styles.flex}>
            <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
              Đã dừng khẩn cấp
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              Robot đang ở trạng thái dừng khẩn cấp. Nhấn Reset cạnh nút E-STOP khi đã an toàn.
            </SkyText>
          </View>
        </View>
      )}

      {arms.length > 0 && (
        <View style={styles.armList}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
            {arms.length > 1 ? "Các tay robot" : "Tay robot"}
          </SkyText>
          {arms.map((arm) => (
            <ArmCard
              arm={arm}
              colors={colors}
              fontsReady={fontsReady}
              key={arm.id}
              onCalibrate={() => onCalibrate(arm.id)}
              onConnect={() => onConnect(arm.id)}
              styles={styles}
            />
          ))}
        </View>
      )}

      <PrimaryAction
        empty={arms.length === 0}
        fontsReady={fontsReady}
        onCalibrate={handleCalibrate}
        onConnect={() => onConnect()}
        onOpenControl={onOpenControl}
        readiness={robot?.readiness}
        styles={styles}
      />

      <TechnicalDetails
        arms={arms}
        fontsReady={fontsReady}
        colors={colors}
        onToggle={() => setDetailsOpen((open) => !open)}
        open={detailsOpen}
        prototype={prototype}
        registeredCount={Object.keys(setup.arms).length}
        styles={styles}
      />

      {prototype && (
        <View
          accessibilityLabel="Chế độ thử nghiệm: trạng thái hiện được lấy từ mô hình mô phỏng, chưa phản ánh kết nối phần cứng thật."
          accessible
          style={styles.modeNote}
        >
          <FlaskConical color={colors.textSecondary} size={14} />
          <SkyText fontsReady={fontsReady} style={styles.flex} tone="secondary" variant="caption">
            Chế độ thử nghiệm · trạng thái hiện được lấy từ mô hình mô phỏng, chưa phản ánh kết nối phần cứng thật.
          </SkyText>
        </View>
      )}
    </ScrollView>
  );
}

// The active setup at a glance: model, arm count, the shared aggregate
// state, and three plain counts. The state is the shared readiness; the
// counts only phrase it.
function SetupCard({
  armCount,
  colors,
  connectedCount,
  emergencyStopped,
  fontsReady,
  robot,
  styles,
  uncalibratedCount
}: {
  armCount: number;
  colors: SkyNexColors;
  connectedCount: number;
  emergencyStopped: boolean;
  fontsReady: boolean;
  robot: ReturnType<typeof useRobotSummary>;
  styles: ReturnType<typeof createStyles>;
  uncalibratedCount: number;
}) {
  const empty = armCount === 0;

  let label: string | null = null;
  let note: string | null = null;
  if (robot) {
    switch (robot.readiness) {
      case "offline":
        label = connectedCount > 0 ? "Chưa kết nối đầy đủ" : "Chưa kết nối";
        note = empty
          ? null
          : connectedCount > 0
            ? "Một số tay chưa kết nối. Kết nối đủ các tay để robot hoạt động."
            : robot.message;
        break;
      case "stopped":
        label = "Đã dừng khẩn cấp";
        break;
      default:
        label = READINESS_BADGE_LABEL[robot.readiness];
        note = robot.message;
    }
  }

  return (
    <SkyCard style={styles.card}>
      <View style={styles.identity}>
        <View style={styles.robotIcon}>
          <Bot color={colors.textPrimary} size={26} strokeWidth={1.75} />
        </View>
        <View style={styles.flex}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
            {ROBOT_ARM_MODEL}
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {empty ? "Chưa có tay robot trong hệ thống" : `${armCount} tay trong hệ thống`}
          </SkyText>
        </View>
      </View>

      {/* E-STOP is global and always wins the headline, even while the
          setup is also offline (readiness still says offline underneath,
          which keeps "Kết nối robot" available). */}
      {emergencyStopped ? (
        <StatusBadge accessibilityLiveRegion="polite" fontsReady={fontsReady} label="Đã dừng khẩn cấp" status="danger" />
      ) : robot && label ? (
        <StatusBadge accessibilityLiveRegion="polite" fontsReady={fontsReady} label={label} status={robot.status} />
      ) : (
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          Đang tải trạng thái…
        </SkyText>
      )}

      {note && (
        <SkyText fontsReady={fontsReady} tone="secondary">
          {note}
        </SkyText>
      )}

      {!empty && (
        <View style={styles.facts}>
          <Fact fontsReady={fontsReady} label="Tay" styles={styles} value={armCount} />
          <View style={styles.factDivider} />
          <Fact fontsReady={fontsReady} label="Đã kết nối" styles={styles} value={connectedCount} />
          <View style={styles.factDivider} />
          <Fact fontsReady={fontsReady} label="Cần hiệu chỉnh" styles={styles} value={uncalibratedCount} />
        </View>
      )}
    </SkyCard>
  );
}

function Fact({
  fontsReady,
  label,
  styles,
  value
}: {
  fontsReady: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: number;
}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.fact}>
      <SkyText fontsReady={fontsReady} variant="cardTitle">
        {value}
      </SkyText>
      <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
        {label}
      </SkyText>
    </View>
  );
}

// One arm: name first, role/model (and side) second, then connection and
// calibration in words — icons only reinforce them. The one action is the
// arm's most important next step; a healthy arm has none.
function ArmCard({
  arm,
  colors,
  fontsReady,
  onCalibrate,
  onConnect,
  styles
}: {
  arm: RobotArmState;
  colors: SkyNexColors;
  fontsReady: boolean;
  onCalibrate: () => void;
  onConnect: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const side = arm.side ? SIDE_LABEL[arm.side] : undefined;
  const subtitle = side ? `${describeRobotArm(arm)} · ${side}` : describeRobotArm(arm);
  const connection = arm.connecting ? "Đang kết nối…" : arm.connected ? "Đã kết nối" : "Chưa kết nối";
  const calibration = arm.calibrating ? "Đang hiệu chỉnh…" : arm.calibrated ? "Đã hiệu chỉnh" : "Cần hiệu chỉnh";
  // Semantic colour only where it is true right now: a disconnected arm's
  // stored calibration stays neutral.
  const calibrationColor = !arm.connected
    ? colors.textSecondary
    : arm.calibrated
      ? colors.statusReady
      : colors.statusWarning;
  const CalibrationIcon = arm.calibrated ? CircleCheck : CircleAlert;

  const needsConnect = !arm.connected && !arm.connecting;
  const needsCalibration = arm.connected && !arm.calibrated && !arm.calibrating;
  const healthy = arm.connected && arm.calibrated && !arm.calibrating;

  return (
    <SkyCard style={styles.armCard}>
      <View style={styles.armTop}>
        <View style={styles.armIcon}>
          <Bot color={colors.textPrimary} size={22} strokeWidth={1.75} />
        </View>
        <View accessibilityLabel={`${arm.name}, ${subtitle}, ${connection}, ${calibration}`} accessible style={styles.armText}>
          <SkyText fontsReady={fontsReady} numberOfLines={2} variant="cardTitle">
            {arm.name}
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {subtitle}
          </SkyText>
          <View style={styles.armStatus}>
            <View style={styles.statusItem}>
              {arm.connecting ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: arm.connected ? colors.statusReady : colors.textSecondary }]} />
              )}
              <SkyText fontsReady={fontsReady} tone={arm.connected ? "primary" : "secondary"} variant="caption">
                {connection}
              </SkyText>
            </View>
            <View style={styles.statusItem}>
              {arm.calibrating ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : (
                <CalibrationIcon color={calibrationColor} size={14} />
              )}
              <SkyText fontsReady={fontsReady} tone={arm.connected ? "primary" : "secondary"} variant="caption">
                {calibration}
              </SkyText>
            </View>
          </View>
        </View>
      </View>

      {needsConnect && (
        <View style={styles.armActions}>
          <SkyButton
            accessibilityHint={`Mở màn hình kết nối cho ${arm.name}`}
            accessibilityLabel={`Kết nối ${arm.name}`}
            fontsReady={fontsReady}
            onPress={onConnect}
            style={styles.armButton}
            variant="secondary"
          >
            Kết nối
          </SkyButton>
        </View>
      )}
      {needsCalibration && (
        <View style={styles.armActions}>
          <SkyButton
            accessibilityHint={`Mở hiệu chỉnh cho ${arm.name}`}
            accessibilityLabel={`Hiệu chỉnh ${arm.name}`}
            fontsReady={fontsReady}
            onPress={onCalibrate}
            style={styles.armButton}
            variant="secondary"
          >
            Hiệu chỉnh
          </SkyButton>
        </View>
      )}
      {healthy && (
        <SkyText fontsReady={fontsReady} style={styles.armNote} tone="secondary" variant="caption">
          Không cần thao tác.
        </SkyText>
      )}
    </SkyCard>
  );
}

// The one next step for the whole setup, chosen by the shared aggregate
// readiness: connect, calibrate, or control. Nothing under E-STOP — never
// a control action while stopped.
function PrimaryAction({
  empty,
  fontsReady,
  onCalibrate,
  onConnect,
  onOpenControl,
  readiness,
  styles
}: {
  empty: boolean;
  fontsReady: boolean;
  onCalibrate: () => void;
  onConnect: () => void;
  onOpenControl: () => void;
  readiness: string | undefined;
  styles: ReturnType<typeof createStyles>;
}) {
  if (empty || readiness === "offline") {
    return (
      <View style={styles.action}>
        <SkyButton accessibilityHint="Mở màn hình kết nối robot" accessibilityLabel="Kết nối robot" fontsReady={fontsReady} onPress={onConnect}>
          Kết nối robot
        </SkyButton>
      </View>
    );
  }

  if (readiness === "needs-calibration") {
    return (
      <View style={styles.action}>
        <SkyButton accessibilityHint="Mở màn hình hiệu chỉnh" accessibilityLabel="Hiệu chỉnh robot" fontsReady={fontsReady} onPress={onCalibrate}>
          Hiệu chỉnh robot
        </SkyButton>
      </View>
    );
  }

  if (readiness === "ready") {
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint="Mở điều khiển thủ công. Bạn vẫn cần bật điều khiển trước khi robot di chuyển."
          accessibilityLabel="Điều khiển robot"
          fontsReady={fontsReady}
          onPress={onOpenControl}
        >
          Điều khiển robot
        </SkyButton>
      </View>
    );
  }

  return null;
}

// Collapsed by default and secondary. Only facts the app actually holds:
// arm counts, each arm's internal id, model, role and side, and where the
// state comes from. No serials, ports, firmware or timestamps.
function TechnicalDetails({
  arms,
  colors,
  fontsReady,
  onToggle,
  open,
  prototype,
  registeredCount,
  styles
}: {
  arms: RobotArmState[];
  colors: SkyNexColors;
  fontsReady: boolean;
  onToggle: () => void;
  open: boolean;
  prototype: boolean;
  registeredCount: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const Chevron = open ? ChevronUp : ChevronDown;
  const mono = [styles.mono, font("mono", fontsReady)];
  return (
    <View style={styles.details}>
      <Pressable
        accessibilityLabel="Chi tiết kỹ thuật"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.detailsHeader, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <SkyText fontsReady={fontsReady} variant="sectionTitle">
            Chi tiết kỹ thuật
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Cấu hình hệ thống và mã định danh
          </SkyText>
        </View>
        <Chevron color={colors.textSecondary} size={18} />
      </Pressable>

      {open && (
        <View style={styles.detailsBody}>
          <DetailRow fontsReady={fontsReady} label="Tay đang dùng" styles={styles} value={String(arms.length)} />
          <DetailRow fontsReady={fontsReady} label="Tay đã đăng ký" styles={styles} value={String(registeredCount)} />
          <DetailRow fontsReady={fontsReady} label="Nguồn trạng thái" styles={styles} value={prototype ? "prototype" : "hardware"} />
          {arms.map((arm) => (
            <View key={arm.id} style={styles.detailsArm}>
              <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
                {arm.name}
              </SkyText>
              <SkyText fontsReady={fontsReady} style={mono} tone="secondary">
                id {arm.id} · {arm.model} · {arm.role}
                {arm.side ? ` · ${arm.side}` : ""}
              </SkyText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DetailRow({
  fontsReady,
  label,
  styles,
  value
}: {
  fontsReady: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.detailsRow}>
      <SkyText fontsReady={fontsReady} style={styles.flex}>
        {label}
      </SkyText>
      <SkyText fontsReady={fontsReady} style={[styles.mono, font("mono", fontsReady)]} tone="secondary">
        {value}
      </SkyText>
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: layout.sectionGap,
      paddingBottom: space.xxxl + ESTOP_CLEARANCE,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    flex: {
      flex: 1
    },
    pressed: {
      opacity: 0.78
    },
    card: {
      borderRadius: corner.productCard,
      gap: space.md,
      padding: layout.productCardPadding
    },
    identity: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md
    },
    robotIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 56,
      justifyContent: "center",
      width: 56
    },
    facts: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingTop: space.md
    },
    fact: {
      flex: 1,
      gap: 2
    },
    factDivider: {
      backgroundColor: colors.border,
      marginHorizontal: space.sm,
      width: StyleSheet.hairlineWidth
    },
    safety: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.sm
    },
    armList: {
      gap: space.sm
    },
    armCard: {
      borderRadius: corner.productCard,
      gap: space.sm,
      padding: space.md
    },
    armTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.md
    },
    armIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    // minWidth 0 lets a long name wrap / truncate instead of overflowing.
    armText: {
      flex: 1,
      gap: 2,
      minWidth: 0
    },
    armStatus: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.md,
      marginTop: space.xxs
    },
    statusItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xxs
    },
    statusDot: {
      borderRadius: corner.pill,
      height: 8,
      width: 8
    },
    // Right-aligned: away from the default bottom-left floating E-STOP.
    armActions: {
      flexDirection: "row",
      justifyContent: "flex-end"
    },
    armButton: {
      minHeight: 44,
      paddingHorizontal: space.md
    },
    armNote: {
      textAlign: "right"
    },
    action: {
      gap: space.sm
    },
    details: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: space.md,
      paddingTop: space.md
    },
    detailsHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      minHeight: 48
    },
    detailsBody: {
      gap: space.sm
    },
    detailsRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md
    },
    detailsArm: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 2,
      paddingTop: space.sm
    },
    mono: {
      fontSize: 13
    },
    modeNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.xs
    }
  });
}
