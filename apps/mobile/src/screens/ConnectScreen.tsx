import { Bot, CircleAlert, CircleCheck, FlaskConical, Pencil, ShieldAlert } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkySection, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import {
  cancelRobotArmConnect,
  connectRobot,
  connectRobotArm,
  describeRobotArm,
  disconnectRobot,
  disconnectRobotArm,
  getActiveArms,
  pickArmToCalibrate,
  READINESS_BADGE_LABEL,
  renameRobotArm,
  RobotArmState
} from "../data/robot";
import { useRobotLink, useRobotProviderMode, useRobotSetup, useRobotSummary } from "../hooks/useRobotSummary";
import { font } from "../theme";

type Props = {
  // Owned by App.tsx. Read only: connecting, disconnecting or leaving this
  // screen never changes it.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
  // Calibration for the whole setup (Calibrate picks the arm).
  onCalibrate: () => void;
  // Calibration with one arm preselected.
  onCalibrateArm: (armId: string) => void;
  onOpenControl: () => void;
  // Optional: an arm to bring into view and emphasise (e.g. from Status's
  // per-arm "Kết nối"). Ignored if it isn't in the active setup.
  focusArmId?: string;
};

// Only what is true before connecting — no network or port requirements
// the app doesn't actually have.
const PRECHECKS = [
  "Robot đã được cấp nguồn",
  "Các tay robot đang đứng yên",
  "Vùng hoạt động quanh robot trống và an toàn"
];

// A label, not an identity: long enough for "follower_right_lab_2", short
// enough to stay readable in a row.
const ARM_NAME_MAX = 40;

// Clears the floating E-STOP (bottom-left by default, 58pt + caption) so
// the last action can always be scrolled above it.
const ESTOP_CLEARANCE = 96;

// Connect Robot V2, multi-arm. Answers: how many arms make up my setup,
// which are connected and calibrated, which is connecting, and what do I
// do next? Each arm connects and disconnects on its own through the shared
// per-arm actions (data/robot.ts); the summary and the one primary action
// follow the shared AGGREGATE readiness — the same one every other screen
// shows. Connected ≠ ready: calibration and E-STOP still gate motion.
export function ConnectScreen({
  emergencyStopped,
  focusArmId,
  fontsReady,
  onBack,
  onCalibrate,
  onCalibrateArm,
  onOpenControl
}: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const link = useRobotLink();
  const setup = useRobotSetup();
  const robot = useRobotSummary({ emergencyStopped });
  const arms = useMemo(() => getActiveArms(setup), [setup]);
  const [connectAllFailed, setConnectAllFailed] = useState(false);
  // Arms whose own last connect attempt failed; cleared on the next try.
  const [failedArmIds, setFailedArmIds] = useState<readonly string[]>([]);
  const [renamingArmId, setRenamingArmId] = useState<string | null>(null);
  const prototype = useRobotProviderMode() === "prototype";

  const multiArm = arms.length > 1;
  const connectedCount = arms.filter((arm) => arm.connected).length;
  const uncalibratedCount = arms.filter((arm) => !arm.calibrated).length;
  const readiness = robot?.readiness;
  const renamingArm = renamingArmId ? (setup.arms[renamingArmId] ?? null) : null;

  const markFailed = (armId: string, failed: boolean) =>
    setFailedArmIds((ids) => (failed ? (ids.includes(armId) ? ids : [...ids, armId]) : ids.filter((id) => id !== armId)));

  const handleConnectArm = (armId: string) => {
    markFailed(armId, false);
    setConnectAllFailed(false);
    void connectRobotArm(armId).then((result) => markFailed(armId, result === "failed"));
  };

  const handleDisconnectArm = (armId: string) => {
    markFailed(armId, false);
    void disconnectRobotArm(armId);
  };

  const handleConnectAll = () => {
    setConnectAllFailed(false);
    setFailedArmIds([]);
    void connectRobot().then((result) => setConnectAllFailed(result === "failed"));
  };

  const handleDisconnectAll = () => {
    setConnectAllFailed(false);
    setFailedArmIds([]);
    void disconnectRobot();
  };

  // "Calibrate" from the aggregate CTA: straight to the arm when exactly one
  // needs it, otherwise Calibrate's own arm overview.
  const handleCalibrate = () => {
    const armId = pickArmToCalibrate(arms);
    if (armId) onCalibrateArm(armId);
    else onCalibrate();
  };

  // Targeted arm: scrolled into view once its card has been laid out, and
  // outlined while this screen shows it. Positions come from onLayout.
  const focusId = focusArmId && setup.activeArmIds.includes(focusArmId) ? focusArmId : null;
  const scrollRef = useRef<ScrollView>(null);
  const armListY = useRef<number | null>(null);
  const armYs = useRef<Record<string, number>>({});
  const scrolledFor = useRef<string | null>(null);

  const scrollToFocus = () => {
    if (!focusId || scrolledFor.current === focusId) return;
    const listY = armListY.current;
    const cardY = armYs.current[focusId];
    if (listY === null || cardY === undefined) return;
    scrolledFor.current = focusId;
    // No animation: a jump is motion-safe and lands immediately.
    scrollRef.current?.scrollTo({ animated: false, y: Math.max(0, listY + cardY - space.lg) });
  };

  useEffect(() => {
    scrolledFor.current = null;
    scrollToFocus();
    // scrollToFocus reads refs only; re-run when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  return (
    <>
      <ScrollView
        ref={scrollRef}
        accessibilityLabel="Kết nối robot"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <ScreenHeader
          fontsReady={fontsReady}
          onBack={onBack}
          subtitle={
            multiArm
              ? "Kết nối các tay SO-ARM101 để điều khiển và dùng kỹ năng."
              : "Kết nối SO-ARM101 để điều khiển và dùng kỹ năng."
          }
          title="Kết nối robot"
        />

        <SetupSummary
          armCount={arms.length}
          colors={colors}
          connectedCount={connectedCount}
          connecting={link.connecting}
          fontsReady={fontsReady}
          robot={robot}
          styles={styles}
          uncalibratedCount={uncalibratedCount}
        />

        {emergencyStopped && (
          // E-STOP is global. Arms may still connect or disconnect; nothing
          // here offers control or a reset (Reset lives beside the floating
          // E-STOP only).
          <View accessibilityRole="alert" style={styles.safety}>
            <ShieldAlert color={colors.statusDanger} size={18} />
            <View style={styles.safetyText}>
              <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
                Đã dừng khẩn cấp
              </SkyText>
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                Robot sẽ không di chuyển. Nhấn Reset cạnh nút E-STOP khi đã an toàn. Bạn vẫn có thể kết nối hoặc ngắt kết nối
                từng tay.
              </SkyText>
            </View>
          </View>
        )}

        <View
          onLayout={(event) => {
            armListY.current = event.nativeEvent.layout.y;
            scrollToFocus();
          }}
          style={styles.armList}
        >
          {multiArm && (
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
              Các tay robot
            </SkyText>
          )}
          {arms.map((arm) => (
            <View
              key={arm.id}
              onLayout={(event) => {
                armYs.current[arm.id] = event.nativeEvent.layout.y;
                scrollToFocus();
              }}
            >
              <ArmRow
                arm={arm}
                colors={colors}
                failed={failedArmIds.includes(arm.id)}
                focused={arm.id === focusId}
                fontsReady={fontsReady}
                onCalibrate={() => onCalibrateArm(arm.id)}
                onCancel={() => cancelRobotArmConnect(arm.id)}
                onConnect={() => handleConnectArm(arm.id)}
                onDisconnect={() => handleDisconnectArm(arm.id)}
                onRename={() => setRenamingArmId(arm.id)}
                styles={styles}
              />
            </View>
          ))}
          {arms.length === 0 && (
            <SkyText fontsReady={fontsReady} tone="secondary">
              Chưa có tay robot nào trong hệ thống.
            </SkyText>
          )}
        </View>

        <PrimaryAction
          connectAllFailed={connectAllFailed}
          connected={link.connected}
          connecting={link.connecting}
          fontsReady={fontsReady}
          hasArms={arms.length > 0}
          multiArm={multiArm}
          onCalibrate={handleCalibrate}
          onConnectAll={handleConnectAll}
          onOpenControl={onOpenControl}
          readiness={readiness}
          styles={styles}
        />

        {multiArm && connectedCount > 1 && (
          <SkyButton
            accessibilityHint="Mọi tay sẽ ngừng nhận lệnh. Trạng thái E-STOP và hiệu chỉnh được giữ nguyên."
            accessibilityLabel="Ngắt kết nối tất cả"
            fontsReady={fontsReady}
            onPress={handleDisconnectAll}
            style={styles.secondaryAction}
            variant="secondary"
          >
            Ngắt kết nối tất cả
          </SkyButton>
        )}

        {connectedCount === 0 && (
          <SkySection fontsReady={fontsReady} title="Trước khi kết nối">
            <View style={styles.checklist}>
              {PRECHECKS.map((item) => (
                <View key={item} style={styles.checkRow}>
                  <CircleCheck color={colors.textSecondary} size={18} />
                  <SkyText fontsReady={fontsReady} style={styles.flex}>
                    {item}
                  </SkyText>
                </View>
              ))}
            </View>
          </SkySection>
        )}

        {prototype && (
          // Truthful about what "connected" means today: no hardware is
          // discovered or contacted (see useRobotProviderMode / data/robot.ts).
          <View
            accessibilityLabel="Chế độ thử nghiệm: kết nối hiện được mô phỏng, chưa giao tiếp với robot thật."
            accessible
            style={styles.modeNote}
          >
            <FlaskConical color={colors.textSecondary} size={14} />
            <SkyText fontsReady={fontsReady} style={styles.flex} tone="secondary" variant="caption">
              Chế độ thử nghiệm · kết nối hiện được mô phỏng, chưa giao tiếp với robot thật.
            </SkyText>
          </View>
        )}
      </ScrollView>

      <RenameArmDialog
        arm={renamingArm}
        key={renamingArmId ?? "closed"}
        colors={colors}
        fontsReady={fontsReady}
        onClose={() => setRenamingArmId(null)}
        styles={styles}
      />
    </>
  );
}

// "Hệ thống hiện tại": how many arms, how many connected, and the one
// aggregate state. The state itself is the shared readiness — the counts
// only phrase it.
function SetupSummary({
  armCount,
  colors,
  connectedCount,
  connecting,
  fontsReady,
  robot,
  styles,
  uncalibratedCount
}: {
  armCount: number;
  colors: SkyNexColors;
  connectedCount: number;
  connecting: boolean;
  fontsReady: boolean;
  robot: ReturnType<typeof useRobotSummary>;
  styles: ReturnType<typeof createStyles>;
  uncalibratedCount: number;
}) {
  const multiArm = armCount > 1;
  const counts = multiArm
    ? `${armCount} tay · ${connectedCount} đã kết nối`
    : connectedCount > 0
      ? "1 tay · đã kết nối"
      : "1 tay · chưa kết nối";

  let label: string | null = null;
  let note: string | null = null;
  if (robot) {
    switch (robot.readiness) {
      case "offline":
        label = connectedCount > 0 ? "Chưa kết nối đầy đủ" : "Chưa kết nối";
        note = connectedCount > 0 ? "Kết nối tất cả các tay để robot có thể hoạt động." : robot.message;
        break;
      case "needs-calibration":
        label = multiArm ? `${uncalibratedCount} tay cần hiệu chỉnh` : READINESS_BADGE_LABEL["needs-calibration"];
        note = "Hiệu chỉnh để robot di chuyển chính xác.";
        break;
      default:
        // Ready / E-STOP: the badge says it (E-STOP also has its alert).
        label = READINESS_BADGE_LABEL[robot.readiness];
    }
  }

  return (
    <SkyCard style={styles.card}>
      <View style={styles.summaryHeading}>
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          Hệ thống hiện tại
        </SkyText>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
          {counts}
        </SkyText>
      </View>

      <View style={styles.statusRow}>
        {connecting ? (
          <View accessibilityLabel="Đang kết nối" accessibilityLiveRegion="polite" accessible style={styles.connectingBadge}>
            <ActivityIndicator color={colors.textSecondary} size="small" />
            <SkyText fontsReady={fontsReady} tone="secondary" variant="status">
              Đang kết nối…
            </SkyText>
          </View>
        ) : robot && label ? (
          <StatusBadge accessibilityLiveRegion="polite" fontsReady={fontsReady} label={label} status={robot.status} />
        ) : null}
      </View>

      {(connecting || note) && (
        <SkyText fontsReady={fontsReady} tone="secondary">
          {connecting ? "Đang chờ robot phản hồi. Không cần làm gì thêm." : note}
        </SkyText>
      )}
    </SkyCard>
  );
}

// One arm: name first, role/model second, then its connection and
// calibration in words (icons only reinforce them), and its own actions
// right-aligned — clear of the default bottom-left floating E-STOP.
function ArmRow({
  arm,
  colors,
  failed,
  focused,
  fontsReady,
  onCalibrate,
  onCancel,
  onConnect,
  onDisconnect,
  onRename,
  styles
}: {
  arm: RobotArmState;
  colors: SkyNexColors;
  failed: boolean;
  focused: boolean;
  fontsReady: boolean;
  onCalibrate: () => void;
  onCancel: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRename: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const connection = arm.connecting ? "Đang kết nối…" : arm.connected ? "Đã kết nối" : "Chưa kết nối";
  const calibration = arm.calibrated ? "Đã hiệu chỉnh" : "Cần hiệu chỉnh";
  // Semantic colour only where it is true right now: a disconnected arm's
  // stored calibration stays neutral.
  const calibrationColor = !arm.connected
    ? colors.textSecondary
    : arm.calibrated
      ? colors.statusReady
      : colors.statusWarning;
  const CalibrationIcon = arm.calibrated ? CircleCheck : CircleAlert;

  return (
    <SkyCard style={[styles.armCard, focused && { borderColor: colors.accentInk, borderWidth: 2 }]}>
      <View style={styles.armTop}>
        <View style={styles.armIcon}>
          <Bot color={colors.textPrimary} size={22} strokeWidth={1.75} />
        </View>
        <View
          accessibilityLabel={`${arm.name}, ${describeRobotArm(arm)}, ${connection}, ${calibration}`}
          accessible
          style={styles.armText}
        >
          <SkyText fontsReady={fontsReady} numberOfLines={2} variant="cardTitle">
            {arm.name}
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {describeRobotArm(arm)}
          </SkyText>
          <View style={styles.armStatus}>
            <View style={styles.statusItem}>
              {/* Connecting shows its spinner on the busy button below. */}
              <View style={[styles.statusDot, { backgroundColor: arm.connected ? colors.statusReady : colors.textSecondary }]} />

              <SkyText fontsReady={fontsReady} tone={arm.connected ? "primary" : "secondary"} variant="caption">
                {connection}
              </SkyText>
            </View>
            <View style={styles.statusItem}>
              <CalibrationIcon color={calibrationColor} size={14} />
              <SkyText fontsReady={fontsReady} tone={arm.connected ? "primary" : "secondary"} variant="caption">
                {calibration}
              </SkyText>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityHint="Mở hộp thoại đổi tên. Vai trò của tay không thay đổi."
          accessibilityLabel={`Đổi tên ${arm.name}`}
          accessibilityRole="button"
          hitSlop={4}
          onPress={onRename}
          style={({ pressed }) => [styles.renameButton, pressed && styles.pressed]}
        >
          <Pencil color={colors.textSecondary} size={18} />
        </Pressable>
      </View>

      <View style={styles.armActions}>
        {arm.connecting ? (
          <>
            <SkyButton
              accessibilityLabel={`Đang kết nối ${arm.name}`}
              fontsReady={fontsReady}
              loading
              style={styles.armButton}
              variant="secondary"
            >
              Đang kết nối…
            </SkyButton>
            <SkyButton
              accessibilityLabel={`Hủy kết nối ${arm.name}`}
              fontsReady={fontsReady}
              onPress={onCancel}
              style={styles.armButton}
              variant="secondary"
            >
              Hủy
            </SkyButton>
          </>
        ) : arm.connected ? (
          <>
            {!arm.calibrated && (
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
            )}
            <SkyButton
              accessibilityHint="Tay này sẽ ngừng nhận lệnh. Các tay khác, hiệu chỉnh và E-STOP được giữ nguyên."
              accessibilityLabel={`Ngắt kết nối ${arm.name}`}
              fontsReady={fontsReady}
              onPress={onDisconnect}
              style={styles.armButton}
              variant="secondary"
            >
              Ngắt kết nối
            </SkyButton>
          </>
        ) : (
          <SkyButton
            accessibilityHint={`Kết nối ứng dụng với ${arm.name}`}
            accessibilityLabel={`Kết nối ${arm.name}`}
            fontsReady={fontsReady}
            onPress={onConnect}
            style={styles.armButton}
            variant="secondary"
          >
            Kết nối
          </SkyButton>
        )}
      </View>

      {failed && !arm.connected && !arm.connecting && (
        <SkyText accessibilityLiveRegion="polite" fontsReady={fontsReady} tone="secondary" variant="caption">
          Không kết nối được {arm.name}. Kiểm tra nguồn rồi thử lại.
        </SkyText>
      )}
    </SkyCard>
  );
}

// The one primary action, chosen by the shared AGGREGATE readiness — never
// by local flags: connect the rest when any arm is offline, calibrate when
// some arm is uncalibrated, control when ready. Nothing when E-STOP holds a
// fully connected robot. Connecting never arms or starts control.
function PrimaryAction({
  connectAllFailed,
  connected,
  connecting,
  fontsReady,
  hasArms,
  multiArm,
  onCalibrate,
  onConnectAll,
  onOpenControl,
  readiness,
  styles
}: {
  connectAllFailed: boolean;
  connected: boolean;
  connecting: boolean;
  fontsReady: boolean;
  hasArms: boolean;
  multiArm: boolean;
  onCalibrate: () => void;
  onConnectAll: () => void;
  onOpenControl: () => void;
  readiness: string | undefined;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!hasArms) return null;

  if (!connected) {
    const label = multiArm ? "Kết nối tất cả" : "Kết nối robot";
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint={multiArm ? "Kết nối mọi tay chưa kết nối trong hệ thống" : "Kết nối ứng dụng với robot SO-ARM101"}
          accessibilityLabel={connecting ? "Đang kết nối robot" : label}
          fontsReady={fontsReady}
          loading={connecting}
          onPress={onConnectAll}
        >
          {connecting ? "Đang kết nối…" : label}
        </SkyButton>
        <SkyText accessibilityLiveRegion="polite" fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
          {connectAllFailed
            ? "Chưa kết nối được mọi tay. Kiểm tra nguồn robot rồi thử lại."
            : "Sau khi kết nối, SkyNex kiểm tra hiệu chỉnh trước khi robot được phép di chuyển."}
        </SkyText>
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

// Rename one arm. The name is a label: the id, role and side never change,
// and the role is never read from the name. Empty names are rejected
// (renameRobotArm trims and refuses them); duplicates are allowed.
function RenameArmDialog({
  arm,
  colors,
  fontsReady,
  onClose,
  styles
}: {
  arm: RobotArmState | null;
  colors: SkyNexColors;
  fontsReady: boolean;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  // Prefilled with the current name. The dialog is keyed by arm, so each
  // opening starts fresh.
  const [draft, setDraft] = useState(arm?.name ?? "");
  const [emptyError, setEmptyError] = useState(false);

  const handleSave = () => {
    if (!arm) return;
    const result = renameRobotArm(arm.id, draft);
    if (result === "empty") {
      setEmptyError(true);
      return;
    }
    onClose();
  };

  const blank = draft.trim().length === 0;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={arm !== null}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
            Đổi tên tay robot
          </SkyText>
          {arm && (
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {describeRobotArm(arm)} · Tên chỉ giúp bạn nhận biết tay này, không thay đổi vai trò của nó.
            </SkyText>
          )}
          <TextInput
            accessibilityHint="Nhập tên mới rồi nhấn Lưu"
            accessibilityLabel="Tên tay robot"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={ARM_NAME_MAX}
            onChangeText={(text) => {
              setDraft(text);
              if (emptyError) setEmptyError(false);
            }}
            onSubmitEditing={handleSave}
            placeholder="Ví dụ: leader_left"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            selectTextOnFocus
            style={[
              styles.input,
              font("body", fontsReady),
              { borderColor: emptyError ? colors.statusDanger : colors.border, color: colors.textPrimary }
            ]}
            value={draft}
          />
          {emptyError && (
            <SkyText accessibilityLiveRegion="polite" accessibilityRole="alert" fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="caption">
              Tên không được để trống.
            </SkyText>
          )}
          <View style={styles.modalActions}>
            <SkyButton accessibilityLabel="Hủy đổi tên" fontsReady={fontsReady} onPress={onClose} style={styles.modalButton} variant="secondary">
              Hủy
            </SkyButton>
            <SkyButton
              accessibilityHint={blank ? "Nhập tên trước khi lưu" : undefined}
              accessibilityLabel="Lưu tên mới"
              disabled={blank}
              fontsReady={fontsReady}
              onPress={handleSave}
              style={styles.modalButton}
            >
              Lưu
            </SkyButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    summaryHeading: {
      gap: 2
    },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.xs
    },
    connectingBadge: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs
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
    // minWidth 0 lets a long name wrap / truncate instead of pushing the
    // rename button off the card.
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
    renameButton: {
      alignItems: "center",
      borderRadius: corner.pill,
      height: 44,
      justifyContent: "center",
      marginRight: -space.xs,
      marginTop: -space.xs,
      width: 44
    },
    // Right-aligned and wrapping: actions stay on the side away from the
    // default floating E-STOP and never overflow at 360pt.
    armActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
      justifyContent: "flex-end"
    },
    armButton: {
      minHeight: 44,
      paddingHorizontal: space.md
    },
    action: {
      gap: space.sm
    },
    // Secondary actions are compact and centred: clearly subordinate to the
    // primary action, and clear of the floating E-STOP's edge column.
    secondaryAction: {
      alignSelf: "center",
      minWidth: 160
    },
    checklist: {
      gap: space.sm
    },
    checkRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm
    },
    modeNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.xs
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
    input: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.card,
      borderWidth: 1,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: space.md,
      paddingVertical: space.sm
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
