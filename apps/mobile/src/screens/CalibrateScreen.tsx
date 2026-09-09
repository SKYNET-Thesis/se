import { Check, Circle, CircleCheck, RotateCcw, ScanLine, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

type RangeRow = {
  min: number;
  pos: number;
  max: number;
};

type RangeByMotor = Record<MotorId, RangeRow>;
type RunStatus = "idle" | "recording" | "completed";

type ArmCalibration = {
  status: RunStatus;
  range: RangeByMotor;
};

type PortState = {
  value: string | null;
  searching: boolean;
};

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
};

const ARM_ROLES: ArmRole[] = ["follower", "leader"];
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

const ROLE_HINT: Record<ArmRole, string> = {
  follower: "Robot",
  leader: "Teleoperator"
};

// theme.ts tops out at radius.card (16) — matches the larger, softer corner
// Home/Teleop/Connect already established for this app's "rich card"
// surfaces, kept identical here so Calibrate reads as the same product.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 20;

const MOCK_PORT: Record<ArmRole, string> = {
  follower: "/dev/ttyACM0",
  leader: "/dev/ttyACM1"
};

const MOTOR_CONFIG: Record<MotorId, { amplitude: number; followerCenter: number; leaderCenter: number; seed: number }> = {
  shoulder_pan: { amplitude: 1420, followerCenter: 2048, leaderCenter: 2070, seed: 0 },
  shoulder_lift: { amplitude: 1180, followerCenter: 1960, leaderCenter: 1995, seed: 7 },
  elbow_flex: { amplitude: 1260, followerCenter: 2144, leaderCenter: 2110, seed: 13 },
  wrist_flex: { amplitude: 980, followerCenter: 2012, leaderCenter: 2058, seed: 19 },
  wrist_roll: { amplitude: 1540, followerCenter: 2090, leaderCenter: 2032, seed: 29 },
  gripper: { amplitude: 760, followerCenter: 1710, leaderCenter: 1764, seed: 37 }
};

// A joint counts as "captured" once its recorded swing covers most of its
// realistic travel — comfortably reachable while still requiring an honest
// full-range sweep before the Save pill unlocks.
function requiredSpan(motorId: MotorId) {
  return MOTOR_CONFIG[motorId].amplitude * 1.1;
}

export function CalibrateScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  const [selectedArm, setSelectedArm] = useState<ArmRole>("follower");
  const [sampleTick, setSampleTick] = useState(0);
  const [arms, setArms] = useState<Record<ArmRole, ArmCalibration>>({
    follower: createArmCalibration("follower"),
    leader: createArmCalibration("leader")
  });
  const [ports, setPorts] = useState<Record<ArmRole, PortState>>({
    follower: { value: null, searching: false },
    leader: { value: null, searching: false }
  });

  const selectedRun = arms[selectedArm];
  const otherArm: ArmRole = selectedArm === "follower" ? "leader" : "follower";
  const allCaptured = MOTOR_IDS.every(
    (motorId) => selectedRun.range[motorId].max - selectedRun.range[motorId].min >= requiredSpan(motorId)
  );

  useEffect(() => {
    if (emergencyStopped || selectedRun.status !== "recording") return undefined;

    const timer = setInterval(() => {
      setSampleTick((tick) => {
        const nextTick = tick + 1;
        setArms((prev) =>
          updateArm(prev, selectedArm, {
            range: advanceMockRange(prev[selectedArm].range, selectedArm, nextTick)
          })
        );
        return nextTick;
      });
    }, 480);

    return () => clearInterval(timer);
  }, [emergencyStopped, selectedArm, selectedRun.status]);

  const handleStart = () => {
    if (emergencyStopped) return;
    setArms((prev) => updateArm(prev, selectedArm, { status: "recording" }));
  };

  const handleCancel = () => {
    if (emergencyStopped) return;
    setArms((prev) => updateArm(prev, selectedArm, { status: "idle", range: createInitialRange(selectedArm) }));
  };

  const handleSave = () => {
    if (emergencyStopped || selectedRun.status !== "recording" || !allCaptured) return;
    setArms((prev) => updateArm(prev, selectedArm, { status: "completed" }));
  };

  const handleFindPort = () => {
    if (emergencyStopped) return;
    const role = selectedArm;
    setPorts((prev) => ({ ...prev, [role]: { ...prev[role], searching: true } }));
    setTimeout(() => {
      setPorts((prev) => ({ ...prev, [role]: { value: MOCK_PORT[role], searching: false } }));
    }, 500);
  };

  const primaryLabel = selectedRun.status === "recording" ? "Hủy hiệu chỉnh" : "Bắt đầu hiệu chỉnh";
  const primaryDisabled = emergencyStopped || selectedRun.status === "completed";
  const onPrimaryPress = selectedRun.status === "recording" ? handleCancel : handleStart;

  return (
    <ScrollView
      accessibilityLabel="Màn hình hiệu chỉnh SO-101"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        meta={ROLE_LABEL[selectedArm]}
        onBack={onBack}
        subtitle="Ghi tầm chuyển động thật cho Follower và Leader"
        title="Hiệu chỉnh"
      />

      {emergencyStopped && <StoppedBanner fontsReady={fontsReady} />}

      <View style={styles.configBlock}>
        <View style={styles.configCard}>
          <ArmSegmented disabled={emergencyStopped} fontsReady={fontsReady} onChange={setSelectedArm} value={selectedArm} />

          <PortField
            disabled={emergencyStopped}
            fontsReady={fontsReady}
            onFind={handleFindPort}
            port={ports[selectedArm]}
          />
        </View>

        <Pressable
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: primaryDisabled }}
          disabled={primaryDisabled}
          onPress={onPrimaryPress}
          style={({ pressed }) => [
            styles.primaryPill,
            selectedRun.status === "recording" && styles.primaryPillDanger,
            primaryDisabled && styles.primaryPillDisabled,
            pressed && !primaryDisabled && styles.pillPressed
          ]}
        >
          <Text
            style={[
              styles.primaryPillText,
              selectedRun.status === "recording" && styles.primaryPillTextDanger,
              primaryDisabled && styles.primaryPillTextDisabled,
              font("display", fontsReady)
            ]}
          >
            {primaryLabel}
          </Text>
        </Pressable>

        <ArmChecklist arms={arms} fontsReady={fontsReady} />
      </View>

      <View style={styles.statusCard}>
        <StatusBadge fontsReady={fontsReady} status={selectedRun.status} />

        {selectedRun.status === "idle" && (
          <Text style={[styles.promptLine, font("body", fontsReady)]}>
            Đưa mọi khớp về giữa tầm rồi bắt đầu ghi.
          </Text>
        )}

        {selectedRun.status !== "idle" && (
          <>
            <ReminderBanner fontsReady={fontsReady} />

            <View style={styles.jointListHeader}>
              <Text style={[styles.jointListTitle, font("display", fontsReady)]}>Dữ liệu vị trí trực tiếp</Text>
              <Text style={[styles.jointListMeta, font("mono", fontsReady)]}>MOCK · T{sampleTick}</Text>
            </View>

            <View style={styles.jointList}>
              {MOTOR_IDS.map((motorId) => (
                <JointRow
                  captured={selectedRun.range[motorId].max - selectedRun.range[motorId].min >= requiredSpan(motorId)}
                  fontsReady={fontsReady}
                  key={motorId}
                  motorId={motorId}
                  row={selectedRun.range[motorId]}
                />
              ))}
            </View>
          </>
        )}
      </View>

      {selectedRun.status === "recording" && (
        <View style={styles.saveBlock}>
          <Pressable
            accessibilityLabel="Lưu hiệu chỉnh"
            accessibilityRole="button"
            accessibilityState={{ disabled: emergencyStopped || !allCaptured }}
            disabled={emergencyStopped || !allCaptured}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.savePill,
              (emergencyStopped || !allCaptured) && styles.savePillDisabled,
              pressed && allCaptured && !emergencyStopped && styles.pillPressed
            ]}
          >
            <Check color={allCaptured && !emergencyStopped ? colors.accentText : colors.textLo} size={18} />
            <Text
              style={[
                styles.savePillText,
                (!allCaptured || emergencyStopped) && styles.savePillTextDisabled,
                font("display", fontsReady)
              ]}
            >
              Lưu hiệu chỉnh
            </Text>
          </Pressable>

          {!allCaptured && (
            <Text style={[styles.saveHint, font("body", fontsReady)]}>
              Ghi đủ tầm cho cả 6 khớp để bật nút lưu.
            </Text>
          )}
        </View>
      )}

      {selectedRun.status === "completed" && (
        <CompletionPanel
          fontsReady={fontsReady}
          onSwitchArm={() => setSelectedArm(otherArm)}
          otherArm={otherArm}
          otherDone={arms[otherArm].status === "completed"}
        />
      )}
    </ScrollView>
  );
}

function ArmSegmented({
  disabled,
  fontsReady,
  onChange,
  value
}: {
  disabled: boolean;
  fontsReady: boolean;
  onChange: (role: ArmRole) => void;
  value: ArmRole;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {ARM_ROLES.map((role) => {
        const active = value === role;
        return (
          <Pressable
            accessibilityLabel={`${ROLE_LABEL[role]} (${ROLE_HINT[role]})`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            key={role}
            onPress={() => onChange(role)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentTitle, active && styles.segmentTitleActive, font("display", fontsReady)]}>
              {ROLE_LABEL[role]}
            </Text>
            <Text style={[styles.segmentHint, active && styles.segmentHintActive, font("body", fontsReady)]}>
              {ROLE_HINT[role]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PortField({
  disabled,
  fontsReady,
  onFind,
  port
}: {
  disabled: boolean;
  fontsReady: boolean;
  onFind: () => void;
  port: PortState;
}) {
  return (
    <View style={styles.portRow}>
      <View style={styles.portField}>
        <Text style={[styles.portLabel, font("body", fontsReady)]}>Port</Text>
        <Text style={[styles.portValue, font("mono", fontsReady)]}>
          {port.searching ? "Đang tìm…" : (port.value ?? "Chưa xác định")}
        </Text>
      </View>

      <Pressable
        accessibilityLabel="Tìm port"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onFind}
        style={({ pressed }) => [styles.findButton, disabled && styles.findButtonDisabled, pressed && !disabled && styles.pillPressed]}
      >
        <ScanLine color={disabled ? colors.textLo : colors.textHi} size={16} />
        <Text style={[styles.findButtonText, disabled && styles.findButtonTextDisabled, font("display", fontsReady)]}>
          Tìm
        </Text>
      </Pressable>
    </View>
  );
}

function ArmChecklist({ arms, fontsReady }: { arms: Record<ArmRole, ArmCalibration>; fontsReady: boolean }) {
  return (
    <View style={styles.checklistRow}>
      {ARM_ROLES.map((role) => {
        const done = arms[role].status === "completed";
        return (
          <View key={role} style={styles.checklistItem}>
            {done ? <CircleCheck color={colors.accent} size={16} /> : <Circle color={colors.textLo} size={16} />}
            <Text style={[styles.checklistText, done && styles.checklistTextDone, font("body", fontsReady)]}>
              {ROLE_LABEL[role]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StatusBadge({ fontsReady, status }: { fontsReady: boolean; status: RunStatus }) {
  const label = status === "idle" ? "Đưa về giữa" : status === "recording" ? "Đang ghi tầm" : "Hoàn tất";

  return (
    <View
      style={[
        styles.badge,
        status === "recording" && styles.badgeRecording,
        status === "completed" && styles.badgeCompleted
      ]}
    >
      <View
        style={[
          styles.badgeDot,
          status === "recording" && styles.badgeDotRecording,
          status === "completed" && styles.badgeDotCompleted
        ]}
      />
      <Text
        style={[
          styles.badgeText,
          status === "recording" && styles.badgeTextRecording,
          status === "completed" && styles.badgeTextCompleted,
          font("display", fontsReady)
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ReminderBanner({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.reminderBanner}>
      <TriangleAlert color={colors.caution} size={16} />
      <Text style={[styles.reminderText, font("body", fontsReady)]}>
        Di chuyển từng khớp hết tầm tới điểm chặn cơ khí.
      </Text>
    </View>
  );
}

function StoppedBanner({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.stoppedBanner}>
      <ShieldAlert color={colors.danger} size={18} />
      <Text style={[styles.stoppedText, font("body", fontsReady)]}>
        Hệ thống đang E-STOP, không thể ghi hoặc lưu hiệu chỉnh. Reset E-STOP ở thanh trạng thái để tiếp tục.
      </Text>
    </View>
  );
}

function JointRow({
  captured,
  fontsReady,
  motorId,
  row
}: {
  captured: boolean;
  fontsReady: boolean;
  motorId: MotorId;
  row: RangeRow;
}) {
  const span = row.max - row.min;
  const fraction = span > 0 ? (row.pos - row.min) / span : 0.5;

  return (
    <View style={[styles.jointCard, captured && styles.jointCardDone]}>
      <View style={styles.jointHeaderRow}>
        <View style={styles.jointNameRow}>
          {captured ? <CircleCheck color={colors.accent} size={16} /> : <Circle color={colors.textLo} size={16} />}
          <Text style={[styles.jointName, font("mono", fontsReady)]}>{motorId}</Text>
        </View>
        <Text style={[styles.jointPos, font("monoStrong", fontsReady)]}>{formatCount(row.pos)}</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.trackCursor, { left: `${Math.round(fraction * 100)}%` }]} />
      </View>

      <View style={styles.trackLabels}>
        <Text style={[styles.trackLabel, font("mono", fontsReady)]}>{formatCount(row.min)}</Text>
        <Text style={[styles.trackLabel, styles.trackLabelRight, font("mono", fontsReady)]}>
          {formatCount(row.max)}
        </Text>
      </View>
    </View>
  );
}

function CompletionPanel({
  fontsReady,
  onSwitchArm,
  otherArm,
  otherDone
}: {
  fontsReady: boolean;
  onSwitchArm: () => void;
  otherArm: ArmRole;
  otherDone: boolean;
}) {
  return (
    <View style={styles.completionPanel}>
      <View style={styles.completionRow}>
        <CircleCheck color={colors.accent} size={18} />
        <Text style={[styles.completionText, font("body", fontsReady)]}>
          Đã lưu hiệu chỉnh cho {ROLE_LABEL[otherArm === "follower" ? "leader" : "follower"]}.
        </Text>
      </View>

      {otherDone ? (
        <Text style={[styles.completionText, font("body", fontsReady)]}>
          Cả Follower và Leader đã hiệu chỉnh xong.
        </Text>
      ) : (
        <Pressable
          accessibilityLabel={`Chuyển sang hiệu chỉnh ${ROLE_LABEL[otherArm]}`}
          accessibilityRole="button"
          onPress={onSwitchArm}
          style={({ pressed }) => [styles.switchButton, pressed && styles.pillPressed]}
        >
          <RotateCcw color={colors.textHi} size={16} />
          <Text style={[styles.switchButtonText, font("display", fontsReady)]}>
            Chuyển sang {ROLE_LABEL[otherArm]}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function createArmCalibration(role: ArmRole): ArmCalibration {
  return { status: "idle", range: createInitialRange(role) };
}

function createInitialRange(role: ArmRole): RangeByMotor {
  return MOTOR_IDS.reduce((range, motorId) => {
    const center = getCenterCount(role, motorId);
    range[motorId] = { min: center, pos: center, max: center };
    return range;
  }, {} as RangeByMotor);
}

function advanceMockRange(range: RangeByMotor, role: ArmRole, tick: number): RangeByMotor {
  return MOTOR_IDS.reduce((nextRange, motorId) => {
    const pos = readMockCount(role, motorId, tick);
    const prev = range[motorId];
    nextRange[motorId] = {
      min: Math.min(prev.min, pos),
      pos,
      max: Math.max(prev.max, pos)
    };
    return nextRange;
  }, {} as RangeByMotor);
}

function updateArm(
  prev: Record<ArmRole, ArmCalibration>,
  role: ArmRole,
  patch: Partial<ArmCalibration>
) {
  return {
    ...prev,
    [role]: {
      ...prev[role],
      ...patch
    }
  };
}

function readMockCount(role: ArmRole, motorId: MotorId, tick: number) {
  const config = MOTOR_CONFIG[motorId];
  const center = getCenterCount(role, motorId);
  const phase = (tick + config.seed + (role === "leader" ? 11 : 0)) / (7 + (config.seed % 5));
  const sweep = Math.sin(phase) * config.amplitude;
  const microDrift = ((tick + config.seed) % 17) - 8;
  return clampCount(Math.round(center + sweep + microDrift));
}

function getCenterCount(role: ArmRole, motorId: MotorId) {
  const config = MOTOR_CONFIG[motorId];
  return role === "follower" ? config.followerCenter : config.leaderCenter;
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
  content: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
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
  configBlock: {
    gap: spacing.md
  },
  configCard: {
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS_OUTER,
    gap: spacing.sm,
    padding: spacing.md
  },
  segmented: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS_INNER,
    flexDirection: "row",
    gap: spacing.xxs,
    padding: spacing.xxs
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.button,
    flex: 1,
    gap: 2,
    paddingVertical: spacing.sm
  },
  segmentActive: {
    backgroundColor: colors.surface2
  },
  segmentTitle: {
    ...type.label,
    color: colors.textLo
  },
  segmentTitleActive: {
    color: colors.accent
  },
  segmentHint: {
    ...type.small,
    color: colors.textLo
  },
  segmentHintActive: {
    color: colors.textHi
  },
  portRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  portField: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  portLabel: {
    ...type.small,
    color: colors.textLo
  },
  portValue: {
    ...type.mono,
    color: colors.textHi,
    marginTop: 2
  },
  findButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xxs,
    minHeight: 52,
    paddingHorizontal: spacing.md
  },
  findButtonDisabled: {
    opacity: 0.45
  },
  findButtonText: {
    ...type.label,
    color: colors.textHi
  },
  findButtonTextDisabled: {
    color: colors.textLo
  },
  primaryPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    height: 56,
    justifyContent: "center"
  },
  primaryPillDanger: {
    backgroundColor: colors.danger
  },
  primaryPillDisabled: {
    backgroundColor: colors.surface2
  },
  primaryPillText: {
    ...type.bodyStrong,
    color: colors.accentText
  },
  primaryPillTextDanger: {
    color: colors.textHi
  },
  primaryPillTextDisabled: {
    color: colors.textLo
  },
  checklistRow: {
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
    paddingTop: spacing.xxs
  },
  checklistItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs
  },
  checklistText: {
    ...type.small,
    color: colors.textLo
  },
  checklistTextDone: {
    color: colors.textHi
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  badgeRecording: {
    borderColor: colors.caution
  },
  badgeCompleted: {
    borderColor: colors.accent
  },
  badgeDot: {
    backgroundColor: colors.textLo,
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  badgeDotRecording: {
    backgroundColor: colors.caution
  },
  badgeDotCompleted: {
    backgroundColor: colors.accent
  },
  badgeText: {
    ...type.label,
    color: colors.textHi
  },
  badgeTextRecording: {
    color: colors.caution
  },
  badgeTextCompleted: {
    color: colors.accent
  },
  promptLine: {
    ...type.body,
    color: colors.textLo
  },
  reminderBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.caution,
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm
  },
  reminderText: {
    ...type.small,
    color: colors.textHi,
    flex: 1
  },
  jointListHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  jointListTitle: {
    ...type.title,
    color: colors.textHi
  },
  jointListMeta: {
    ...type.mono,
    color: colors.textLo
  },
  jointList: {
    gap: spacing.sm
  },
  jointCard: {
    backgroundColor: colors.surface2,
    borderColor: "transparent",
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  jointCardDone: {
    borderColor: colors.accent
  },
  jointHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  jointNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  jointName: {
    ...type.body,
    color: colors.textHi
  },
  jointPos: {
    ...type.title,
    color: colors.textHi,
    fontVariant: ["tabular-nums"]
  },
  track: {
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    height: 6,
    width: "100%"
  },
  trackCursor: {
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    height: 14,
    marginLeft: -7,
    position: "absolute",
    top: -4,
    width: 14
  },
  trackLabels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  trackLabel: {
    ...type.mono,
    color: colors.textLo
  },
  trackLabelRight: {
    textAlign: "right"
  },
  saveBlock: {
    gap: spacing.xs
  },
  savePill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.sm,
    height: 56,
    justifyContent: "center"
  },
  savePillDisabled: {
    backgroundColor: colors.surface2
  },
  savePillText: {
    ...type.bodyStrong,
    color: colors.accentText
  },
  savePillTextDisabled: {
    color: colors.textLo
  },
  saveHint: {
    ...type.small,
    color: colors.textLo,
    textAlign: "center"
  },
  completionPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  completionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  completionText: {
    ...type.body,
    color: colors.textHi,
    flex: 1
  },
  switchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  switchButtonText: {
    ...type.label,
    color: colors.textHi
  },
  pillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  }
});
