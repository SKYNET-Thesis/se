import {
  Check,
  CircleAlert,
  CircleCheck,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";

type ArmRole = "follower" | "leader";
type PhaseKind = "center" | "range";
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

type RangeState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "error"; message: string }
  | { kind: "done"; stoppedAt: string };

type ArmCalibrationState = {
  centerConfirmed: boolean;
  range: RangeByMotor;
  rangeState: RangeState;
};

type PhaseStep = {
  key: string;
  arm: ArmRole;
  phase: PhaseKind;
  index: number;
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

const ROLE_HINT: Record<ArmRole, string> = {
  follower: "Tay thực hiện chuyển động",
  leader: "Tay điều khiển / ghi lệnh"
};

const MOTOR_CONFIG: Record<MotorId, { amplitude: number; followerCenter: number; leaderCenter: number; seed: number }> = {
  shoulder_pan: { amplitude: 1420, followerCenter: 2048, leaderCenter: 2070, seed: 0 },
  shoulder_lift: { amplitude: 1180, followerCenter: 1960, leaderCenter: 1995, seed: 7 },
  elbow_flex: { amplitude: 1260, followerCenter: 2144, leaderCenter: 2110, seed: 13 },
  wrist_flex: { amplitude: 980, followerCenter: 2012, leaderCenter: 2058, seed: 19 },
  wrist_roll: { amplitude: 1540, followerCenter: 2090, leaderCenter: 2032, seed: 29 },
  gripper: { amplitude: 760, followerCenter: 1710, leaderCenter: 1764, seed: 37 }
};

const PHASE_STEPS: PhaseStep[] = [
  { key: "follower:center", arm: "follower", phase: "center", index: 0 },
  { key: "follower:range", arm: "follower", phase: "range", index: 1 },
  { key: "leader:center", arm: "leader", phase: "center", index: 2 },
  { key: "leader:range", arm: "leader", phase: "range", index: 3 }
];

const TOTAL_PHASES = PHASE_STEPS.length;
const LEADER_RANGE_ERROR =
  "Không đọc được bus servo mock của Leader. Kiểm tra nguồn, dây tín hiệu và thử lại.";

export function CalibrateScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  const [activePhaseIndex, setActivePhaseIndex] = useState(0);
  const [sampleTick, setSampleTick] = useState(0);
  const [leaderRangeRetried, setLeaderRangeRetried] = useState(false);
  const [complete, setComplete] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [arms, setArms] = useState<Record<ArmRole, ArmCalibrationState>>({
    follower: createArmCalibrationState("follower"),
    leader: createArmCalibrationState("leader")
  });

  const activeStep = PHASE_STEPS[activePhaseIndex];
  const activeArm = arms[activeStep.arm];
  const completedPhaseCount = useMemo(() => countCompletedPhases(arms), [arms]);
  const profileReady = arms.follower.rangeState.kind === "done" && arms.leader.rangeState.kind === "done";

  useEffect(() => {
    if (complete || emergencyStopped || activeStep.phase !== "range") return undefined;

    setArms((prev) => {
      const armState = prev[activeStep.arm];
      if (armState.rangeState.kind !== "idle") return prev;

      if (activeStep.arm === "leader" && !leaderRangeRetried) {
        return updateArm(prev, activeStep.arm, {
          rangeState: { kind: "error", message: LEADER_RANGE_ERROR }
        });
      }

      return updateArm(prev, activeStep.arm, { rangeState: { kind: "recording" } });
    });

    return undefined;
  }, [activeStep.arm, activeStep.phase, activeStep.key, complete, emergencyStopped, leaderRangeRetried]);

  useEffect(() => {
    if (
      complete ||
      emergencyStopped ||
      activeStep.phase !== "range" ||
      activeArm.rangeState.kind !== "recording"
    ) {
      return undefined;
    }

    const timer = setInterval(() => {
      setSampleTick((tick) => {
        const nextTick = tick + 1;
        setArms((prev) =>
          updateArm(prev, activeStep.arm, {
            range: advanceMockRange(prev[activeStep.arm].range, activeStep.arm, nextTick)
          })
        );
        return nextTick;
      });
    }, 520);

    return () => clearInterval(timer);
  }, [activeArm.rangeState.kind, activeStep.arm, activeStep.phase, complete, emergencyStopped]);

  const handleConfirmCenter = () => {
    if (emergencyStopped || activeStep.phase !== "center") return;

    setArms((prev) => updateArm(prev, activeStep.arm, { centerConfirmed: true }));
    setActivePhaseIndex((index) => Math.min(index + 1, TOTAL_PHASES - 1));
  };

  const handleRetryRange = () => {
    if (emergencyStopped || activeStep.phase !== "range") return;

    if (activeStep.arm === "leader") setLeaderRangeRetried(true);
    setArms((prev) => updateArm(prev, activeStep.arm, { rangeState: { kind: "recording" } }));
  };

  const handleStopRange = () => {
    if (emergencyStopped || activeStep.phase !== "range" || activeArm.rangeState.kind !== "recording") return;

    const stoppedAt = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    setArms((prev) => updateArm(prev, activeStep.arm, { rangeState: { kind: "done", stoppedAt } }));

    if (activeStep.arm === "follower") {
      setActivePhaseIndex(2);
      return;
    }

    setComplete(true);
  };

  const handleSaveProfile = () => {
    if (emergencyStopped || !profileReady) return;
    setProfileSaved(true);
  };

  if (complete) {
    return (
      <ScrollView
        accessibilityLabel="Màn hình tóm tắt calibrate SO-101"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <ScreenHeader
          fontsReady={fontsReady}
          meta="4/4"
          onBack={onBack}
          subtitle="Tóm tắt giới hạn count đã ghi cho Follower và Leader"
          title="Calibrate"
        />

        {emergencyStopped && <StoppedBanner fontsReady={fontsReady} />}
        <SafetyBanner fontsReady={fontsReady} />
        <ProgressRail activeIndex={TOTAL_PHASES - 1} arms={arms} />

        <View style={styles.summaryPanel}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleBlock}>
              <Text style={[styles.panelTitle, font("display", fontsReady)]}>Tóm tắt MIN/MAX</Text>
              <Text style={[styles.panelCaption, font("body", fontsReady)]}>
                Dữ liệu servo mock, đơn vị count 0-4095
              </Text>
            </View>
            <View style={styles.readyPill}>
              <CircleCheck color={colors.accentText} size={15} />
              <Text style={[styles.readyText, font("display", fontsReady)]}>Đủ 4 pha</Text>
            </View>
          </View>

          <SummaryTable arms={arms} fontsReady={fontsReady} role="follower" />
          <SummaryTable arms={arms} fontsReady={fontsReady} role="leader" />
        </View>

        {profileSaved && (
          <View style={styles.savedBanner}>
            <Check color={colors.accent} size={17} />
            <Text style={[styles.savedText, font("body", fontsReady)]}>
              Hồ sơ SO101-CAL-MOCK đã được lưu trong phiên mock.
            </Text>
          </View>
        )}

        <Pressable
          accessibilityLabel="Lưu hồ sơ calibrate"
          accessibilityRole="button"
          accessibilityState={{ disabled: emergencyStopped || !profileReady || profileSaved }}
          disabled={emergencyStopped || !profileReady || profileSaved}
          onPress={handleSaveProfile}
          style={({ pressed }) => [
            styles.primaryButton,
            (emergencyStopped || !profileReady || profileSaved) && styles.primaryButtonDisabled,
            pressed && !emergencyStopped && !profileSaved && styles.pressed
          ]}
        >
          <Save color={profileSaved ? colors.textLo : colors.accentText} size={18} />
          <Text
            style={[
              styles.primaryButtonText,
              profileSaved && styles.primaryButtonTextDisabled,
              font("display", fontsReady)
            ]}
          >
            Lưu hồ sơ calibrate
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      accessibilityLabel="Màn hình calibrate SO-101"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        meta={`${activeStep.index + 1}/4`}
        onBack={onBack}
        subtitle="LeRobot SO-101: Follower center/range, sau đó Leader center/range"
        title="Calibrate"
      />

      {emergencyStopped && <StoppedBanner fontsReady={fontsReady} />}
      <SafetyBanner fontsReady={fontsReady} />
      <ProgressRail activeIndex={activePhaseIndex} arms={arms} />

      <View style={styles.armRail}>
        {ARM_SEQUENCE.map((role) => (
          <ArmChip active={activeStep.arm === role} arms={arms} fontsReady={fontsReady} key={role} role={role} />
        ))}
      </View>

      {activeStep.phase === "center" ? (
        <CenterPhase
          arm={activeStep.arm}
          disabled={emergencyStopped}
          fontsReady={fontsReady}
          onConfirm={handleConfirmCenter}
        />
      ) : (
        <RangePhase
          arm={activeStep.arm}
          disabled={emergencyStopped}
          fontsReady={fontsReady}
          onRetry={handleRetryRange}
          onStop={handleStopRange}
          range={activeArm.range}
          rangeState={activeArm.rangeState}
          sampleTick={sampleTick}
        />
      )}

      <Text style={[styles.phaseFootnote, font("body", fontsReady)]}>
        Đã hoàn tất {completedPhaseCount}/{TOTAL_PHASES} pha. Sau khi dừng ghi tầm Follower, wizard tự chuyển sang Leader.
      </Text>
    </ScrollView>
  );
}

function CenterPhase({
  arm,
  disabled,
  fontsReady,
  onConfirm
}: {
  arm: ArmRole;
  disabled: boolean;
  fontsReady: boolean;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.phasePanel}>
      <View style={styles.phaseHeader}>
        <View style={styles.phaseTitleRow}>
          <View style={styles.phaseIcon}>
            <SlidersHorizontal color={colors.textHi} size={18} />
          </View>
          <View style={styles.phaseTitleBlock}>
            <Text style={[styles.phaseEyebrow, font("mono", fontsReady)]}>{ROLE_LABEL[arm]} · PHA 1</Text>
            <Text style={[styles.phaseTitle, font("display", fontsReady)]}>Vị trí giữa</Text>
          </View>
        </View>
        <StatePill fontsReady={fontsReady} tone="waiting" value="Chờ xác nhận" />
      </View>

      <Text style={[styles.instruction, font("body", fontsReady)]}>
        Đưa toàn bộ tay về tư thế mọi khớp ở GIỮA tầm, rồi xác nhận.
      </Text>

      <ReferencePoseSlot fontsReady={fontsReady} />

      <View style={styles.wristNotice}>
        <CircleAlert color={colors.caution} size={16} />
        <Text style={[styles.wristNoticeText, font("body", fontsReady)]}>
          Chú ý trục cổ tay (wrist): wrist_flex và wrist_roll phải ở giữa tầm, không xoắn lệch trước khi xác nhận.
        </Text>
      </View>

      <Pressable
        accessibilityLabel="Xác nhận vị trí giữa"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onConfirm}
        style={({ pressed }) => [styles.primaryButton, disabled && styles.primaryButtonDisabled, pressed && styles.pressed]}
      >
        <Check color={disabled ? colors.textLo : colors.accentText} size={18} />
        <Text
          style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled, font("display", fontsReady)]}
        >
          Xác nhận vị trí giữa
        </Text>
      </Pressable>
    </View>
  );
}

function RangePhase({
  arm,
  disabled,
  fontsReady,
  onRetry,
  onStop,
  range,
  rangeState,
  sampleTick
}: {
  arm: ArmRole;
  disabled: boolean;
  fontsReady: boolean;
  onRetry: () => void;
  onStop: () => void;
  range: RangeByMotor;
  rangeState: RangeState;
  sampleTick: number;
}) {
  const recording = rangeState.kind === "recording";

  return (
    <View style={[styles.phasePanel, rangeState.kind === "error" && styles.phasePanelDanger]}>
      <View style={styles.phaseHeader}>
        <View style={styles.phaseTitleRow}>
          <View style={styles.phaseIcon}>
            <SlidersHorizontal color={colors.textHi} size={18} />
          </View>
          <View style={styles.phaseTitleBlock}>
            <Text style={[styles.phaseEyebrow, font("mono", fontsReady)]}>{ROLE_LABEL[arm]} · PHA 2</Text>
            <Text style={[styles.phaseTitle, font("display", fontsReady)]}>Quét tầm chuyển động</Text>
          </View>
        </View>
        <StatePill fontsReady={fontsReady} tone={rangeState.kind} value={rangeStateLabel(rangeState.kind)} />
      </View>

      <Text style={[styles.instruction, font("body", fontsReady)]}>
        Di chuyển từng khớp hết tầm tới ĐIỂM CHẶN CƠ KHÍ thật (có thể lặp lại). Coi chừng kẹt dây sẽ ghi sai giới hạn.
      </Text>

      {rangeState.kind === "error" ? (
        <View style={styles.errorPanel}>
          <View style={styles.errorRow}>
            <CircleAlert color={colors.danger} size={17} />
            <Text style={[styles.errorText, font("body", fontsReady)]}>{rangeState.message}</Text>
          </View>
          <Pressable
            accessibilityLabel="Thử lại đọc servo"
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onRetry}
            style={({ pressed }) => [
              styles.secondaryButton,
              disabled && styles.secondaryButtonDisabled,
              pressed && !disabled && styles.pressed
            ]}
          >
            <RefreshCw color={disabled ? colors.textLo : colors.textHi} size={15} />
            <Text
              style={[
                styles.secondaryButtonText,
                disabled && styles.secondaryButtonTextDisabled,
                font("display", fontsReady)
              ]}
            >
              Thử lại
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <RangeTable fontsReady={fontsReady} range={range} sampleTick={sampleTick} />
          {rangeState.kind === "done" && (
            <View style={styles.savedBanner}>
              <CircleCheck color={colors.accent} size={17} />
              <Text style={[styles.savedText, font("body", fontsReady)]}>
                Đã dừng ghi tầm lúc {rangeState.stoppedAt}.
              </Text>
            </View>
          )}
          <Pressable
            accessibilityLabel="Dừng ghi tầm"
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || !recording }}
            disabled={disabled || !recording}
            onPress={onStop}
            style={({ pressed }) => [
              styles.primaryButton,
              (disabled || !recording) && styles.primaryButtonDisabled,
              pressed && recording && !disabled && styles.pressed
            ]}
          >
            <Check color={recording && !disabled ? colors.accentText : colors.textLo} size={18} />
            <Text
              style={[
                styles.primaryButtonText,
                (disabled || !recording) && styles.primaryButtonTextDisabled,
                font("display", fontsReady)
              ]}
            >
              Dừng ghi tầm
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function SafetyBanner({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.safetyBanner}>
      <TriangleAlert color={colors.caution} size={18} />
      <Text style={[styles.safetyText, font("body", fontsReady)]}>
        Chỉ tới điểm chặn cơ khí thật; calibrate sai có thể khiến tay vung mạnh — cuối quá trình tay có thể giật nhanh, giữ khu vực an toàn.
      </Text>
    </View>
  );
}

function StoppedBanner({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.stoppedBanner}>
      <ShieldAlert color={colors.danger} size={18} />
      <Text style={[styles.stoppedText, font("body", fontsReady)]}>
        Hệ thống đang E-STOP, không thể đọc hoặc lưu calibrate. Reset E-STOP ở thanh trạng thái để tiếp tục.
      </Text>
    </View>
  );
}

function ReferencePoseSlot({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View accessibilityLabel="Chỗ đặt ảnh tư thế tham chiếu" style={styles.referenceSlot}>
      <View style={styles.referenceArm}>
        <View style={styles.referenceBase} />
        <View style={styles.referenceSegmentLong} />
        <View style={styles.referenceJoint} />
        <View style={styles.referenceSegmentShort} />
        <View style={styles.referenceWrist} />
      </View>
      <View style={styles.referenceCopy}>
        <Text style={[styles.referenceTitle, font("display", fontsReady)]}>Ảnh tư thế tham chiếu</Text>
        <Text style={[styles.referenceText, font("body", fontsReady)]}>Center pose · mọi khớp ở giữa tầm</Text>
      </View>
    </View>
  );
}

function ProgressRail({
  activeIndex,
  arms
}: {
  activeIndex: number;
  arms: Record<ArmRole, ArmCalibrationState>;
}) {
  return (
    <View style={styles.progressRail} accessibilityLabel="Tiến độ calibrate 4 pha">
      {PHASE_STEPS.map((step) => {
        const done = isPhaseDone(step, arms);
        const active = step.index === activeIndex;

        return (
          <View
            key={step.key}
            style={[
              styles.progressSegment,
              done && styles.progressSegmentDone,
              active && !done && styles.progressSegmentActive
            ]}
          />
        );
      })}
    </View>
  );
}

function ArmChip({
  active,
  arms,
  fontsReady,
  role
}: {
  active: boolean;
  arms: Record<ArmRole, ArmCalibrationState>;
  fontsReady: boolean;
  role: ArmRole;
}) {
  const arm = arms[role];
  const doneCount = Number(arm.centerConfirmed) + Number(arm.rangeState.kind === "done");
  const complete = doneCount === 2;

  return (
    <View style={[styles.armChip, active && styles.armChipActive, complete && styles.armChipComplete]}>
      <View style={[styles.armDot, complete && styles.armDotDone]} />
      <View style={styles.armChipCopy}>
        <Text style={[styles.armChipTitle, active && styles.armChipTitleActive, font("display", fontsReady)]}>
          {ROLE_LABEL[role]}
        </Text>
        <Text style={[styles.armChipText, active && styles.armChipTextActive, font("body", fontsReady)]}>
          {doneCount}/2 · {ROLE_HINT[role]}
        </Text>
      </View>
    </View>
  );
}

function StatePill({
  fontsReady,
  tone,
  value
}: {
  fontsReady: boolean;
  tone: "waiting" | RangeState["kind"];
  value: string;
}) {
  const danger = tone === "error";
  const done = tone === "done";
  const recording = tone === "recording";

  return (
    <View style={[styles.statePill, danger && styles.statePillDanger, done && styles.statePillDone]}>
      <View
        style={[
          styles.stateDot,
          danger && styles.stateDotDanger,
          done && styles.stateDotDone,
          recording && styles.stateDotRecording
        ]}
      />
      <Text
        style={[
          styles.stateText,
          danger && styles.stateTextDanger,
          done && styles.stateTextDone,
          font("display", fontsReady)
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function RangeTable({
  fontsReady,
  range,
  sampleTick
}: {
  fontsReady: boolean;
  range: RangeByMotor;
  sampleTick: number;
}) {
  return (
    <View style={styles.rangeTable}>
      <View style={styles.tableTitleRow}>
        <Text style={[styles.tableTitle, font("display", fontsReady)]}>Bảng trực tiếp</Text>
        <Text style={[styles.tableMeta, font("mono", fontsReady)]}>MOCK · count 0-4095 · T{sampleTick}</Text>
      </View>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.motorHeaderCell, font("body", fontsReady)]}>Motor</Text>
        <Text style={[styles.countHeaderCell, font("mono", fontsReady)]}>MIN</Text>
        <Text style={[styles.countHeaderCell, font("mono", fontsReady)]}>POS</Text>
        <Text style={[styles.countHeaderCell, font("mono", fontsReady)]}>MAX</Text>
      </View>

      {MOTOR_IDS.map((motorId) => (
        <View key={motorId} style={styles.tableRow}>
          <Text numberOfLines={1} style={[styles.motorCell, font("mono", fontsReady)]}>
            {motorId}
          </Text>
          <Text style={[styles.countCell, font("monoStrong", fontsReady)]}>{formatCount(range[motorId].min)}</Text>
          <Text style={[styles.countCell, styles.posCell, font("monoStrong", fontsReady)]}>
            {formatCount(range[motorId].pos)}
          </Text>
          <Text style={[styles.countCell, font("monoStrong", fontsReady)]}>{formatCount(range[motorId].max)}</Text>
        </View>
      ))}
    </View>
  );
}

function SummaryTable({
  arms,
  fontsReady,
  role
}: {
  arms: Record<ArmRole, ArmCalibrationState>;
  fontsReady: boolean;
  role: ArmRole;
}) {
  return (
    <View style={styles.summaryTable}>
      <View style={styles.summaryTableHeader}>
        <Text style={[styles.summaryRole, font("display", fontsReady)]}>{ROLE_LABEL[role]}</Text>
        <Text style={[styles.summaryMeta, font("mono", fontsReady)]}>
          {arms[role].rangeState.kind === "done" ? "Đã ghi tầm" : "Chưa đủ"}
        </Text>
      </View>
      <View style={styles.summaryHeaderRow}>
        <Text style={[styles.summaryMotorHeader, font("body", fontsReady)]}>Motor</Text>
        <Text style={[styles.summaryCountHeader, font("mono", fontsReady)]}>MIN</Text>
        <Text style={[styles.summaryCountHeader, font("mono", fontsReady)]}>MAX</Text>
      </View>
      {MOTOR_IDS.map((motorId) => (
        <View key={`${role}:${motorId}`} style={styles.summaryRow}>
          <Text numberOfLines={1} style={[styles.summaryMotorCell, font("mono", fontsReady)]}>
            {motorId}
          </Text>
          <Text style={[styles.summaryCountCell, font("monoStrong", fontsReady)]}>
            {formatCount(arms[role].range[motorId].min)}
          </Text>
          <Text style={[styles.summaryCountCell, font("monoStrong", fontsReady)]}>
            {formatCount(arms[role].range[motorId].max)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function createArmCalibrationState(role: ArmRole): ArmCalibrationState {
  return {
    centerConfirmed: false,
    range: createInitialRange(role),
    rangeState: { kind: "idle" }
  };
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
  prev: Record<ArmRole, ArmCalibrationState>,
  role: ArmRole,
  patch: Partial<ArmCalibrationState>
) {
  return {
    ...prev,
    [role]: {
      ...prev[role],
      ...patch
    }
  };
}

function countCompletedPhases(arms: Record<ArmRole, ArmCalibrationState>) {
  return PHASE_STEPS.filter((step) => isPhaseDone(step, arms)).length;
}

function isPhaseDone(step: PhaseStep, arms: Record<ArmRole, ArmCalibrationState>) {
  const arm = arms[step.arm];
  return step.phase === "center" ? arm.centerConfirmed : arm.rangeState.kind === "done";
}

function rangeStateLabel(kind: RangeState["kind"]) {
  switch (kind) {
    case "idle":
      return "Chờ đọc";
    case "recording":
      return "Đang ghi tầm";
    case "error":
      return "Lỗi đọc servo";
    case "done":
      return "Đã ghi tầm";
  }
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  stoppedBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radius.card,
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
  safetyBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.caution,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  safetyText: {
    ...type.body,
    color: colors.textHi,
    flex: 1
  },
  progressRail: {
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 8
  },
  progressSegment: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.status,
    borderWidth: 1,
    flex: 1,
    height: 8
  },
  progressSegmentActive: {
    borderColor: colors.accent
  },
  progressSegmentDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  armRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  armChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexBasis: "47%",
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 58,
    minWidth: 152,
    padding: spacing.sm
  },
  armChipActive: {
    borderColor: colors.accent
  },
  armChipComplete: {
    backgroundColor: colors.surface2
  },
  armDot: {
    backgroundColor: colors.textLo,
    borderRadius: radius.status,
    height: 10,
    width: 10
  },
  armDotDone: {
    backgroundColor: colors.accent
  },
  armChipCopy: {
    flex: 1,
    minWidth: 0
  },
  armChipTitle: {
    ...type.label,
    color: colors.textHi
  },
  armChipTitleActive: {
    color: colors.accent
  },
  armChipText: {
    ...type.small,
    color: colors.textLo,
    marginTop: 2
  },
  armChipTextActive: {
    color: colors.textHi
  },
  phasePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  phasePanelDanger: {
    borderColor: colors.danger
  },
  phaseHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  phaseTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0
  },
  phaseIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  phaseTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  phaseEyebrow: {
    ...type.mono,
    color: colors.textLo
  },
  phaseTitle: {
    ...type.title,
    color: colors.textHi,
    marginTop: 2
  },
  instruction: {
    ...type.body,
    color: colors.textLo
  },
  statePill: {
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
  statePillDanger: {
    borderColor: colors.danger
  },
  statePillDone: {
    borderColor: colors.accent
  },
  stateDot: {
    backgroundColor: colors.caution,
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  stateDotDanger: {
    backgroundColor: colors.danger
  },
  stateDotDone: {
    backgroundColor: colors.accent
  },
  stateDotRecording: {
    backgroundColor: colors.accent
  },
  stateText: {
    ...type.small,
    color: colors.textHi
  },
  stateTextDanger: {
    color: colors.danger
  },
  stateTextDone: {
    color: colors.accent
  },
  referenceSlot: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 132,
    padding: spacing.md
  },
  referenceArm: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    height: 86,
    justifyContent: "center",
    width: 128
  },
  referenceBase: {
    backgroundColor: colors.border,
    borderRadius: radius.button,
    height: 28,
    width: 24
  },
  referenceSegmentLong: {
    backgroundColor: colors.textLo,
    borderRadius: radius.status,
    height: 8,
    width: 44
  },
  referenceJoint: {
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    height: 20,
    width: 20
  },
  referenceSegmentShort: {
    backgroundColor: colors.textLo,
    borderRadius: radius.status,
    height: 8,
    width: 30
  },
  referenceWrist: {
    backgroundColor: colors.caution,
    borderRadius: radius.status,
    height: 18,
    width: 10
  },
  referenceCopy: {
    flex: 1,
    minWidth: 0
  },
  referenceTitle: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  referenceText: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  wristNotice: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  wristNoticeText: {
    ...type.small,
    color: colors.textHi,
    flex: 1
  },
  rangeTable: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm
  },
  tableTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingBottom: spacing.xs
  },
  tableTitle: {
    ...type.label,
    color: colors.textHi
  },
  tableMeta: {
    ...type.mono,
    color: colors.textLo
  },
  tableHeaderRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 30,
    paddingTop: spacing.xs
  },
  motorHeaderCell: {
    ...type.small,
    color: colors.textLo,
    flex: 1.7
  },
  countHeaderCell: {
    ...type.mono,
    color: colors.textLo,
    flex: 1,
    textAlign: "right"
  },
  tableRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 32
  },
  motorCell: {
    ...type.mono,
    color: colors.textHi,
    flex: 1.7
  },
  countCell: {
    ...type.mono,
    color: colors.textHi,
    flex: 1,
    fontVariant: ["tabular-nums"],
    textAlign: "right"
  },
  posCell: {
    color: colors.accent
  },
  errorPanel: {
    backgroundColor: colors.surface2,
    borderColor: colors.danger,
    borderRadius: radius.button,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  errorRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xs
  },
  errorText: {
    ...type.small,
    color: colors.danger,
    flex: 1
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surface2
  },
  primaryButtonText: {
    ...type.label,
    color: colors.accentText
  },
  primaryButtonTextDisabled: {
    color: colors.textLo
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm
  },
  secondaryButtonDisabled: {
    opacity: 0.45
  },
  secondaryButtonText: {
    ...type.label,
    color: colors.textHi
  },
  secondaryButtonTextDisabled: {
    color: colors.textLo
  },
  savedBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  savedText: {
    ...type.small,
    color: colors.textHi,
    flex: 1
  },
  phaseFootnote: {
    ...type.small,
    color: colors.textLo,
    marginTop: -spacing.md,
    textAlign: "center"
  },
  summaryPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  summaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  summaryTitleBlock: {
    flex: 1,
    minWidth: 0
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
    flexShrink: 0,
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  readyText: {
    ...type.label,
    color: colors.accentText
  },
  summaryTable: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  summaryTableHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  summaryRole: {
    ...type.label,
    color: colors.textHi
  },
  summaryMeta: {
    ...type.mono,
    color: colors.textLo
  },
  summaryHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 28
  },
  summaryMotorHeader: {
    ...type.small,
    color: colors.textLo,
    flex: 1.7
  },
  summaryCountHeader: {
    ...type.mono,
    color: colors.textLo,
    flex: 1,
    textAlign: "right"
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 30
  },
  summaryMotorCell: {
    ...type.mono,
    color: colors.textHi,
    flex: 1.7
  },
  summaryCountCell: {
    ...type.mono,
    color: colors.textHi,
    flex: 1,
    fontVariant: ["tabular-nums"],
    textAlign: "right"
  },
  pressed: {
    opacity: 0.78
  }
});
