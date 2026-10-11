import { Bot, CircleCheck, FlaskConical, ShieldAlert } from "lucide-react-native";
import { ReactNode, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkySection, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import {
  cancelRobotConnect,
  connectRobot,
  disconnectRobot,
  getRobotLinkMode,
  READINESS_BADGE_LABEL
} from "../data/robot";
import { useRobotLink, useRobotSummary } from "../hooks/useRobotSummary";

type Props = {
  // Owned by App.tsx. Read only: connecting, disconnecting or leaving this
  // screen never changes it.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
  onCalibrate: () => void;
  onOpenControl: () => void;
};

// Only what is true before connecting — no network or port requirements
// the app doesn't actually have.
const PRECHECKS = [
  "Robot đã được cấp nguồn",
  "Hai tay robot đang đứng yên",
  "Vùng hoạt động quanh robot trống và an toàn"
];

// Connect Robot. Answers: is SO-ARM101 connected, is it ready, and what do
// I do next? The connection itself lives in the shared robot link
// (data/robot.ts) — this screen only asks it to connect or disconnect, and
// shows the same readiness every other screen shows. Connected ≠ ready:
// calibration and E-STOP still gate motion.
export function ConnectScreen({ emergencyStopped, fontsReady, onBack, onCalibrate, onOpenControl }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const link = useRobotLink();
  const robot = useRobotSummary({ emergencyStopped });
  const [connectFailed, setConnectFailed] = useState(false);
  const prototype = getRobotLinkMode() === "prototype";

  const handleConnect = () => {
    setConnectFailed(false);
    void connectRobot().then((result) => setConnectFailed(result === "failed"));
  };

  const handleCancel = () => {
    cancelRobotConnect();
  };

  const handleDisconnect = () => {
    setConnectFailed(false);
    void disconnectRobot();
  };

  const connecting = link.connecting;
  const connected = link.connected;
  const readiness = robot?.readiness;
  const stopped = connected && readiness === "stopped";

  return (
    <ScrollView
      accessibilityLabel="Kết nối robot"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={onBack}
        subtitle="Kết nối SO-ARM101 để điều khiển và dùng kỹ năng."
        title="Kết nối robot"
      />

      {/* Robot identity + one status line. */}
      <SkyCard style={styles.robotCard}>
        <View style={styles.identity}>
          <View style={styles.robotIcon}>
            <Bot color={colors.textPrimary} size={26} strokeWidth={1.75} />
          </View>
          <View style={styles.identityText}>
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
              {robot?.name ?? "SO-ARM101"}
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              Cánh tay robot
            </SkyText>
          </View>
        </View>

        <View style={styles.statusRow}>
          {connecting ? (
            <View accessibilityLabel="Đang kết nối" accessibilityLiveRegion="polite" accessible style={styles.connectingBadge}>
              <ActivityIndicator color={colors.textSecondary} size="small" />
              <SkyText fontsReady={fontsReady} tone="secondary" variant="status">
                Đang kết nối…
              </SkyText>
            </View>
          ) : robot ? (
            <StatusBadge
              accessibilityLiveRegion="polite"
              fontsReady={fontsReady}
              label={robot.readiness === "offline" ? "Chưa kết nối" : READINESS_BADGE_LABEL[robot.readiness]}
              status={robot.status}
            />
          ) : null}
        </View>

        {/* Ready and E-STOP are already said by the facts / the alert. */}
        {robot && (connecting || (readiness !== "ready" && readiness !== "stopped")) && (
          <SkyText fontsReady={fontsReady} tone="secondary">
            {connecting ? "Đang chờ robot phản hồi. Không cần làm gì thêm." : robot.message}
          </SkyText>
        )}

        {connected && (
          <View style={styles.facts}>
            <Fact fontsReady={fontsReady} label="Kết nối" styles={styles} value="Đã kết nối" />
            <View style={styles.factDivider} />
            <Fact
              fontsReady={fontsReady}
              label="Hiệu chỉnh"
              styles={styles}
              value={link.calibrated ? "Đã hiệu chỉnh" : "Chưa hiệu chỉnh"}
            />
          </View>
        )}

        {prototype && (
          // Truthful about what "connected" means today: no hardware is
          // discovered or contacted (see getRobotLinkMode / data/robot.ts).
          <View accessibilityLabel="Chế độ thử nghiệm: kết nối đang được mô phỏng, ứng dụng chưa giao tiếp với robot thật." accessible style={styles.modeNote}>
            <FlaskConical color={colors.textSecondary} size={14} />
            <SkyText fontsReady={fontsReady} style={styles.modeNoteText} tone="secondary" variant="caption">
              Chế độ thử nghiệm · kết nối được mô phỏng, chưa giao tiếp với robot thật.
            </SkyText>
          </View>
        )}
      </SkyCard>

      {stopped && robot && (
        // Connected, but E-STOP holds the robot. Reset lives only beside the
        // floating E-STOP; nothing here offers control or a reset.
        <View accessibilityRole="alert" style={styles.safety}>
          <ShieldAlert color={colors.statusDanger} size={18} />
          <View style={styles.safetyText}>
            <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
              Đã dừng khẩn cấp
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {robot.message}
            </SkyText>
          </View>
        </View>
      )}

      <PrimaryAction
        connectFailed={connectFailed}
        connected={connected}
        connecting={connecting}
        fontsReady={fontsReady}
        onCalibrate={onCalibrate}
        onCancel={handleCancel}
        onConnect={handleConnect}
        onOpenControl={onOpenControl}
        readiness={readiness}
        styles={styles}
      />

      {!connected && (
        <SkySection fontsReady={fontsReady} title="Trước khi kết nối">
          <View style={styles.checklist}>
            {PRECHECKS.map((item) => (
              <View key={item} style={styles.checkRow}>
                <CircleCheck color={colors.textSecondary} size={18} />
                <SkyText fontsReady={fontsReady} style={styles.checkText}>
                  {item}
                </SkyText>
              </View>
            ))}
          </View>
        </SkySection>
      )}

      {connected && (
        <SkyButton
          accessibilityHint="Robot sẽ ngừng nhận lệnh. Trạng thái E-STOP và hiệu chỉnh được giữ nguyên."
          accessibilityLabel="Ngắt kết nối robot"
          fontsReady={fontsReady}
          onPress={handleDisconnect}
          style={styles.secondaryAction}
          variant="secondary"
        >
          Ngắt kết nối
        </SkyButton>
      )}

    </ScrollView>
  );
}

// The one primary action, chosen by the shared readiness — never by local
// flags: connect when offline, calibrate when uncalibrated, control when
// ready. Nothing when E-STOP holds the robot.
function PrimaryAction({
  connectFailed,
  connected,
  connecting,
  fontsReady,
  onCalibrate,
  onCancel,
  onConnect,
  onOpenControl,
  readiness,
  styles
}: {
  connectFailed: boolean;
  connected: boolean;
  connecting: boolean;
  fontsReady: boolean;
  onCalibrate: () => void;
  onCancel: () => void;
  onConnect: () => void;
  onOpenControl: () => void;
  readiness: string | undefined;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!connected) {
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint="Kết nối ứng dụng với robot SO-ARM101"
          accessibilityLabel={connecting ? "Đang kết nối robot" : "Kết nối robot"}
          fontsReady={fontsReady}
          loading={connecting}
          onPress={onConnect}
        >
          {connecting ? "Đang kết nối…" : "Kết nối robot"}
        </SkyButton>
        {connecting && (
          <SkyButton
            accessibilityLabel="Hủy kết nối"
            fontsReady={fontsReady}
            onPress={onCancel}
            style={styles.secondaryAction}
            variant="secondary"
          >
            Hủy
          </SkyButton>
        )}
        <SkyText
          accessibilityLiveRegion="polite"
          fontsReady={fontsReady}
          style={styles.actionNote}
          tone="secondary"
          variant="caption"
        >
          {connectFailed
            ? "Không kết nối được. Kiểm tra nguồn robot rồi thử lại."
            : "Sau khi kết nối, SkyNex kiểm tra hiệu chỉnh trước khi robot được phép di chuyển."}
        </SkyText>
      </View>
    );
  }

  if (readiness === "needs-calibration") {
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint="Mở màn hình hiệu chỉnh"
          accessibilityLabel="Hiệu chỉnh robot"
          fontsReady={fontsReady}
          onPress={onCalibrate}
        >
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

function Fact({
  fontsReady,
  label,
  styles,
  value
}: {
  fontsReady: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: ReactNode;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.fact}>
      <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
        {label}
      </SkyText>
      <SkyText fontsReady={fontsReady} variant="cardTitle">
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
      paddingBottom: space.xxxl,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    robotCard: {
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
      marginHorizontal: space.md,
      width: StyleSheet.hairlineWidth
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
    action: {
      gap: space.sm
    },
    // Secondary actions are compact and centred: clearly subordinate to the
    // primary action, and clear of the floating E-STOP's edge column.
    secondaryAction: {
      alignSelf: "center",
      minWidth: 160
    },
    actionNote: {
      textAlign: "center"
    },
    checklist: {
      gap: space.sm
    },
    checkRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm
    },
    checkText: {
      flex: 1
    },
    modeNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.xs
    },
    modeNoteText: {
      flex: 1
    }
  });
}
