import {
  Check,
  CircleAlert,
  CircleCheck,
  Hand,
  Minus,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  X
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";

type ArmRole = "follower" | "leader";
type MotorId =
  | "shoulder_pan"
  | "shoulder_lift"
  | "elbow_flex"
  | "wrist_flex"
  | "wrist_roll"
  | "gripper";
type JointTone = "ok" | "near" | "fault";
type TeleopState = "locked" | "controlling" | "near" | "fault" | "estop";

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
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
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

const ROLE_LABEL: Record<ArmRole, "Follower" | "Leader"> = {
  follower: "Follower",
  leader: "Leader"
};

const MOCK_GATE = {
  connected: true,
  calibrated: true,
  profile: "SO101-CAL-MOCK"
};

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

// theme.ts tops out at radius.card (16) — the Home "rich card" language uses
// a deliberately larger, softer corner for top-level panels, with nested
// content one size down. Scoped to this screen only.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 18;

export function TeleopScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  const [tick, setTick] = useState(0);
  const [manualEnabled, setManualEnabled] = useState(false);
  const [confirmManualVisible, setConfirmManualVisible] = useState(false);
  const [activeJog, setActiveJog] = useState<JogCommand | null>(null);
  const [positions, setPositions] = useState<Record<ArmRole, PositionByMotor>>({
    follower: createInitialPositions("follower"),
    leader: createInitialPositions("leader")
  });

  const readings = useMemo(() => buildReadings(positions), [positions]);
  const hasFault = hasTone(readings, "fault");
  const hasNearLimit = hasTone(readings, "near");
  const controlGateReady = MOCK_GATE.connected && MOCK_GATE.calibrated && manualEnabled;
  const controlsActive = controlGateReady && !emergencyStopped && !hasFault;
  const teleopState = getTeleopState({ emergencyStopped, controlGateReady, hasFault, hasNearLimit });

  useEffect(() => {
    if (!controlsActive && activeJog) setActiveJog(null);
  }, [activeJog, controlsActive]);

  useEffect(() => {
    if (emergencyStopped) return undefined;

    const timer = setInterval(() => {
      setTick((currentTick) => {
        const nextTick = currentTick + 1;
        setPositions((prev) => advanceMockPositions(prev, nextTick, controlsActive, activeJog));
        return nextTick;
      });
    }, 360);

    return () => clearInterval(timer);
  }, [activeJog, controlsActive, emergencyStopped]);

  const openManualConfirm = () => {
    if (emergencyStopped) return;
    if (manualEnabled) {
      setManualEnabled(false);
      return;
    }
    setConfirmManualVisible(true);
  };

  const confirmManual = () => {
    setManualEnabled(true);
    setConfirmManualVisible(false);
  };

  const cancelManualConfirm = () => {
    setConfirmManualVisible(false);
  };

  return (
    <>
      <ScrollView
        accessibilityLabel="Màn hình Teleop OmniArm"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={[styles.screen, emergencyStopped && styles.screenStopped]}
      >
        <ScreenHeader
          fontsReady={fontsReady}
          meta="LIVE"
          onBack={onBack}
          subtitle="Leader kéo, Follower theo; jog chỉ tác động lên Follower"
          title="Teleop"
        />

        {emergencyStopped && <StoppedBanner fontsReady={fontsReady} />}

        <ControlStatePanel fontsReady={fontsReady} state={teleopState} />

        <ManualActionCard
          disabled={teleopState === "estop"}
          fontsReady={fontsReady}
          manualEnabled={manualEnabled}
          onToggle={openManualConfirm}
        />

        <GatePanel
          connected={MOCK_GATE.connected}
          calibrated={MOCK_GATE.calibrated}
          emergencyStopped={emergencyStopped}
          fontsReady={fontsReady}
          manualEnabled={manualEnabled}
          profile={MOCK_GATE.profile}
        />

        <View style={styles.armStack}>
          {ARM_SEQUENCE.map((role) => (
            <ArmLiveCard
              fontsReady={fontsReady}
              key={role}
              readings={readings[role]}
              role={role}
              tick={tick}
            />
          ))}
        </View>

        <JogPanel
          activeJog={activeJog}
          disabled={!controlsActive}
          fontsReady={fontsReady}
          onJogStart={setActiveJog}
          onJogStop={() => setActiveJog(null)}
        />
      </ScrollView>

      <ManualConfirmModal
        fontsReady={fontsReady}
        onCancel={cancelManualConfirm}
        onConfirm={confirmManual}
        visible={confirmManualVisible}
      />
    </>
  );
}

function StoppedBanner({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.stoppedBanner}>
      <ShieldAlert color={colors.danger} size={18} />
      <Text style={[styles.stoppedText, font("body", fontsReady)]}>
        Hệ thống đang E-STOP, Teleop và jog Follower đã bị khóa. Reset E-STOP ở thanh trạng thái để tiếp tục.
      </Text>
    </View>
  );
}

function ControlStatePanel({ fontsReady, state }: { fontsReady: boolean; state: TeleopState }) {
  const display = getStateDisplay(state);

  return (
    <View style={[styles.statePanel, state === "estop" && styles.panelDanger, state === "fault" && styles.panelDanger]}>
      <View style={styles.stateTitleRow}>
        {display.icon}
        <Text style={[styles.stateTitle, display.textStyle, font("display", fontsReady)]}>{display.title}</Text>
      </View>
      <Text style={[styles.stateCaption, font("body", fontsReady)]}>{display.caption}</Text>
    </View>
  );
}

function ManualActionCard({
  disabled,
  fontsReady,
  manualEnabled,
  onToggle
}: {
  disabled: boolean;
  fontsReady: boolean;
  manualEnabled: boolean;
  onToggle: () => void;
}) {
  const label = manualEnabled ? "Tắt Manual" : "Bật Manual";

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: manualEnabled, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.manualAction,
        disabled && styles.manualActionDisabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.manualActionText, disabled && styles.manualActionTextDisabled, font("display", fontsReady)]}>
        {label}
      </Text>
      <View style={[styles.manualActionIcon, disabled && styles.manualActionIconDisabled]}>
        <Hand color={disabled ? colors.textLo : colors.accent} size={18} />
      </View>
    </Pressable>
  );
}

function GatePanel({
  calibrated,
  connected,
  emergencyStopped,
  fontsReady,
  manualEnabled,
  profile
}: {
  calibrated: boolean;
  connected: boolean;
  emergencyStopped: boolean;
  fontsReady: boolean;
  manualEnabled: boolean;
  profile: string;
}) {
  return (
    <View style={styles.gatePanel}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Gate an toàn</Text>
        <Text style={[styles.sectionMeta, font("mono", fontsReady)]}>MOCK</Text>
      </View>

      <View style={styles.gateShell}>
        <View style={styles.gateGrid}>
          <GateChip active={connected && !emergencyStopped} fontsReady={fontsReady} label="Kết nối" value="Online" />
          <GateChip active={calibrated && !emergencyStopped} fontsReady={fontsReady} label="Calibrate" value={profile} />
          <GateChip active={manualEnabled && !emergencyStopped} fontsReady={fontsReady} label="Manual" value={manualEnabled ? "ON" : "OFF"} />
        </View>
      </View>
    </View>
  );
}

function GateChip({
  active,
  fontsReady,
  label,
  value
}: {
  active: boolean;
  fontsReady: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.gateChip, active && styles.gateChipActive]}>
      <View style={[styles.statusDot, active && styles.statusDotOk]} />
      <View style={styles.gateCopy}>
        <Text style={[styles.gateLabel, font("body", fontsReady)]}>{label}</Text>
        <Text style={[styles.gateValue, active && styles.gateValueActive, font("monoStrong", fontsReady)]}>{value}</Text>
      </View>
    </View>
  );
}

function ArmLiveCard({
  fontsReady,
  readings,
  role,
  tick
}: {
  fontsReady: boolean;
  readings: ReadingByMotor;
  role: ArmRole;
  tick: number;
}) {
  const fault = MOTOR_IDS.some((motorId) => readings[motorId].tone === "fault");
  const near = MOTOR_IDS.some((motorId) => readings[motorId].tone === "near");
  const latency = role === "follower" ? 12 + (tick % 5) : 15 + (tick % 6);
  const health = fault ? "Fault" : near ? "Degraded" : "Healthy";

  return (
    <View style={[styles.armCard, fault && styles.panelDanger, near && !fault && styles.panelCaution]}>
      <View style={styles.armHeader}>
        <View style={styles.armTitleRow}>
          <View style={styles.armIcon}>
            <Hand color={colors.textHi} size={18} />
          </View>
          <View style={styles.armTitleBlock}>
            <Text style={[styles.armTitle, font("display", fontsReady)]}>{ROLE_LABEL[role]}</Text>
            <Text style={[styles.armCaption, font("body", fontsReady)]}>
              {role === "follower" ? "Theo lệnh Leader + jog tay" : "Nguồn chuyển động teleop"}
            </Text>
          </View>
        </View>

        <HealthPill fontsReady={fontsReady} tone={fault ? "fault" : near ? "near" : "ok"} value={health} />
      </View>

      <View style={styles.healthRow}>
        <Metric fontsReady={fontsReady} label="Latency" value={`${latency} ms`} />
        <Metric fontsReady={fontsReady} label="Loop" value={role === "follower" ? "52 Hz" : "49 Hz"} />
      </View>

      <JointReadouts fontsReady={fontsReady} readings={readings} />
    </View>
  );
}

function Metric({ fontsReady, label, value }: { fontsReady: boolean; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, font("body", fontsReady)]}>{label}</Text>
      <Text style={[styles.metricValue, font("monoStrong", fontsReady)]}>{value}</Text>
    </View>
  );
}

function HealthPill({
  fontsReady,
  tone,
  value
}: {
  fontsReady: boolean;
  tone: JointTone;
  value: string;
}) {
  return (
    <View style={[styles.healthPill, tone === "near" && styles.healthPillCaution, tone === "fault" && styles.healthPillDanger]}>
      <View
        style={[
          styles.healthDot,
          tone === "ok" && styles.healthDotOk,
          tone === "near" && styles.healthDotCaution,
          tone === "fault" && styles.healthDotDanger
        ]}
      />
      <Text
        style={[
          styles.healthText,
          tone === "near" && styles.healthTextCaution,
          tone === "fault" && styles.healthTextDanger,
          font("display", fontsReady)
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function JointReadouts({ fontsReady, readings }: { fontsReady: boolean; readings: ReadingByMotor }) {
  return (
    <View style={styles.jointList}>
      {MOTOR_IDS.map((motorId) => {
        const reading = readings[motorId];
        const near = reading.tone === "near";
        const fault = reading.tone === "fault";

        return (
          <View key={motorId} style={[styles.jointRow, near && styles.jointRowCaution, fault && styles.jointRowDanger]}>
            <View style={styles.jointRowLabelBlock}>
              <Text numberOfLines={1} style={[styles.jointRowLabel, font("mono", fontsReady)]}>
                {motorId}
              </Text>
              {reading.tone !== "ok" && (
                <Text
                  style={[
                    styles.jointRowState,
                    fault && styles.jointRowStateDanger,
                    near && styles.jointRowStateCaution,
                    font("display", fontsReady)
                  ]}
                >
                  {jointToneLabel(reading.tone)}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.jointRowValue,
                near && styles.jointRowValueCaution,
                fault && styles.jointRowValueDanger,
                font("monoStrong", fontsReady)
              ]}
            >
              {formatCount(reading.count)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function JogPanel({
  activeJog,
  disabled,
  fontsReady,
  onJogStart,
  onJogStop
}: {
  activeJog: JogCommand | null;
  disabled: boolean;
  fontsReady: boolean;
  onJogStart: (command: JogCommand) => void;
  onJogStop: () => void;
}) {
  return (
    <View style={[styles.jogPanel, disabled && styles.jogPanelDisabled]}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Jog Follower</Text>
          <Text style={[styles.sectionHint, font("body", fontsReady)]}>Bấm-giữ + hoặc - theo từng motor</Text>
        </View>
        <Text style={[styles.sectionMeta, font("mono", fontsReady)]}>{disabled ? "LOCKED" : "ARMED"}</Text>
      </View>

      <View style={styles.jogGrid}>
        {MOTOR_IDS.map((motorId) => (
          <View key={motorId} style={styles.jogRow}>
            <Text numberOfLines={1} style={[styles.jogMotor, font("mono", fontsReady)]}>
              {motorId}
            </Text>
            <View style={styles.jogButtons}>
              <JogButton
                active={activeJog?.motorId === motorId && activeJog.direction === -1}
                disabled={disabled}
                direction={-1}
                fontsReady={fontsReady}
                motorId={motorId}
                onJogStart={onJogStart}
                onJogStop={onJogStop}
              />
              <JogButton
                active={activeJog?.motorId === motorId && activeJog.direction === 1}
                disabled={disabled}
                direction={1}
                fontsReady={fontsReady}
                motorId={motorId}
                onJogStart={onJogStart}
                onJogStop={onJogStop}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function JogButton({
  active,
  disabled,
  direction,
  fontsReady,
  motorId,
  onJogStart,
  onJogStop
}: {
  active: boolean;
  disabled: boolean;
  direction: -1 | 1;
  fontsReady: boolean;
  motorId: MotorId;
  onJogStart: (command: JogCommand) => void;
  onJogStop: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${direction > 0 ? "Tăng" : "Giảm"} ${motorId}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onBlur={onJogStop}
      onPressIn={() => onJogStart({ motorId, direction })}
      onPressOut={onJogStop}
      style={({ pressed }) => [
        styles.jogButton,
        active && styles.jogButtonActive,
        disabled && styles.jogButtonDisabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {direction > 0 ? (
        <Plus color={active ? colors.accentText : disabled ? colors.textLo : colors.textHi} size={17} />
      ) : (
        <Minus color={active ? colors.accentText : disabled ? colors.textLo : colors.textHi} size={17} />
      )}
      <Text
        style={[
          styles.jogButtonText,
          active && styles.jogButtonTextActive,
          disabled && styles.jogButtonTextDisabled,
          font("display", fontsReady)
        ]}
      >
        {direction > 0 ? "+" : "-"}
      </Text>
    </Pressable>
  );
}

function ManualConfirmModal({
  fontsReady,
  onCancel,
  onConfirm,
  visible
}: {
  fontsReady: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <ShieldAlert color={colors.caution} size={20} />
            </View>
            <Pressable
              accessibilityLabel="Đóng xác nhận Manual"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onCancel}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <X color={colors.textHi} size={18} />
            </Pressable>
          </View>

          <Text style={[styles.modalTitle, font("display", fontsReady)]}>Bật Manual?</Text>
          <Text style={[styles.modalText, font("body", fontsReady)]}>
            Manual cho phép Teleop gửi lệnh trực tiếp tới Follower. Chỉ bật khi khu vực thao tác an toàn và cả hai tay đã đứng yên.
          </Text>

          <View style={styles.modalActions}>
            <Pressable
              accessibilityLabel="Hủy bật Manual"
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.modalSecondaryButton, pressed && styles.pressed]}
            >
              <Text style={[styles.modalSecondaryText, font("display", fontsReady)]}>Hủy</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Xác nhận bật Manual"
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.modalPrimaryButton, pressed && styles.pressed]}
            >
              <Check color={colors.accentText} size={17} />
              <Text style={[styles.modalPrimaryText, font("display", fontsReady)]}>Bật Manual</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStateDisplay(state: TeleopState) {
  switch (state) {
    case "locked":
      return {
        caption: "Control bị khóa cho tới khi đủ kết nối, calibrate và Manual.",
        icon: <ShieldAlert color={colors.textLo} size={18} />,
        textStyle: styles.stateTitleMuted,
        title: "Khóa an toàn"
      };
    case "controlling":
      return {
        caption: "Leader đang điều khiển Follower, jog Follower đã bật.",
        icon: <CircleCheck color={colors.accent} size={18} />,
        textStyle: styles.stateTitleOk,
        title: "Đang điều khiển"
      };
    case "near":
      return {
        caption: "Một hoặc nhiều khớp đang gần giới hạn đã calibrate.",
        icon: <TriangleAlert color={colors.caution} size={18} />,
        textStyle: styles.stateTitleCaution,
        title: "Gần giới hạn"
      };
    case "fault":
      return {
        caption: "Servo vượt MIN/MAX từ profile calibrate, jog bị khóa.",
        icon: <CircleAlert color={colors.danger} size={18} />,
        textStyle: styles.stateTitleDanger,
        title: "Vượt giới hạn"
      };
    case "estop":
      return {
        caption: "E-STOP đang giữ toàn bộ Teleop ở trạng thái dừng.",
        icon: <ShieldAlert color={colors.danger} size={18} />,
        textStyle: styles.stateTitleDanger,
        title: "E-STOP"
      };
  }
}

function getTeleopState({
  controlGateReady,
  emergencyStopped,
  hasFault,
  hasNearLimit
}: {
  controlGateReady: boolean;
  emergencyStopped: boolean;
  hasFault: boolean;
  hasNearLimit: boolean;
}): TeleopState {
  if (emergencyStopped) return "estop";
  if (!controlGateReady) return "locked";
  if (hasFault) return "fault";
  if (hasNearLimit) return "near";
  return "controlling";
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

function jointToneLabel(tone: JointTone) {
  switch (tone) {
    case "ok":
      return "OK";
    case "near":
      return "Caution";
    case "fault":
      return "Fault";
  }
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
  const drift = ((tick + sweep.seed) % 19) - 9;
  return clampCount(Math.round(center + Math.sin(phase) * sweep.amplitude + drift));
}

function clampCount(value: number) {
  return Math.max(0, Math.min(4095, value));
}

function formatCount(value: number) {
  return Math.round(value).toString().padStart(4, "0");
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  screenStopped: {
    backgroundColor: colors.surface2
  },
  content: {
    gap: spacing.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  stoppedBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  stoppedText: {
    ...type.body,
    color: colors.textHi,
    flex: 1
  },
  statePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  panelDanger: {
    borderColor: colors.danger
  },
  panelCaution: {
    borderColor: colors.caution
  },
  stateTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  stateTitle: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  stateTitleMuted: {
    color: colors.textLo
  },
  stateTitleOk: {
    color: colors.accent
  },
  stateTitleCaution: {
    color: colors.caution
  },
  stateTitleDanger: {
    color: colors.danger
  },
  stateCaption: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  manualAction: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: CARD_RADIUS_OUTER,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  manualActionDisabled: {
    backgroundColor: colors.surface2
  },
  manualActionText: {
    ...type.title,
    color: colors.accentText
  },
  manualActionTextDisabled: {
    color: colors.textLo
  },
  manualActionIcon: {
    alignItems: "center",
    backgroundColor: colors.accentText,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  manualActionIconDisabled: {
    backgroundColor: colors.surface
  },
  gatePanel: {
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
  sectionHint: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  sectionMeta: {
    ...type.mono,
    color: colors.textLo
  },
  gateShell: {
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.sm
  },
  gateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  gateChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "transparent",
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    flexBasis: "31%",
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 54,
    minWidth: 112,
    padding: spacing.sm
  },
  gateChipActive: {
    borderColor: colors.accent
  },
  statusDot: {
    backgroundColor: colors.textLo,
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  statusDotOk: {
    backgroundColor: colors.accent
  },
  gateCopy: {
    flex: 1,
    minWidth: 0
  },
  gateLabel: {
    ...type.small,
    color: colors.textLo
  },
  gateValue: {
    ...type.mono,
    color: colors.textLo,
    marginTop: 2
  },
  gateValueActive: {
    color: colors.textHi
  },
  armStack: {
    gap: spacing.md
  },
  armCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  armHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  armTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0
  },
  armIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  armTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  armTitle: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  armCaption: {
    ...type.small,
    color: colors.textLo,
    marginTop: 2
  },
  healthPill: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm
  },
  healthPillCaution: {
    borderColor: colors.caution
  },
  healthPillDanger: {
    borderColor: colors.danger
  },
  healthDot: {
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  healthDotOk: {
    backgroundColor: colors.accent
  },
  healthDotCaution: {
    backgroundColor: colors.caution
  },
  healthDotDanger: {
    backgroundColor: colors.danger
  },
  healthText: {
    ...type.small,
    color: colors.textHi
  },
  healthTextCaution: {
    color: colors.caution
  },
  healthTextDanger: {
    color: colors.danger
  },
  healthRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  metric: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 58,
    padding: spacing.sm
  },
  metricLabel: {
    ...type.small,
    color: colors.textLo
  },
  metricValue: {
    ...type.mono,
    color: colors.textHi,
    fontVariant: ["tabular-nums"]
  },
  jointList: {
    gap: spacing.xs
  },
  jointRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: "transparent",
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: spacing.md
  },
  jointRowCaution: {
    borderColor: colors.caution
  },
  jointRowDanger: {
    borderColor: colors.danger
  },
  jointRowLabelBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  jointRowLabel: {
    ...type.small,
    color: colors.textLo
  },
  jointRowState: {
    ...type.small,
    color: colors.caution
  },
  jointRowStateCaution: {
    color: colors.caution
  },
  jointRowStateDanger: {
    color: colors.danger
  },
  jointRowValue: {
    ...type.title,
    color: colors.textHi,
    fontVariant: ["tabular-nums"]
  },
  jointRowValueCaution: {
    color: colors.caution
  },
  jointRowValueDanger: {
    color: colors.danger
  },
  jogPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  jogPanelDisabled: {
    opacity: 0.72
  },
  jogGrid: {
    gap: spacing.sm
  },
  jogRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 50,
    padding: spacing.sm
  },
  jogMotor: {
    ...type.mono,
    color: colors.textHi,
    flex: 1
  },
  jogButtons: {
    flexDirection: "row",
    gap: spacing.xs
  },
  jogButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xxs,
    height: 38,
    justifyContent: "center",
    minWidth: 58,
    paddingHorizontal: spacing.xs
  },
  jogButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  jogButtonDisabled: {
    opacity: 0.45
  },
  jogButtonText: {
    ...type.label,
    color: colors.textHi
  },
  jogButtonTextActive: {
    color: colors.accentText
  },
  jogButtonTextDisabled: {
    color: colors.textLo
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    opacity: 0.96,
    padding: spacing.lg
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
    width: "100%"
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  modalIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  modalTitle: {
    ...type.title,
    color: colors.textHi
  },
  modalText: {
    ...type.body,
    color: colors.textLo
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  modalSecondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: spacing.md
  },
  modalSecondaryText: {
    ...type.label,
    color: colors.textHi
  },
  modalPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 150,
    paddingHorizontal: spacing.md
  },
  modalPrimaryText: {
    ...type.label,
    color: colors.accentText
  },
  pressed: {
    opacity: 0.78
  }
});
