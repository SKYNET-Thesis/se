import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Lock, Minus, Plus, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkySection, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { getLiveReadiness, READINESS_BADGE_LABEL, RobotReadiness, RobotSummary } from "../data/robot";
import { useRobotSummary } from "../hooks/useRobotSummary";
import { font } from "../theme";

type ArmRole = "follower" | "leader";
type MotorId =
  | "shoulder_pan"
  | "shoulder_lift"
  | "elbow_flex"
  | "wrist_flex"
  | "wrist_roll"
  | "gripper";
type JointTone = "ok" | "near" | "fault";

type ServoLimits = {
  min: number;
  max: number;
};

type JointReading = {
  count: number;
  tone: JointTone;
};

type PositionByMotor = Record<MotorId, number>;
type ReadingByMotor = Record<MotorId, JointReading>;
type ArmReadings = Record<ArmRole, ReadingByMotor>;
type CalibratedLimits = Record<ArmRole, Record<MotorId, ServoLimits>>;

type JogCommand = {
  motorId: MotorId;
  direction: -1 | 1;
};

type Props = {
  // Owned by App.tsx (the floating E-STOP sets it; Reset clears it). Read only here —
  // this screen never stops or resets anything itself.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
  onCalibrate: () => void;
  onConnect: () => void;
};

const ARM_SEQUENCE: ArmRole[] = ["follower", "leader"];
const MOTOR_IDS: MotorId[] = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper"
];

const CALIBRATED_LIMITS: CalibratedLimits = {
  follower: {
    shoulder_pan: { min: 740, max: 3350 },
    shoulder_lift: { min: 880, max: 3100 },
    elbow_flex: { min: 910, max: 3380 },
    wrist_flex: { min: 1040, max: 3000 },
    wrist_roll: { min: 620, max: 3560 },
    gripper: { min: 980, max: 2460 }
  },
  leader: {
    shoulder_pan: { min: 760, max: 3370 },
    shoulder_lift: { min: 900, max: 3120 },
    elbow_flex: { min: 940, max: 3360 },
    wrist_flex: { min: 1010, max: 3070 },
    wrist_roll: { min: 650, max: 3500 },
    gripper: { min: 1020, max: 2510 }
  }
};

const MOTOR_CENTER: Record<ArmRole, Record<MotorId, number>> = {
  follower: {
    shoulder_pan: 2048,
    shoulder_lift: 1960,
    elbow_flex: 2144,
    wrist_flex: 2012,
    wrist_roll: 2090,
    gripper: 1710
  },
  leader: {
    shoulder_pan: 2070,
    shoulder_lift: 1995,
    elbow_flex: 2110,
    wrist_flex: 2058,
    wrist_roll: 2032,
    gripper: 1764
  }
};

const MOTOR_SWEEP: Record<MotorId, { amplitude: number; seed: number }> = {
  shoulder_pan: { amplitude: 1420, seed: 0 },
  shoulder_lift: { amplitude: 1120, seed: 7 },
  elbow_flex: { amplitude: 1260, seed: 13 },
  wrist_flex: { amplitude: 1060, seed: 19 },
  wrist_roll: { amplitude: 1510, seed: 29 },
  gripper: { amplitude: 810, seed: 37 }
};

const CAUTION_MARGIN = 140;
const JOG_STEP = 78;

// Mock-only envelope. The simulated leader's autonomous sweep (centre ±
// amplitude, ±9 drift) must stay this far inside the TIGHTER of the two
// arms' calibrated limits — the follower tracks the leader's counts — so
// the simulation never trips the near/over-limit checks on its own.
// 160 > CAUTION_MARGIN keeps the idle sweep out of the caution zone, while
// a held jog (±JOG_STEP on top of the sweep) can still reach it. Limits,
// limit detection and jog math are unchanged; only the mock is bounded.
const MOCK_SWEEP_MARGIN = 160;
const MOCK_DRIFT = 9;
const MOCK_SWEEP_AMPLITUDE = MOTOR_IDS.reduce((amplitudes, motorId) => {
  const center = MOTOR_CENTER.leader[motorId];
  const low = Math.max(CALIBRATED_LIMITS.leader[motorId].min, CALIBRATED_LIMITS.follower[motorId].min);
  const high = Math.min(CALIBRATED_LIMITS.leader[motorId].max, CALIBRATED_LIMITS.follower[motorId].max);
  const room = Math.min(center - low, high - center) - MOCK_DRIFT - MOCK_SWEEP_MARGIN;
  amplitudes[motorId] = Math.max(0, Math.min(MOTOR_SWEEP[motorId].amplitude, room));
  return amplitudes;
}, {} as Record<MotorId, number>);

// Human names for the six motors, in MOTOR_IDS order. The ids stay in the
// code and in the "Chi tiết" area for anyone matching them to hardware.
const MOTOR_LABEL: Record<MotorId, string> = {
  shoulder_pan: "Xoay đế",
  shoulder_lift: "Nâng vai",
  elbow_flex: "Gập khuỷu",
  wrist_flex: "Gập cổ tay",
  wrist_roll: "Xoay cổ tay",
  gripper: "Kẹp"
};

const ROLE_LABEL: Record<ArmRole, string> = {
  follower: "Tay robot (Follower)",
  leader: "Tay điều khiển (Leader)"
};

const TICK_MS = 360;
const JOG_BUTTON = 48;

// Why the adjustments are locked, in gate order. Same wording family as the
// Robot hub ("Tạm khóa khi E-STOP đang bật"), shortened for an inline note.
function lockReason(readiness: RobotReadiness | null, emergencyStopped: boolean, armed: boolean, fault: boolean) {
  if (emergencyStopped || readiness === "stopped") return "Tạm khóa vì E-STOP";
  if (readiness === "offline") return "Tạm khóa — robot chưa kết nối";
  if (readiness === "needs-calibration") return "Tạm khóa — robot cần hiệu chỉnh";
  if (readiness !== "ready") return "Đang kiểm tra trạng thái robot…";
  if (!armed) return "Bật điều khiển để sử dụng";
  if (fault) return "Tạm khóa — vượt giới hạn chuyển động";
  return null;
}

// Manual Control. Answers "can I move my robot right now, and how?":
// the shared readiness first, then one arm switch, then the hold-to-move
// adjustments. Raw readings live in "Chi tiết"; there is no telemetry here.
//
// Safety model, in layers:
//   1. Readiness comes ONLY from useRobotSummary() — the same source as
//      Home, Skill Detail and the Robot hub. Motion needs readiness "ready"
//      AND the raw E-STOP flag clear (the flag wins without waiting for the
//      async summary).
//   2. Losing readiness disarms the controller and drops any held jog, so a
//      Reset never resumes motion by itself — the user re-arms on purpose.
//   3. The motion loop re-reads the gate from refs on every tick, at the
//      moment a command is applied — never from a value captured at render
//      or press time.
export function TeleopScreen({ emergencyStopped, fontsReady, onBack, onCalibrate, onConnect }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const robot = useRobotSummary({ emergencyStopped });
  const [manualEnabled, setManualEnabled] = useState(false);
  const [confirmManualVisible, setConfirmManualVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeJog, setActiveJog] = useState<JogCommand | null>(null);
  const [positions, setPositions] = useState<Record<ArmRole, PositionByMotor>>({
    follower: createInitialPositions("follower"),
    leader: createInitialPositions("leader")
  });


  const readings = useMemo(() => buildReadings(positions), [positions]);
  const hasFault = hasTone(readings, "fault");
  const hasNearLimit = hasTone(readings, "near");
  const motionAllowed = robot?.readiness === "ready" && !emergencyStopped;
  const controlsActive = motionAllowed && manualEnabled && !hasFault;

  // Latest gate for the motion loop and press handlers (layer 3).
  const motionAllowedRef = useRef(motionAllowed);
  const emergencyStoppedRef = useRef(emergencyStopped);
  emergencyStoppedRef.current = emergencyStopped;
  // Live check straight from the shared robot link + E-STOP, at call time.
  const robotMayMoveNow = () => motionAllowedRef.current && getLiveReadiness(emergencyStoppedRef.current) === "ready";
  const manualEnabledRef = useRef(manualEnabled);
  const hasFaultRef = useRef(hasFault);
  const activeJogRef = useRef(activeJog);
  const tickRef = useRef(0);
  motionAllowedRef.current = motionAllowed;
  manualEnabledRef.current = manualEnabled;
  hasFaultRef.current = hasFault;
  activeJogRef.current = activeJog;

  // Layer 2: readiness lost (E-STOP, disconnect, calibration) → disarm.
  useEffect(() => {
    if (motionAllowed) return;
    setManualEnabled(false);
    setActiveJog(null);
    setConfirmManualVisible(false);
  }, [motionAllowed]);

  useEffect(() => {
    if (!controlsActive && activeJog) setActiveJog(null);
  }, [activeJog, controlsActive]);

  // The motion loop. Runs only while the robot may move; stops the moment
  // readiness is lost (cleanup on the same commit that disables controls).
  useEffect(() => {
    if (!motionAllowed) return undefined;

    const timer = setInterval(() => {
      // Layer 3: decide what this tick may apply from the gate as it is now.
      const allowed = robotMayMoveNow() && manualEnabledRef.current && !hasFaultRef.current;
      const jog = allowed ? activeJogRef.current : null;
      tickRef.current += 1;
      const nextTick = tickRef.current;
      setPositions((prev) => advanceMockPositions(prev, nextTick, allowed, jog));
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [motionAllowed]);

  const handleJogStart = (command: JogCommand) => {
    if (!robotMayMoveNow() || !manualEnabledRef.current || hasFaultRef.current) return;
    setActiveJog(command);
  };

  const handleToggleManual = () => {
    if (manualEnabled) {
      setManualEnabled(false);
      return;
    }
    if (!motionAllowedRef.current) return;
    setConfirmManualVisible(true);
  };

  const confirmManual = () => {
    setConfirmManualVisible(false);
    // Readiness may have changed while the dialog was open.
    if (!motionAllowedRef.current) return;
    setManualEnabled(true);
  };

  const readiness = robot?.readiness ?? null;
  const locked = lockReason(readiness, emergencyStopped, manualEnabled, hasFault);

  return (
    <>
      <ScrollView
        accessibilityLabel="Điều khiển thủ công"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <ScreenHeader
          fontsReady={fontsReady}
          onBack={onBack}
          subtitle="Robot làm theo tay điều khiển của bạn."
          title="Điều khiển thủ công"
        />

        {robot && (
          <RobotState
            colors={colors}
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            onCalibrate={onCalibrate}
            onConnect={onConnect}
            robot={robot}
            styles={styles}
          />
        )}

        {motionAllowed && (
          <ArmSwitch
            colors={colors}
            fontsReady={fontsReady}
            hasFault={hasFault}
            hasNearLimit={hasNearLimit}
            manualEnabled={manualEnabled}
            onToggle={handleToggleManual}
            styles={styles}
          />
        )}

        <SkySection
          fontsReady={fontsReady}
          subtitle="Giữ − hoặc + để di chuyển. Thả tay để dừng."
          title="Điều chỉnh từng phần"
        >
          {locked && (
            <View accessibilityLiveRegion="polite" style={styles.lockNote}>
              <Lock color={colors.textSecondary} size={15} />
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                {locked}
              </SkyText>
            </View>
          )}
          <JogList
            activeJog={activeJog}
            colors={colors}
            disabled={!controlsActive}
            fontsReady={fontsReady}
            onJogStart={handleJogStart}
            onJogStop={() => setActiveJog(null)}
            readings={readings.follower}
            styles={styles}
          />
        </SkySection>

        <Details
          colors={colors}
          fontsReady={fontsReady}
          onToggle={() => setDetailsOpen((open) => !open)}
          open={detailsOpen}
          readings={readings}
          styles={styles}
        />
      </ScrollView>

      <ManualConfirmModal
        colors={colors}
        fontsReady={fontsReady}
        onCancel={() => setConfirmManualVisible(false)}
        onConfirm={confirmManual}
        styles={styles}
        visible={confirmManualVisible}
      />
    </>
  );
}

// Compact shared readiness — the same badge, labels and message as Home,
// Skill Detail and the Robot hub. Blocked states carry the one action that
// unblocks them; E-STOP only explains (Reset lives beside the floating E-STOP).
function RobotState({
  colors,
  emergencyStopped,
  fontsReady,
  onCalibrate,
  onConnect,
  robot,
  styles
}: {
  colors: SkyNexColors;
  emergencyStopped: boolean;
  fontsReady: boolean;
  onCalibrate: () => void;
  onConnect: () => void;
  robot: RobotSummary;
  styles: ReturnType<typeof createStyles>;
}) {
  if (emergencyStopped || robot.readiness === "stopped") {
    return (
      <View style={styles.state}>
        <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[robot.readiness]} status={robot.status} />
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
      </View>
    );
  }

  const action =
    robot.readiness === "offline"
      ? { label: "Kết nối robot", hint: "Mở màn hình kết nối", onPress: onConnect }
      : robot.readiness === "needs-calibration"
        ? { label: "Hiệu chỉnh", hint: "Mở màn hình hiệu chỉnh", onPress: onCalibrate }
        : null;

  return (
    <View style={styles.state}>
      <View style={styles.stateRow}>
        <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[robot.readiness]} status={robot.status} />
        <SkyText fontsReady={fontsReady} style={styles.stateText} tone="secondary" variant="caption">
          {robot.message}
        </SkyText>
      </View>
      {action && (
        <SkyButton accessibilityHint={action.hint} fontsReady={fontsReady} onPress={action.onPress}>
          {action.label}
        </SkyButton>
      )}
    </View>
  );
}

// The one interlock between "ready" and "moving": an explicit, confirmed
// switch. Orange only while on (the selected interactive state).
function ArmSwitch({
  colors,
  fontsReady,
  hasFault,
  hasNearLimit,
  manualEnabled,
  onToggle,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  hasFault: boolean;
  hasNearLimit: boolean;
  manualEnabled: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const status = !manualEnabled
    ? { icon: null, color: colors.textSecondary, text: "Bật để robot bắt đầu làm theo tay điều khiển." }
    : hasFault
      ? { icon: CircleAlert, color: colors.statusDanger, text: "Vượt giới hạn chuyển động — đã tạm khóa." }
      : hasNearLimit
        ? { icon: TriangleAlert, color: colors.statusWarning, text: "Gần giới hạn chuyển động." }
        : { icon: CircleCheck, color: colors.statusReady, text: "Đang điều khiển." };
  const StatusIcon = status.icon;

  return (
    <SkyCard style={styles.group}>
      <Pressable
        accessibilityHint={manualEnabled ? "Tắt để dừng điều khiển" : "Cần xác nhận trước khi bật"}
        accessibilityLabel="Điều khiển robot"
        accessibilityRole="switch"
        accessibilityState={{ checked: manualEnabled }}
        // RN web drops `checked` from accessibilityState for role=switch.
        aria-checked={manualEnabled}
        onPress={onToggle}
        style={({ pressed }) => [styles.switchRow, pressed && styles.pressed]}
      >
        <View style={styles.switchText}>
          <SkyText fontsReady={fontsReady} variant="cardTitle">
            Điều khiển robot
          </SkyText>
          <View style={styles.switchStatus}>
            {StatusIcon && <StatusIcon color={status.color} size={14} />}
            <SkyText
              accessibilityLiveRegion="polite"
              fontsReady={fontsReady}
              style={StatusIcon ? { color: status.color } : undefined}
              tone={StatusIcon ? undefined : "secondary"}
              variant="caption"
            >
              {status.text}
            </SkyText>
          </View>
        </View>
        <View style={[styles.track, manualEnabled && styles.trackOn]}>
          <View style={[styles.thumb, manualEnabled && styles.thumbOn]} />
        </View>
      </Pressable>
    </SkyCard>
  );
}

// Primary control: hold-to-move per motor on the Follower (the existing jog,
// same commands). One grouped surface, 48pt buttons.
function JogList({
  activeJog,
  colors,
  disabled,
  fontsReady,
  onJogStart,
  onJogStop,
  readings,
  styles
}: {
  activeJog: JogCommand | null;
  colors: SkyNexColors;
  disabled: boolean;
  fontsReady: boolean;
  onJogStart: (command: JogCommand) => void;
  onJogStop: () => void;
  readings: ReadingByMotor;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <SkyCard style={[styles.group, disabled && styles.groupDisabled]}>
      {MOTOR_IDS.map((motorId, index) => {
        const tone = readings[motorId].tone;
        const label = MOTOR_LABEL[motorId];
        const limit =
          tone === "fault"
            ? { icon: CircleAlert, color: colors.statusDanger, text: "Vượt giới hạn" }
            : tone === "near"
              ? { icon: TriangleAlert, color: colors.statusWarning, text: "Gần giới hạn" }
              : null;

        return (
          <Fragment key={motorId}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.jogRow}>
              <View
                accessibilityLabel={label}
                accessibilityValue={{ text: limit ? limit.text : "Trong giới hạn" }}
                accessible
                style={styles.jogLabel}
              >
                <SkyText fontsReady={fontsReady} variant="cardTitle">
                  {label}
                </SkyText>
                {limit && (
                  <View style={styles.limitTag}>
                    <limit.icon color={limit.color} size={13} />
                    <SkyText fontsReady={fontsReady} style={{ color: limit.color }} variant="caption">
                      {limit.text}
                    </SkyText>
                  </View>
                )}
              </View>
              {([-1, 1] as const).map((direction) => (
                <JogButton
                  active={activeJog?.motorId === motorId && activeJog.direction === direction}
                  colors={colors}
                  direction={direction}
                  disabled={disabled}
                  key={direction}
                  label={label}
                  motorId={motorId}
                  onJogStart={onJogStart}
                  onJogStop={onJogStop}
                  styles={styles}
                />
              ))}
            </View>
          </Fragment>
        );
      })}
    </SkyCard>
  );
}

function JogButton({
  active,
  colors,
  direction,
  disabled,
  label,
  motorId,
  onJogStart,
  onJogStop,
  styles
}: {
  active: boolean;
  colors: SkyNexColors;
  direction: -1 | 1;
  disabled: boolean;
  label: string;
  motorId: MotorId;
  onJogStart: (command: JogCommand) => void;
  onJogStop: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const Icon = direction > 0 ? Plus : Minus;
  return (
    <Pressable
      accessibilityHint="Giữ để di chuyển, thả để dừng"
      accessibilityLabel={`${direction > 0 ? "Tăng" : "Giảm"} ${label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      // RN web drops `selected` from accessibilityState on buttons.
      aria-selected={active}
      disabled={disabled}
      onBlur={onJogStop}
      onPressIn={() => onJogStart({ motorId, direction })}
      onPressOut={onJogStop}
      style={[styles.jogButton, active && styles.jogButtonActive]}
    >
      <Icon color={active ? colors.onAccent : colors.textPrimary} size={20} strokeWidth={2.25} />
    </Pressable>
  );
}

// Secondary, collapsed by default: the raw servo counts for both arms. They
// come from this screen's simulation, and say so.
function Details({
  colors,
  fontsReady,
  onToggle,
  open,
  readings,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onToggle: () => void;
  open: boolean;
  readings: ArmReadings;
  styles: ReturnType<typeof createStyles>;
}) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.details}>
      <Pressable
        accessibilityLabel="Chi tiết"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.detailsHeader, pressed && styles.pressed]}
      >
        <View style={styles.switchText}>
          <SkyText fontsReady={fontsReady} variant="sectionTitle">
            Chi tiết
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Vị trí từng motor · dữ liệu mô phỏng
          </SkyText>
        </View>
        <Chevron color={colors.textSecondary} size={18} />
      </Pressable>

      {open &&
        ARM_SEQUENCE.map((role) => (
          <View key={role} style={styles.detailsArm}>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {ROLE_LABEL[role]}
            </SkyText>
            {MOTOR_IDS.map((motorId) => {
              const reading = readings[role][motorId];
              return (
                <View key={motorId} style={styles.detailsRow}>
                  <SkyText fontsReady={fontsReady} style={[styles.mono, font("mono", fontsReady)]} tone="secondary">
                    {motorId}
                  </SkyText>
                  <SkyText
                    fontsReady={fontsReady}
                    style={[
                      styles.mono,
                      font("monoStrong", fontsReady),
                      reading.tone === "near" && { color: colors.statusWarning },
                      reading.tone === "fault" && { color: colors.statusDanger }
                    ]}
                  >
                    {formatCount(reading.count)}
                  </SkyText>
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );
}

function ManualConfirmModal({
  colors,
  fontsReady,
  onCancel,
  onConfirm,
  styles,
  visible
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <ShieldAlert color={colors.statusWarning} size={22} />
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
            Bật điều khiển?
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary">
            Robot sẽ làm theo tay điều khiển và các nút điều chỉnh. Chỉ bật khi khu vực quanh robot an toàn và hai tay
            robot đang đứng yên.
          </SkyText>
          <View style={styles.modalActions}>
            <SkyButton
              accessibilityLabel="Hủy bật điều khiển"
              fontsReady={fontsReady}
              onPress={onCancel}
              style={styles.modalButton}
              variant="secondary"
            >
              Hủy
            </SkyButton>
            <SkyButton
              accessibilityLabel="Xác nhận bật điều khiển"
              fontsReady={fontsReady}
              onPress={onConfirm}
              style={styles.modalButton}
            >
              Bật
            </SkyButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function buildReadings(positions: Record<ArmRole, PositionByMotor>): ArmReadings {
  return ARM_SEQUENCE.reduce((armReadings, role) => {
    armReadings[role] = MOTOR_IDS.reduce((motorReadings, motorId) => {
      const count = positions[role][motorId];
      motorReadings[motorId] = {
        count,
        tone: getJointTone(role, motorId, count)
      };
      return motorReadings;
    }, {} as ReadingByMotor);
    return armReadings;
  }, {} as ArmReadings);
}

function hasTone(readings: ArmReadings, tone: JointTone) {
  return ARM_SEQUENCE.some((role) => MOTOR_IDS.some((motorId) => readings[role][motorId].tone === tone));
}

function getJointTone(role: ArmRole, motorId: MotorId, count: number): JointTone {
  const limits = CALIBRATED_LIMITS[role][motorId];
  if (count < limits.min || count > limits.max) return "fault";
  if (count - limits.min <= CAUTION_MARGIN || limits.max - count <= CAUTION_MARGIN) return "near";
  return "ok";
}

function createInitialPositions(role: ArmRole): PositionByMotor {
  return MOTOR_IDS.reduce((positions, motorId) => {
    positions[motorId] = MOTOR_CENTER[role][motorId];
    return positions;
  }, {} as PositionByMotor);
}

function advanceMockPositions(
  prev: Record<ArmRole, PositionByMotor>,
  tick: number,
  controlsActive: boolean,
  activeJog: JogCommand | null
): Record<ArmRole, PositionByMotor> {
  const leader = MOTOR_IDS.reduce((positions, motorId) => {
    positions[motorId] = readLeaderMockCount(motorId, tick);
    return positions;
  }, {} as PositionByMotor);

  const follower = MOTOR_IDS.reduce((positions, motorId) => {
    const current = prev.follower[motorId];
    const passiveTarget = MOTOR_CENTER.follower[motorId] + (((tick + MOTOR_SWEEP[motorId].seed) % 9) - 4);
    const jogDelta = activeJog?.motorId === motorId ? activeJog.direction * JOG_STEP : 0;
    const teleopTarget = leader[motorId] + jogDelta;
    const target = controlsActive ? teleopTarget : passiveTarget;
    const gain = controlsActive ? 0.48 : 0.18;
    positions[motorId] = clampCount(Math.round(current + (target - current) * gain));
    return positions;
  }, {} as PositionByMotor);

  return { follower, leader };
}

function readLeaderMockCount(motorId: MotorId, tick: number) {
  const sweep = MOTOR_SWEEP[motorId];
  const center = MOTOR_CENTER.leader[motorId];
  const phase = (tick + sweep.seed) / (6 + (sweep.seed % 5));
  const drift = ((tick + sweep.seed) % 19) - MOCK_DRIFT;
  return clampCount(Math.round(center + Math.sin(phase) * MOCK_SWEEP_AMPLITUDE[motorId] + drift));
}

function clampCount(value: number) {
  return Math.max(0, Math.min(4095, value));
}

function formatCount(value: number) {
  return Math.round(value).toString().padStart(4, "0");
}

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
    pressed: {
      opacity: 0.78
    },
    state: {
      gap: space.md
    },
    stateRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm
    },
    stateText: {
      flexShrink: 1
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
    groupDisabled: {
      opacity: 0.52
    },
    switchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      minHeight: 72,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.md
    },
    switchText: {
      flex: 1,
      gap: space.xxs
    },
    switchStatus: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xs
    },
    track: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderEmphasis,
      borderRadius: corner.pill,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      paddingHorizontal: 3,
      width: 52
    },
    trackOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent
    },
    thumb: {
      backgroundColor: colors.textSecondary,
      borderRadius: corner.pill,
      height: 22,
      width: 22
    },
    thumbOn: {
      alignSelf: "flex-end",
      backgroundColor: colors.onAccent
    },
    lockNote: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xs
    },
    jogRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
      minHeight: 72,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.sm
    },
    jogLabel: {
      flex: 1,
      gap: 2
    },
    limitTag: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xxs
    },
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.productCardPadding
    },
    jogButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.pill,
      borderWidth: 1,
      height: JOG_BUTTON,
      justifyContent: "center",
      width: JOG_BUTTON
    },
    // Held: the selected interactive state — orange fill plus the icon
    // switching to onAccent, so it isn't carried by colour alone.
    jogButtonActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      transform: [{ scale: 0.94 }]
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
    detailsArm: {
      gap: space.xxs
    },
    detailsRow: {
      flexDirection: "row",
      justifyContent: "space-between"
    },
    mono: {
      fontSize: 13
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      flex: 1,
      justifyContent: "center",
      padding: layout.screenGutter
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: corner.productCard,
      borderWidth: 1,
      gap: space.sm,
      maxWidth: 420,
      padding: layout.productCardPadding,
      width: "100%"
    },
    modalActions: {
      flexDirection: "row",
      gap: space.sm,
      marginTop: space.sm
    },
    modalButton: {
      flex: 1
    }
  });
}
