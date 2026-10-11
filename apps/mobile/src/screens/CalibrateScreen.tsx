import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Crosshair,
  FlaskConical,
  Move,
  ShieldAlert
} from "lucide-react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import {
  cancelRobotCalibration,
  completeRobotCalibration,
  describeRobotArm,
  getActiveArms,
  getRobotSetup,
  READINESS_BADGE_LABEL,
  RobotArmState
} from "../data/robot";
import {
  CALIBRATION_JOINTS,
  CalibrationJointState,
  JOINT_POSITION_MAX
} from "../data/calibrationTelemetry";
import { useCalibrationTelemetry } from "../hooks/useCalibrationTelemetry";
import { useRobotProviderMode, useRobotSetup, useRobotSummary } from "../hooks/useRobotSummary";
import { font } from "../theme";

type Props = {
  // Owned by App.tsx. Read only: calibrating never sets or clears it.
  emergencyStopped: boolean;
  fontsReady: boolean;
  // Leaves the flow the way it came (Connect, Robot hub, Home…).
  onBack: () => void;
  onConnect: () => void;
  // Opens straight to this arm's intro (e.g. Connect's per-arm
  // "Hiệu chỉnh"). Omitted or not in the active setup → the arm overview.
  initialArmId?: string;
};

// A requested arm only counts if the active setup has it.
function validArmId(armId: string | undefined): string | null {
  return armId && getRobotSetup().activeArmIds.includes(armId) ? armId : null;
}

// The user's place in the guided flow for the target arm. Finishing is not
// a step of its own: it is that arm's `calibrating` flag on the range step.
type Step = "intro" | "center" | "range" | "complete";

// Flow position only (1 / 3, 2 / 3, 3 / 3) — never measured progress. The
// intro is before the flow (0) and shows no indicator.
const STEP_NUMBER: Record<Step, number> = { intro: 0, center: 1, range: 2, complete: 3 };
const STEP_COUNT = 3;

// Every active arm with a finish in flight gets it invalidated.
function cancelAllCalibrations() {
  getRobotSetup().activeArmIds.forEach((armId) => cancelRobotCalibration(armId));
}

// Calibration V2, per arm. Answers: which arm, why calibrate, what do I
// physically do, when is it done, what next? A setup with one arm goes
// straight to that arm; with several, the user first picks the arm. The
// steps are a guided sequence the user confirms; finishing goes through
// completeRobotCalibration(armId), the ONLY thing that sets an arm's
// `calibrated`. The overall readiness shown here comes from the shared
// summary (the active setup's aggregate), so this screen never shows a
// local-only "Ready". Nothing here arms or moves the robot, and E-STOP is
// never touched.
export function CalibrateScreen({ emergencyStopped, fontsReady, initialArmId, onBack, onConnect }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const setup = useRobotSetup();
  const robot = useRobotSummary({ emergencyStopped });
  const activeArms = useMemo(() => getActiveArms(setup), [setup]);
  const multiArm = activeArms.length > 1;
  const [selectedArmId, setSelectedArmId] = useState<string | null>(() => validArmId(initialArmId));
  const [step, setStep] = useState<Step>("intro");
  const [finishFailed, setFinishFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // One source for both disclosures: the active provider's mode.
  const prototype = useRobotProviderMode() === "prototype";
  const simulatedJoints = prototype;
  const isFocused = useIsFocused();

  // The arm being calibrated. One-arm setups skip the picker.
  const targetId = multiArm ? selectedArmId : (activeArms[0]?.id ?? null);
  const arm = activeArms.find((candidate) => candidate.id === targetId) ?? null;
  const targetRef = useRef(targetId);
  targetRef.current = targetId;

  const connected = arm?.connected ?? false;
  const finishing = arm?.calibrating ?? false;
  const readiness = robot?.readiness;
  const inFlow = arm !== null && (step === "center" || step === "range");

  // The joint monitor streams the TARGET arm only, while a guided step is
  // on screen and that arm is connected. Reading positions never moves the
  // robot, so it keeps streaming under E-STOP — the user may still be
  // holding the arm.
  const joints = useCalibrationTelemetry(
    arm && connected && isFocused ? arm.id : null,
    step === "center" || step === "range" ? step : null
  );

  // Leaving the screen abandons any calibration still being finished: its
  // late result is ignored and `calibrated` stays as it was — the same
  // stale-result rule as disconnect and cancel. Blur covers switching tabs
  // (the screen stays mounted); the cleanup also runs on unmount.
  useFocusEffect(useCallback(() => cancelAllCalibrations, []));

  // Losing the target arm (disconnected, or no longer in the setup) ends its
  // flow: the shared state has already invalidated its finishing attempt.
  useEffect(() => {
    if (connected) return;
    setStep("intro");
    setFinishFailed(false);
  }, [connected, targetId]);

  const handleSelectArm = (armId: string) => {
    setSelectedArmId(armId);
    setStep("intro");
    setFinishFailed(false);
  };

  // A new requested arm on an already-mounted screen (route params changed)
  // opens that arm's intro. It never starts a step by itself.
  useEffect(() => {
    const requested = validArmId(initialArmId);
    if (!requested) return;
    setSelectedArmId(requested);
    setStep("intro");
    setFinishFailed(false);
  }, [initialArmId]);

  const handleShowArms = () => {
    setSelectedArmId(null);
    setStep("intro");
    setFinishFailed(false);
  };

  const handleStart = () => {
    if (!arm || !connected || emergencyStopped) return;
    setFinishFailed(false);
    setStep("center");
  };

  const handleCenterDone = () => {
    if (!arm || !connected || emergencyStopped) return;
    setStep("range");
  };

  const handleFinish = () => {
    if (!arm || !connected || emergencyStopped || finishing) return;
    const armId = arm.id;
    setFinishFailed(false);
    void completeRobotCalibration(armId).then((result) => {
      // A result for an arm the screen no longer targets changes nothing here.
      if (targetRef.current !== armId) return;
      if (result === "calibrated") setStep("complete");
      else if (result === "failed") setFinishFailed(true);
      // "offline": the connection effect returns to the intro.
      // "cancelled": the user stays on the range step.
    });
  };

  const handleCancelFinish = () => {
    if (arm) cancelRobotCalibration(arm.id);
  };

  const handleCancelFlow = () => {
    handleCancelFinish();
    setFinishFailed(false);
    setStep("intro");
  };

  // Explicit exit: invalidate an in-flight finish before navigating away.
  const handleBack = () => {
    cancelAllCalibrations();
    onBack();
  };

  // After one arm: the next active arm that still needs calibration. It is
  // only offered — the user opens it and starts it deliberately.
  const remaining = activeArms.filter((candidate) => !candidate.calibrated);
  const nextArm = multiArm ? (remaining.find((candidate) => candidate.id !== arm?.id) ?? null) : null;

  const stoppedAlert = emergencyStopped && connected && step !== "complete";

  return (
    <ScrollView
      accessibilityLabel="Hiệu chỉnh robot"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={handleBack}
        subtitle="Giúp robot hiểu đúng vị trí và phạm vi chuyển động."
        title="Hiệu chỉnh"
      />

      {!arm && (
        <>
          {emergencyStopped && robot && (
            <StoppedAlert colors={colors} fontsReady={fontsReady} message={robot.message} styles={styles} />
          )}
          {activeArms.length > 0 ? (
            <ArmOverview arms={activeArms} colors={colors} fontsReady={fontsReady} onSelect={handleSelectArm} styles={styles} />
          ) : (
            <View style={styles.action}>
              <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary">
                Chưa có tay robot nào trong hệ thống.
              </SkyText>
            </View>
          )}
          {prototype && <PrototypeNote colors={colors} fontsReady={fontsReady} styles={styles} />}
        </>
      )}

      {arm && step === "intro" && (
        <>
          <ArmCard
            arm={arm}
            colors={colors}
            fontsReady={fontsReady}
            prototype={prototype}
            robot={multiArm ? null : robot}
            styles={styles}
          />

          {stoppedAlert && robot && <StoppedAlert colors={colors} fontsReady={fontsReady} message={robot.message} styles={styles} />}

          {!connected ? (
            <View style={styles.action}>
              <SkyButton
                accessibilityHint="Mở màn hình kết nối robot"
                accessibilityLabel="Kết nối robot"
                fontsReady={fontsReady}
                onPress={onConnect}
              >
                Kết nối robot
              </SkyButton>
              <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
                {multiArm ? `${arm.name} chưa được kết nối.` : "Robot chưa được kết nối."} Kết nối trước rồi quay lại hiệu chỉnh.
              </SkyText>
            </View>
          ) : (
            <View style={styles.action}>
              <SkyButton
                accessibilityHint={
                  arm.calibrated
                    ? `Bắt đầu lại hiệu chỉnh cho ${arm.name}. Hiệu chỉnh hiện tại được giữ đến khi bạn hoàn tất.`
                    : `Bắt đầu hiệu chỉnh từng bước cho ${arm.name}`
                }
                accessibilityLabel={arm.calibrated ? "Hiệu chỉnh lại" : "Bắt đầu hiệu chỉnh"}
                disabled={emergencyStopped}
                fontsReady={fontsReady}
                onPress={handleStart}
              >
                {arm.calibrated ? "Hiệu chỉnh lại" : "Bắt đầu hiệu chỉnh"}
              </SkyButton>
              {arm.calibrated && !emergencyStopped && (
                <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
                  Hiệu chỉnh hiện tại vẫn được giữ cho đến khi bạn hoàn tất lần mới.
                </SkyText>
              )}
            </View>
          )}

          {multiArm && (
            <SkyButton
              accessibilityLabel="Chọn tay khác"
              fontsReady={fontsReady}
              onPress={handleShowArms}
              style={styles.secondaryAction}
              variant="secondary"
            >
              Chọn tay khác
            </SkyButton>
          )}

          {connected && <Overview colors={colors} fontsReady={fontsReady} styles={styles} />}
        </>
      )}

      {arm && inFlow && (
        <>
          <TargetArm arm={arm} colors={colors} fontsReady={fontsReady} styles={styles} />
          <StepIndicator current={STEP_NUMBER[step]} fontsReady={fontsReady} styles={styles} />

          {step === "center" ? (
            <InstructionCard
              bullets={[
                "Nhẹ nhàng đưa từng khớp về khoảng giữa phạm vi của nó.",
                "Giữ vùng làm việc quanh robot trống.",
                "Dùng tay điều khiển (Leader)? Đưa tay đó về cùng tư thế."
              ]}
              colors={colors}
              fontsReady={fontsReady}
              icon={Crosshair}
              styles={styles}
              title="Đưa robot về vị trí giữa"
            />
          ) : (
            <InstructionCard
              bullets={[
                "Lần lượt di chuyển từng khớp thật chậm đến hết phạm vi an toàn.",
                "Không dùng lực ép khớp vượt qua điểm dừng.",
                "Giữ tay và đồ vật xung quanh tránh xa robot."
              ]}
              colors={colors}
              fontsReady={fontsReady}
              icon={Move}
              styles={styles}
              title="Di chuyển các khớp qua toàn bộ phạm vi"
            />
          )}

          {stoppedAlert && robot && (
            <StoppedAlert
              colors={colors}
              fontsReady={fontsReady}
              message="Tạm dừng các bước cần di chuyển robot. Nhấn Reset cạnh nút E-STOP khi đã an toàn để tiếp tục."
              styles={styles}
            />
          )}

          <JointMonitor
            armName={arm.name}
            colors={colors}
            fontsReady={fontsReady}
            joints={joints}
            showRange={step === "range"}
            simulated={simulatedJoints}
            styles={styles}
          />

          <View style={styles.action}>
            {step === "center" ? (
              <SkyButton
                accessibilityHint="Xác nhận robot đã ở vị trí giữa và sang bước tiếp theo"
                accessibilityLabel="Đã đưa về vị trí giữa"
                disabled={emergencyStopped}
                fontsReady={fontsReady}
                onPress={handleCenterDone}
              >
                Đã đưa về vị trí giữa
              </SkyButton>
            ) : (
              <SkyButton
                accessibilityHint={`Xác nhận đã di chuyển hết phạm vi và hoàn tất hiệu chỉnh cho ${arm.name}`}
                accessibilityLabel={finishing ? "Đang hoàn tất hiệu chỉnh" : "Tôi đã hoàn tất"}
                disabled={emergencyStopped && !finishing}
                fontsReady={fontsReady}
                loading={finishing}
                onPress={handleFinish}
              >
                {finishing ? "Đang hoàn tất hiệu chỉnh…" : "Tôi đã hoàn tất"}
              </SkyButton>
            )}

            {finishFailed && (
              <SkyText accessibilityLiveRegion="polite" fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
                Chưa hoàn tất được hiệu chỉnh. Kiểm tra robot rồi thử lại.
              </SkyText>
            )}

            <SkyButton
              accessibilityLabel={finishing ? "Hủy hoàn tất hiệu chỉnh" : step === "center" ? "Hủy hiệu chỉnh" : "Quay lại bước trước"}
              fontsReady={fontsReady}
              onPress={finishing ? handleCancelFinish : step === "center" ? handleCancelFlow : () => setStep("center")}
              style={styles.secondaryAction}
              variant="secondary"
            >
              {finishing ? "Hủy" : step === "center" ? "Hủy hiệu chỉnh" : "Quay lại"}
            </SkyButton>
          </View>
        </>
      )}

      {arm && step === "complete" && (
        <>
          <TargetArm arm={arm} colors={colors} fontsReady={fontsReady} styles={styles} />
          <StepIndicator current={STEP_NUMBER.complete} fontsReady={fontsReady} styles={styles} />
          <Complete
            arm={arm}
            colors={colors}
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            prototype={prototype}
            readiness={readiness}
            remaining={remaining.length}
            robot={robot}
            styles={styles}
          />
          <View style={styles.action}>
            {nextArm ? (
              <>
                {/* Opens the next arm's intro — it never starts by itself. */}
                <SkyButton
                  accessibilityHint={`Mở hiệu chỉnh cho ${nextArm.name}. Bạn sẽ bắt đầu khi đã sẵn sàng.`}
                  accessibilityLabel={`Hiệu chỉnh tay tiếp theo: ${nextArm.name}`}
                  fontsReady={fontsReady}
                  onPress={() => handleSelectArm(nextArm.id)}
                >
                  Hiệu chỉnh tay tiếp theo
                </SkyButton>
                <SkyButton
                  accessibilityHint="Quay lại danh sách tay robot"
                  accessibilityLabel="Quay lại"
                  fontsReady={fontsReady}
                  onPress={handleShowArms}
                  style={styles.secondaryAction}
                  variant="secondary"
                >
                  Quay lại
                </SkyButton>
              </>
            ) : (
              // Back where the user came from — never straight into control.
              <SkyButton accessibilityLabel="Tiếp tục" fontsReady={fontsReady} onPress={handleBack}>
                Tiếp tục
              </SkyButton>
            )}
          </View>
        </>
      )}

      <TechnicalDetails
        colors={colors}
        fontsReady={fontsReady}
        onToggle={() => setDetailsOpen((open) => !open)}
        open={detailsOpen}
        simulated={simulatedJoints}
        styles={styles}
      />
    </ScrollView>
  );
}

function connectionLabel(arm: RobotArmState) {
  return arm.connected ? "Đã kết nối" : "Chưa kết nối";
}

function calibrationLabel(arm: RobotArmState) {
  return arm.calibrated ? "Đã hiệu chỉnh" : "Cần hiệu chỉnh";
}

// Multi-arm setups: one compact row per active arm — its name, its role,
// and whether it is connected and calibrated. Tapping opens that arm's
// calibration intro; nothing starts until the user does.
function ArmOverview({
  arms,
  colors,
  fontsReady,
  onSelect,
  styles
}: {
  arms: RobotArmState[];
  colors: SkyNexColors;
  fontsReady: boolean;
  onSelect: (armId: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.armList}>
      <View style={styles.armListHeading}>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
          {arms.length} tay trong hệ thống
        </SkyText>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          Chọn tay bạn muốn hiệu chỉnh. Mỗi tay được hiệu chỉnh riêng.
        </SkyText>
      </View>
      {arms.map((arm) => (
        <Pressable
          accessibilityHint="Mở hiệu chỉnh cho tay này"
          accessibilityLabel={`${arm.name}, ${describeRobotArm(arm)}, ${connectionLabel(arm)}, ${calibrationLabel(arm)}`}
          accessibilityRole="button"
          key={arm.id}
          onPress={() => onSelect(arm.id)}
          style={({ pressed }) => [styles.armRow, pressed && styles.pressed]}
        >
          <View style={styles.armRowIcon}>
            <Bot color={colors.textPrimary} size={22} strokeWidth={1.75} />
          </View>
          <View style={styles.armRowText}>
            <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
              {arm.name}
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {describeRobotArm(arm)}
            </SkyText>
            <View style={styles.armRowStatus}>
              <StatusBadge
                fontsReady={fontsReady}
                label={calibrationLabel(arm)}
                status={!arm.connected ? "offline" : arm.calibrated ? "ready" : "warning"}
              />
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                {connectionLabel(arm)}
              </SkyText>
            </View>
          </View>
          <ChevronRight color={colors.textSecondary} size={18} />
        </Pressable>
      ))}
    </View>
  );
}

// The selected arm's identity, connection and calibration. In a one-arm
// setup the arm IS the robot, so the shared readiness badge is shown too;
// with several arms it would describe the whole setup, so it isn't.
function ArmCard({
  arm,
  colors,
  fontsReady,
  prototype,
  robot,
  styles
}: {
  arm: RobotArmState;
  colors: SkyNexColors;
  fontsReady: boolean;
  prototype: boolean;
  robot: ReturnType<typeof useRobotSummary>;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <SkyCard style={styles.card}>
      <View style={styles.identity}>
        <View style={styles.robotIcon}>
          <Bot color={colors.textPrimary} size={26} strokeWidth={1.75} />
        </View>
        <View style={styles.identityText}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
            {arm.name}
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {describeRobotArm(arm)}
          </SkyText>
        </View>
      </View>

      {robot && (
        <StatusBadge
          accessibilityLiveRegion="polite"
          fontsReady={fontsReady}
          label={robot.readiness === "offline" ? "Chưa kết nối" : READINESS_BADGE_LABEL[robot.readiness]}
          status={robot.status}
        />
      )}

      <View style={styles.facts}>
        <View accessibilityLabel={`Kết nối: ${connectionLabel(arm)}`} accessible style={styles.factItem}>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Kết nối
          </SkyText>
          <SkyText fontsReady={fontsReady} variant="cardTitle">
            {connectionLabel(arm)}
          </SkyText>
        </View>
        <View style={styles.factDivider} />
        <View accessibilityLabel={`Hiệu chỉnh: ${arm.calibrated ? "Đã hiệu chỉnh" : "Chưa hiệu chỉnh"}`} accessible style={styles.factItem}>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Hiệu chỉnh
          </SkyText>
          <SkyText fontsReady={fontsReady} variant="cardTitle">
            {arm.calibrated ? "Đã hiệu chỉnh" : "Chưa hiệu chỉnh"}
          </SkyText>
        </View>
      </View>

      {prototype && <PrototypeNote colors={colors} fontsReady={fontsReady} styles={styles} />}
    </SkyCard>
  );
}

// Which arm the steps apply to — shown above every step so the user never
// calibrates the wrong arm.
function TargetArm({
  arm,
  colors,
  fontsReady,
  styles
}: {
  arm: RobotArmState;
  colors: SkyNexColors;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View accessibilityLabel={`Đang hiệu chỉnh ${arm.name}, ${describeRobotArm(arm)}`} accessible style={styles.target}>
      <View style={styles.targetIcon}>
        <Bot color={colors.textPrimary} size={20} strokeWidth={1.75} />
      </View>
      <View style={styles.flex}>
        <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
          {arm.name}
        </SkyText>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          {describeRobotArm(arm)}
        </SkyText>
      </View>
    </View>
  );
}

// What the user is about to do — so the flow holds no surprises.
function Overview({
  colors,
  fontsReady,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const items = ["Đưa robot về vị trí giữa", "Di chuyển các khớp qua toàn bộ phạm vi", "Hoàn tất"];
  return (
    <View style={styles.overview}>
      <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
        Bạn sẽ làm
      </SkyText>
      {items.map((item, index) => (
        <View key={item} style={styles.overviewRow}>
          <View style={[styles.overviewNumber, { borderColor: colors.border }]}>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {index + 1}
            </SkyText>
          </View>
          <SkyText fontsReady={fontsReady} style={styles.flex}>
            {item}
          </SkyText>
        </View>
      ))}
    </View>
  );
}

// Flow position, not calibration progress.
function StepIndicator({
  current,
  fontsReady,
  styles
}: {
  current: number;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View accessibilityLabel={`Bước ${current} trên ${STEP_COUNT}`} accessible style={styles.stepIndicator}>
      <View style={styles.stepDots}>
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <View key={index} style={[styles.stepDot, index < current && styles.stepDotDone]} />
        ))}
      </View>
      <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
        Bước {current} / {STEP_COUNT}
      </SkyText>
    </View>
  );
}

function InstructionCard({
  bullets,
  colors,
  fontsReady,
  icon: Icon,
  styles,
  title
}: {
  bullets: string[];
  colors: SkyNexColors;
  fontsReady: boolean;
  icon: typeof Crosshair;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <SkyCard style={styles.card}>
      <View style={styles.instructionIcon}>
        <Icon color={colors.textPrimary} size={28} strokeWidth={1.75} />
      </View>
      <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
        {title}
      </SkyText>
      <View style={styles.bullets}>
        {bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: colors.textSecondary }]} />
            <SkyText fontsReady={fontsReady} style={styles.flex}>
              {bullet}
            </SkyText>
          </View>
        ))}
      </View>
    </SkyCard>
  );
}

// Done: this arm's calibration is recorded, but the robot's overall state
// comes from the shared readiness of the whole setup — "Sẵn sàng" only if
// every required arm really is ready, and the E-STOP state stays visible if
// the robot is stopped.
function Complete({
  arm,
  colors,
  emergencyStopped,
  fontsReady,
  prototype,
  readiness,
  remaining,
  robot,
  styles
}: {
  arm: RobotArmState;
  colors: SkyNexColors;
  emergencyStopped: boolean;
  fontsReady: boolean;
  prototype: boolean;
  readiness: string | undefined;
  remaining: number;
  robot: ReturnType<typeof useRobotSummary>;
  styles: ReturnType<typeof createStyles>;
}) {
  const stopped = emergencyStopped || readiness === "stopped";
  return (
    <>
      <SkyCard style={styles.card}>
        <View style={styles.instructionIcon}>
          <CircleCheck color={readiness === "ready" ? colors.statusReady : colors.textPrimary} size={28} strokeWidth={1.75} />
        </View>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
          {arm.name} đã được hiệu chỉnh
        </SkyText>
        {robot && (
          <StatusBadge
            accessibilityLiveRegion="polite"
            fontsReady={fontsReady}
            label={READINESS_BADGE_LABEL[robot.readiness]}
            status={robot.status}
          />
        )}
        {readiness === "ready" && (
          <SkyText fontsReady={fontsReady} tone="secondary">
            Robot đã sẵn sàng. Bạn vẫn cần bật điều khiển trước khi robot di chuyển.
          </SkyText>
        )}
        {remaining > 0 && (
          <SkyText fontsReady={fontsReady} tone="secondary">
            Còn {remaining} tay cần hiệu chỉnh trước khi robot sẵn sàng.
          </SkyText>
        )}
        {prototype && (
          <View style={styles.modeNote}>
            <FlaskConical color={colors.textSecondary} size={14} />
            <SkyText fontsReady={fontsReady} style={styles.flex} tone="secondary" variant="caption">
              Quy trình hiện được mô phỏng, chưa ghi dữ liệu vào robot thật.
            </SkyText>
          </View>
        )}
      </SkyCard>
      {stopped && robot && (
        <StoppedAlert
          colors={colors}
          fontsReady={fontsReady}
          message={`Hiệu chỉnh đã được lưu, nhưng robot vẫn đang dừng. ${robot.message}`}
          styles={styles}
        />
      )}
    </>
  );
}

// E-STOP explained, never cleared here — Reset lives beside the floating
// E-STOP only.
function StoppedAlert({
  colors,
  fontsReady,
  message,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  message: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View accessibilityRole="alert" style={styles.safety}>
      <ShieldAlert color={colors.statusDanger} size={18} />
      <View style={styles.safetyText}>
        <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
          Đã dừng khẩn cấp
        </SkyText>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          {message}
        </SkyText>
      </View>
    </View>
  );
}

function PrototypeNote({
  colors,
  fontsReady,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View
      accessibilityLabel="Chế độ thử nghiệm: quy trình hiện được mô phỏng, chưa ghi dữ liệu vào robot thật."
      accessible
      style={styles.modeNote}
    >
      <FlaskConical color={colors.textSecondary} size={14} />
      <SkyText fontsReady={fontsReady} style={styles.flex} tone="secondary" variant="caption">
        Chế độ thử nghiệm · quy trình được mô phỏng, chưa ghi dữ liệu vào robot thật.
      </SkyText>
    </View>
  );
}

// The live joint monitor: the user watches it while physically moving the
// arm. Step 1 shows where each joint is relative to mid-range; step 2 adds
// the range observed so far in this attempt. It reports positions only — no
// per-joint "done" or quality verdict, which needs real hardware rules.
function JointMonitor({
  armName,
  colors,
  fontsReady,
  joints,
  showRange,
  simulated,
  styles
}: {
  armName: string;
  colors: SkyNexColors;
  fontsReady: boolean;
  joints: CalibrationJointState[] | null;
  showRange: boolean;
  simulated: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <SkyCard style={styles.card}>
      <View style={styles.monitorHeading}>
        <View accessibilityLabel="Đang cập nhật trực tiếp" accessible style={styles.liveTag}>
          <View style={[styles.liveDot, { backgroundColor: colors.statusReady }]} />
          <SkyText fontsReady={fontsReady} style={[styles.liveText, font("mono", fontsReady)]} tone="secondary">
            LIVE
          </SkyText>
        </View>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
          Dữ liệu khớp · {armName}
        </SkyText>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          {showRange
            ? "Dải đậm là phạm vi đã ghi nhận trong bước này. Theo dõi khi bạn di chuyển từng khớp."
            : "Vạch giữa là vị trí giữa. Theo dõi khi bạn đưa từng khớp về đó."}
        </SkyText>
      </View>

      {simulated && (
        <View accessibilityLabel="Dữ liệu mô phỏng, chưa đọc trực tiếp từ robot." accessible style={styles.modeNote}>
          <FlaskConical color={colors.textSecondary} size={14} />
          <SkyText fontsReady={fontsReady} style={styles.flex} tone="secondary" variant="caption">
            Dữ liệu mô phỏng · chưa đọc trực tiếp từ robot
          </SkyText>
        </View>
      )}

      {joints ? (
        <View style={styles.jointList}>
          {joints.map((joint, index) => (
            <JointRow
              colors={colors}
              first={index === 0}
              fontsReady={fontsReady}
              joint={joint}
              key={joint.id}
              showRange={showRange}
              styles={styles}
            />
          ))}
        </View>
      ) : (
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          Đang chờ dữ liệu khớp…
        </SkyText>
      )}
    </SkyCard>
  );
}

function positionPercent(value: number): `${number}%` {
  return `${(Math.max(0, Math.min(JOINT_POSITION_MAX, value)) / JOINT_POSITION_MAX) * 100}%`;
}

// One joint: name and current value, a position track, and (range step)
// the observed min / max beneath it.
function JointRow({
  colors,
  first,
  fontsReady,
  joint,
  showRange,
  styles
}: {
  colors: SkyNexColors;
  first: boolean;
  fontsReady: boolean;
  joint: CalibrationJointState;
  showRange: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const mono = font("mono", fontsReady);
  const min = joint.minObserved;
  const max = joint.maxObserved;
  const range = showRange && min !== null && max !== null ? { min, max } : null;
  return (
    <View
      accessibilityLabel={`${joint.label}: vị trí ${joint.current}${range ? `, thấp nhất ${range.min}, cao nhất ${range.max}` : ""}`}
      accessible
      style={[styles.jointRow, !first && styles.jointRowDivider]}
    >
      <View style={styles.jointHeader}>
        <SkyText fontsReady={fontsReady} style={styles.flex}>
          {joint.label}
        </SkyText>
        <SkyText fontsReady={fontsReady} style={[styles.jointValue, mono]}>
          {joint.current}
        </SkyText>
      </View>

      <View style={styles.track}>
        <View style={[styles.trackLine, { backgroundColor: colors.border }]} />
        {range ? (
          <View
            style={[
              styles.trackBand,
              { backgroundColor: colors.accentInk, left: positionPercent(range.min), width: positionPercent(range.max - range.min) }
            ]}
          />
        ) : (
          <View style={[styles.trackCenter, { backgroundColor: colors.textSecondary }]} />
        )}
        <View
          style={[
            styles.trackDot,
            { backgroundColor: colors.accentInk, borderColor: colors.surface, left: positionPercent(joint.current) }
          ]}
        />
      </View>

      {range && (
        <View style={styles.jointRange}>
          <SkyText fontsReady={fontsReady} style={[styles.jointRangeValue, mono]} tone="secondary">
            {range.min}
          </SkyText>
          <SkyText fontsReady={fontsReady} style={[styles.jointRangeValue, mono]} tone="secondary">
            {range.max}
          </SkyText>
        </View>
      )}
    </View>
  );
}

// Collapsed by default and secondary — the joints themselves stay visible
// in the monitor. Here: raw joint ids for matching to hardware, and where
// the readings come from.
function TechnicalDetails({
  colors,
  fontsReady,
  onToggle,
  open,
  simulated,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onToggle: () => void;
  open: boolean;
  simulated: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const Chevron = open ? ChevronUp : ChevronDown;
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
            Các khớp được hiệu chỉnh
          </SkyText>
        </View>
        <Chevron color={colors.textSecondary} size={18} />
      </Pressable>

      {open && (
        <View style={styles.detailsBody}>
          {CALIBRATION_JOINTS.map((joint) => (
            <View key={joint.id} style={styles.detailsRow}>
              <SkyText fontsReady={fontsReady}>{joint.label}</SkyText>
              <SkyText fontsReady={fontsReady} style={[styles.mono, font("mono", fontsReady)]} tone="secondary">
                {joint.id}
              </SkyText>
            </View>
          ))}
          <View style={styles.detailsRow}>
            <SkyText fontsReady={fontsReady}>Nguồn dữ liệu khớp</SkyText>
            <SkyText fontsReady={fontsReady} style={[styles.mono, font("mono", fontsReady)]} tone="secondary">
              {simulated ? "prototype" : "hardware"}
            </SkyText>
          </View>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {simulated
              ? `Vị trí khớp tính theo bước encoder (0–${JOINT_POSITION_MAX}). Ở chế độ thử nghiệm, vị trí do ứng dụng mô phỏng, chưa đọc từ servo, và phạm vi ghi nhận không được lưu vào robot.`
              : `Vị trí khớp tính theo bước encoder (0–${JOINT_POSITION_MAX}).`}
          </SkyText>
        </View>
      )}
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
      paddingBottom: space.xxxl,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    flex: {
      flex: 1
    },
    centered: {
      textAlign: "center"
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
    identityText: {
      flex: 1,
      gap: 2
    },
    facts: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingTop: space.md
    },
    factItem: {
      flex: 1,
      gap: 2
    },
    factDivider: {
      backgroundColor: colors.border,
      marginHorizontal: space.md,
      width: StyleSheet.hairlineWidth
    },
    armList: {
      gap: space.sm
    },
    armListHeading: {
      gap: space.xxs,
      marginBottom: space.xxs
    },
    // Compact consumer row, not a table: at least 72px tall so the whole
    // row is an easy touch target.
    armRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: corner.card,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: space.md,
      minHeight: 72,
      paddingHorizontal: space.md,
      paddingVertical: space.sm
    },
    armRowIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    armRowText: {
      flex: 1,
      gap: 2
    },
    armRowStatus: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.xs,
      marginTop: space.xxs
    },
    target: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm
    },
    targetIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    modeNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.xs
    },
    action: {
      gap: space.sm
    },
    // Compact and centred: subordinate to the primary action, and clear of
    // the floating E-STOP's edge column.
    secondaryAction: {
      alignSelf: "center",
      minWidth: 160
    },
    overview: {
      gap: space.sm
    },
    overviewRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm
    },
    overviewNumber: {
      alignItems: "center",
      borderRadius: corner.pill,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28
    },
    stepIndicator: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm
    },
    stepDots: {
      flexDirection: "row",
      gap: space.xxs
    },
    stepDot: {
      backgroundColor: colors.border,
      borderRadius: corner.pill,
      height: 6,
      width: 20
    },
    stepDotDone: {
      backgroundColor: colors.accentInk
    },
    instructionIcon: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.card,
      height: 56,
      justifyContent: "center",
      width: 56
    },
    bullets: {
      gap: space.sm
    },
    bulletRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.sm
    },
    bulletDot: {
      borderRadius: corner.pill,
      height: 6,
      marginTop: 9,
      width: 6
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
      justifyContent: "space-between"
    },
    mono: {
      fontSize: 13
    },
    monitorHeading: {
      gap: space.xxs
    },
    liveTag: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xxs
    },
    liveDot: {
      borderRadius: corner.pill,
      height: 6,
      width: 6
    },
    liveText: {
      fontSize: 11,
      letterSpacing: 1
    },
    jointList: {
      gap: space.sm
    },
    jointRow: {
      gap: space.xxs
    },
    jointRowDivider: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: space.sm
    },
    jointHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: space.sm
    },
    jointValue: {
      fontSize: 15,
      fontVariant: ["tabular-nums"]
    },
    // 14px tall so the 12px dot sits on the 2px line without clipping.
    track: {
      height: 14,
      justifyContent: "center"
    },
    trackLine: {
      borderRadius: corner.pill,
      height: 2,
      left: 0,
      position: "absolute",
      right: 0
    },
    trackBand: {
      borderRadius: corner.pill,
      height: 4,
      opacity: 0.45,
      position: "absolute"
    },
    trackCenter: {
      height: 10,
      left: "50%",
      marginLeft: -0.5,
      position: "absolute",
      width: 1
    },
    trackDot: {
      borderRadius: corner.pill,
      borderWidth: 2,
      height: 12,
      marginLeft: -6,
      position: "absolute",
      width: 12
    },
    jointRange: {
      flexDirection: "row",
      justifyContent: "space-between"
    },
    jointRangeValue: {
      fontSize: 12,
      fontVariant: ["tabular-nums"]
    }
  });
}
