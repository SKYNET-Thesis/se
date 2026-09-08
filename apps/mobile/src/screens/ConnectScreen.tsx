import {
  Cable,
  Check,
  CircleAlert,
  CircleCheck,
  Hand,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  TriangleAlert,
  Unplug
} from "lucide-react-native";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";

type ArmRole = "follower" | "leader";

type PortInfo = {
  id: string;
  path: string;
  vendor: string;
  serial: string;
};

type ScanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "found"; ports: PortInfo[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type LinkState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected"; jointCount: number }
  | { kind: "error"; message: string };

type ArmSlot = {
  role: ArmRole;
  portId: string | null;
  link: LinkState;
};

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  reduceMotion: boolean;
  onBack: () => void;
  onContinue: () => void;
  onOpenTeleop: () => void;
};

type Tone = "ok" | "caution" | "danger" | "neutral";

// Same tone vocabulary as StatusScreen/HomeScreen so connection state reads
// consistently across the whole app: lime = good, amber = caution, red =
// blocking error, muted gray = nothing to report yet.
const toneColor: Record<Tone, string> = {
  ok: colors.accent,
  caution: colors.caution,
  danger: colors.danger,
  neutral: colors.textLo
};

const ROLE_LABEL: Record<ArmRole, "Follower" | "Leader"> = {
  follower: "Follower",
  leader: "Leader"
};

const ROLE_HINT: Record<ArmRole, string> = {
  follower: "Tay thực hiện chuyển động",
  leader: "Tay điều khiển / ghi lệnh"
};

const EXPECTED_JOINTS = 6;
const FAULTY_PORT_ID = "usb0";

const MOCK_PORTS: PortInfo[] = [
  { id: "acm0", path: "/dev/ttyACM0", vendor: "Feetech FE-URT-1", serial: "SN-2214A" },
  { id: "acm1", path: "/dev/ttyACM1", vendor: "Feetech FE-URT-1", serial: "SN-2214B" },
  { id: "usb0", path: "/dev/ttyUSB0", vendor: "Không xác định", serial: "—" }
];

const linkStatusLabel: Record<LinkState["kind"], string> = {
  idle: "Chưa chọn cổng",
  connecting: "Đang kết nối",
  connected: "Đã kết nối",
  error: "Lỗi kết nối"
};

const linkStatusColor: Record<LinkState["kind"], string> = {
  idle: colors.textLo,
  connecting: colors.caution,
  connected: colors.accent,
  error: colors.danger
};

// theme.ts tops out at radius.card (16). Matches the larger, softer corner
// Home/Status already established for this app's "rich card" surfaces —
// kept identical here so Connect reads as the same product.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 20;

function createSlot(role: ArmRole): ArmSlot {
  return { role, portId: null, link: { kind: "idle" } };
}

function describeScan(scanState: ScanState): { tone: Tone; title: string; detail: string } {
  switch (scanState.kind) {
    case "idle":
      return { tone: "neutral", title: "Chưa quét", detail: "Nhấn quét để tìm cổng USB đang cắm." };
    case "scanning":
      return { tone: "caution", title: "Đang tìm thiết bị…", detail: "Đang dò cổng nối tiếp đang cắm…" };
    case "found":
      return {
        tone: "ok",
        title: `Tìm thấy ${scanState.ports.length} thiết bị`,
        detail: "Chọn cổng tương ứng cho Follower và Leader bên dưới."
      };
    case "empty":
      return {
        tone: "caution",
        title: "Không tìm thấy thiết bị",
        detail: "Không tìm thấy cổng nào. Kiểm tra cáp USB rồi quét lại."
      };
    case "error":
      return { tone: "danger", title: "Lỗi quét cổng", detail: scanState.message };
  }
}

export function ConnectScreen({ emergencyStopped, fontsReady, reduceMotion, onBack, onContinue, onOpenTeleop }: Props) {
  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });
  const [slots, setSlots] = useState<Record<ArmRole, ArmSlot>>({
    follower: createSlot("follower"),
    leader: createSlot("leader")
  });

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkTimeoutsRef = useRef<Record<ArmRole, ReturnType<typeof setTimeout> | null>>({
    follower: null,
    leader: null
  });

  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scanState.kind !== "scanning" || reduceMotion) return undefined;

    spin.setValue(0);
    const animation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, scanState.kind, spin]);

  useEffect(
    () => () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (linkTimeoutsRef.current.follower) clearTimeout(linkTimeoutsRef.current.follower);
      if (linkTimeoutsRef.current.leader) clearTimeout(linkTimeoutsRef.current.leader);
    },
    []
  );

  const updateSlot = useCallback((role: ArmRole, patch: Partial<ArmSlot>) => {
    setSlots((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }, []);

  const handleScan = useCallback(() => {
    if (emergencyStopped) return;
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

    setScanState({ kind: "scanning" });
    scanTimeoutRef.current = setTimeout(() => {
      setScanState(MOCK_PORTS.length > 0 ? { kind: "found", ports: MOCK_PORTS } : { kind: "empty" });
    }, 900);
  }, [emergencyStopped]);

  const handleSelectPort = useCallback(
    (role: ArmRole, portId: string) => {
      const slot = slots[role];
      if (emergencyStopped || slot.link.kind === "connecting" || slot.link.kind === "connected") return;
      updateSlot(role, { portId, link: { kind: "idle" } });
    },
    [emergencyStopped, slots, updateSlot]
  );

  const handleConnect = useCallback(
    (role: ArmRole) => {
      const slot = slots[role];
      const otherRole: ArmRole = role === "follower" ? "leader" : "follower";
      const other = slots[otherRole];
      if (emergencyStopped || !slot.portId || slot.portId === other.portId) return;
      if (slot.link.kind === "connecting" || slot.link.kind === "connected") return;

      const portId = slot.portId;
      updateSlot(role, { link: { kind: "connecting" } });

      if (linkTimeoutsRef.current[role]) clearTimeout(linkTimeoutsRef.current[role]!);
      linkTimeoutsRef.current[role] = setTimeout(() => {
        if (portId === FAULTY_PORT_ID) {
          updateSlot(role, {
            link: { kind: "error", message: "Không nhận phản hồi từ bo mạch servo. Kiểm tra cáp và nguồn." }
          });
        } else {
          updateSlot(role, { link: { kind: "connected", jointCount: EXPECTED_JOINTS } });
        }
      }, 700);
    },
    [emergencyStopped, slots, updateSlot]
  );

  const handleDisconnect = useCallback(
    (role: ArmRole) => {
      if (linkTimeoutsRef.current[role]) clearTimeout(linkTimeoutsRef.current[role]!);
      updateSlot(role, { link: { kind: "idle" } });
    },
    [updateSlot]
  );

  const conflict =
    slots.follower.portId !== null && slots.follower.portId === slots.leader.portId;
  const bothConnected = slots.follower.link.kind === "connected" && slots.leader.link.kind === "connected";
  const anyConnecting = slots.follower.link.kind === "connecting" || slots.leader.link.kind === "connecting";
  const canContinue = bothConnected && !emergencyStopped;
  const canOpenTeleop = bothConnected && !emergencyStopped;
  const ports = scanState.kind === "found" ? scanState.ports : [];
  const scanDisabled = emergencyStopped || scanState.kind === "scanning";
  const scanContentColor = scanState.kind === "scanning" ? colors.caution : scanDisabled ? colors.textLo : colors.accentText;

  // Roles that are picked, non-conflicting, and not already mid-flight — what
  // the single "Kết nối" CTA below actually acts on. Per-card connect/retry
  // buttons stay fully functional on their own; this just connects whatever
  // is ready in one tap instead of requiring two separate presses.
  const readyRoles = (Object.keys(slots) as ArmRole[]).filter((role) => {
    const slot = slots[role];
    const otherRole: ArmRole = role === "follower" ? "leader" : "follower";
    return slot.link.kind === "idle" && !!slot.portId && slot.portId !== slots[otherRole].portId;
  });
  const canMasterConnect =
    !emergencyStopped &&
    scanState.kind !== "scanning" &&
    !anyConnecting &&
    !conflict &&
    !!slots.follower.portId &&
    !!slots.leader.portId &&
    readyRoles.length > 0;

  const masterHint = emergencyStopped || conflict || anyConnecting
    ? null
    : scanState.kind !== "found"
      ? "Quét và chọn cổng cho cả Follower và Leader trước."
      : !slots.follower.portId || !slots.leader.portId
        ? "Chọn cổng cho cả Follower và Leader để kết nối."
        : null;

  const handleMasterConnect = useCallback(() => {
    readyRoles.forEach((role) => handleConnect(role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleConnect, JSON.stringify(readyRoles)]);

  const scan = describeScan(scanState);

  const rotateStyle = {
    transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }]
  };

  return (
    <ScrollView
      accessibilityLabel="Màn hình kết nối tay robot"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={onBack}
        subtitle="Kết nối Leader và Follower"
        title="Kết nối"
      />

      {emergencyStopped && (
        <View style={styles.stoppedBanner}>
          <ShieldAlert color={colors.danger} size={18} />
          <Text style={[styles.stoppedText, font("body", fontsReady)]}>
            Hệ thống đang E-STOP — không thể quét cổng hay kết nối. Reset E-STOP ở thanh trạng thái để tiếp tục.
          </Text>
        </View>
      )}

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.dot, { backgroundColor: toneColor[scan.tone] }]} />
          <Text style={[styles.heroLabel, font("display", fontsReady), { color: toneColor[scan.tone] }]}>
            {scan.title}
          </Text>
        </View>
        <Text
          style={[
            styles.heroDetail,
            font("body", fontsReady),
            scan.tone === "danger" && styles.heroDetailDanger
          ]}
        >
          {scan.detail}
        </Text>

        <Pressable
          accessibilityHint="Quét lại danh sách cổng nối tiếp đang cắm vào thiết bị"
          accessibilityLabel="Quét thiết bị"
          accessibilityRole="button"
          accessibilityState={{ disabled: scanDisabled }}
          disabled={scanDisabled}
          onPress={handleScan}
          style={({ pressed }) => [
            styles.scanButton,
            emergencyStopped && styles.scanButtonDisabled,
            scanState.kind === "scanning" && styles.scanButtonBusy,
            pressed && styles.pressed
          ]}
        >
          <Animated.View style={scanState.kind === "scanning" ? rotateStyle : undefined}>
            {scanState.kind === "scanning" ? (
              <RefreshCw color={scanContentColor} size={19} />
            ) : (
              <ScanLine color={scanContentColor} size={19} />
            )}
          </Animated.View>
          <Text
            style={[
              styles.scanButtonText,
              scanDisabled && styles.scanButtonTextDisabled,
              scanState.kind === "scanning" && styles.scanButtonTextBusy,
              font("display", fontsReady)
            ]}
          >
            {scanState.kind === "scanning" ? "Đang tìm thiết bị…" : scanState.kind === "idle" ? "Quét thiết bị" : "Quét lại"}
          </Text>
        </Pressable>
      </View>

      <ArmSlotCard
        conflict={conflict}
        disabled={emergencyStopped}
        fontsReady={fontsReady}
        onConnect={() => handleConnect("follower")}
        onDisconnect={() => handleDisconnect("follower")}
        onSelectPort={(portId) => handleSelectPort("follower", portId)}
        otherPortId={slots.leader.portId}
        ports={ports}
        scanState={scanState}
        slot={slots.follower}
      />

      <ArmSlotCard
        conflict={conflict}
        disabled={emergencyStopped}
        fontsReady={fontsReady}
        onConnect={() => handleConnect("leader")}
        onDisconnect={() => handleDisconnect("leader")}
        onSelectPort={(portId) => handleSelectPort("leader", portId)}
        otherPortId={slots.follower.portId}
        ports={ports}
        scanState={scanState}
        slot={slots.leader}
      />

      {bothConnected ? (
        <View style={styles.continueGroup}>
          <Pressable
            accessibilityHint="Chuyển sang wizard calibrate SO-101"
            accessibilityLabel="Tiếp tục: Hiệu chỉnh"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={onContinue}
            style={({ pressed }) => [
              styles.continueButton,
              !canContinue && styles.continueButtonDisabled,
              pressed && canContinue && styles.pressed
            ]}
          >
            <Check color={canContinue ? colors.accentText : colors.textLo} size={19} />
            <Text style={[styles.continueText, !canContinue && styles.continueTextDisabled, font("display", fontsReady)]}>
              Tiếp tục: Hiệu chỉnh
            </Text>
          </Pressable>

          <Pressable
            accessibilityHint="Mở màn điều khiển trực tiếp leader kéo follower"
            accessibilityLabel="Tiếp tục: Teleop"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canOpenTeleop }}
            disabled={!canOpenTeleop}
            onPress={onOpenTeleop}
            style={({ pressed }) => [
              styles.teleopButton,
              !canOpenTeleop && styles.continueButtonDisabled,
              pressed && canOpenTeleop && styles.pressed
            ]}
          >
            <Hand color={canOpenTeleop ? colors.textHi : colors.textLo} size={19} />
            <Text style={[styles.teleopText, !canOpenTeleop && styles.continueTextDisabled, font("display", fontsReady)]}>
              Tiếp tục: Teleop
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.continueGroup}>
          <Pressable
            accessibilityHint="Kết nối các tay đã chọn cổng hợp lệ"
            accessibilityLabel="Kết nối"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMasterConnect }}
            disabled={!canMasterConnect}
            onPress={handleMasterConnect}
            style={({ pressed }) => [
              styles.continueButton,
              !canMasterConnect && styles.continueButtonDisabled,
              pressed && canMasterConnect && styles.pressed
            ]}
          >
            <Cable color={canMasterConnect ? colors.accentText : colors.textLo} size={19} />
            <Text
              style={[styles.continueText, !canMasterConnect && styles.continueTextDisabled, font("display", fontsReady)]}
            >
              {anyConnecting ? "Đang kết nối…" : "Kết nối"}
            </Text>
          </Pressable>

          {masterHint && <Text style={[styles.continueHint, font("body", fontsReady)]}>{masterHint}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

function ArmSlotCard({
  slot,
  ports,
  scanState,
  otherPortId,
  conflict,
  disabled,
  fontsReady,
  onSelectPort,
  onConnect,
  onDisconnect
}: {
  slot: ArmSlot;
  ports: PortInfo[];
  scanState: ScanState;
  otherPortId: string | null;
  conflict: boolean;
  disabled: boolean;
  fontsReady: boolean;
  onSelectPort: (portId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const role = slot.role;
  const label = ROLE_LABEL[role];
  const slotConflict = conflict && slot.portId !== null;
  const locked = slot.link.kind === "connecting" || slot.link.kind === "connected";
  const canConnect = !disabled && !!slot.portId && !slotConflict && slot.link.kind === "idle";
  const connected = slot.link.kind === "connected";

  return (
    <View style={[styles.card, slotConflict && styles.cardDanger]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.cardTitle, font("display", fontsReady)]}>{label}</Text>
          <Text style={[styles.cardHint, font("body", fontsReady)]}>{ROLE_HINT[role]}</Text>
        </View>

        <View style={[styles.statusPill, connected && styles.statusPillConnected]}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? colors.accentText : linkStatusColor[slot.link.kind] }
            ]}
          />
          <Text
            style={[
              styles.statusText,
              slot.link.kind === "connecting" && styles.statusTextCaution,
              slot.link.kind === "error" && styles.statusTextDanger,
              connected && styles.statusTextConnected,
              font("body", fontsReady)
            ]}
          >
            {linkStatusLabel[slot.link.kind]}
          </Text>
        </View>
      </View>

      {renderPortArea({
        scanState,
        ports,
        slot,
        otherPortId,
        locked,
        disabled,
        fontsReady,
        onSelectPort
      })}

      {slotConflict && (
        <View style={styles.conflictRow}>
          <TriangleAlert color={colors.danger} size={15} />
          <Text style={[styles.conflictText, font("body", fontsReady)]}>
            Cổng này đang được chọn cho {label === "Follower" ? "Leader" : "Follower"} — chọn cổng khác cho {label}.
          </Text>
        </View>
      )}

      {renderSlotAction({
        slot,
        canConnect,
        fontsReady,
        onConnect,
        onDisconnect
      })}
    </View>
  );
}

function renderPortArea({
  scanState,
  ports,
  slot,
  otherPortId,
  locked,
  disabled,
  fontsReady,
  onSelectPort
}: {
  scanState: ScanState;
  ports: PortInfo[];
  slot: ArmSlot;
  otherPortId: string | null;
  locked: boolean;
  disabled: boolean;
  fontsReady: boolean;
  onSelectPort: (portId: string) => void;
}) {
  if (scanState.kind === "idle") {
    return (
      <Text style={[styles.portPlaceholder, font("body", fontsReady)]}>Quét cổng để chọn thiết bị.</Text>
    );
  }
  if (scanState.kind === "scanning") {
    return <Text style={[styles.portPlaceholder, font("body", fontsReady)]}>Đang quét…</Text>;
  }
  if (scanState.kind === "empty") {
    return (
      <Text style={[styles.portPlaceholder, font("body", fontsReady)]}>Chưa có cổng nào để chọn.</Text>
    );
  }
  if (scanState.kind === "error") {
    return <Text style={[styles.portPlaceholderDanger, font("body", fontsReady)]}>{scanState.message}</Text>;
  }

  return (
    <View style={styles.portRow}>
      {ports.map((port) => {
        const selected = slot.portId === port.id;
        const takenByOther = otherPortId === port.id && !selected;
        const chipDisabled = disabled || locked;

        return (
          <Pressable
            key={port.id}
            accessibilityLabel={`${port.path} ${port.vendor}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: chipDisabled }}
            disabled={chipDisabled}
            onPress={() => onSelectPort(port.id)}
            style={({ pressed }) => [
              styles.portChip,
              selected && styles.portChipSelected,
              takenByOther && styles.portChipTaken,
              chipDisabled && styles.portChipDisabled,
              pressed && !chipDisabled && styles.pressed
            ]}
          >
            <Text
              style={[
                styles.portPath,
                selected && styles.portPathSelected,
                font("monoStrong", fontsReady)
              ]}
            >
              {port.path}
            </Text>
            <Text style={[styles.portVendor, selected && styles.portVendorSelected, font("body", fontsReady)]}>
              {port.vendor}
            </Text>
            {takenByOther && (
              <Text style={[styles.portTakenText, font("body", fontsReady)]}>Đã chọn cho tay kia</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function renderSlotAction({
  slot,
  canConnect,
  fontsReady,
  onConnect,
  onDisconnect
}: {
  slot: ArmSlot;
  canConnect: boolean;
  fontsReady: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  switch (slot.link.kind) {
    case "idle":
      return (
        <Pressable
          accessibilityLabel={`Kết nối ${ROLE_LABEL[slot.role]}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConnect }}
          disabled={!canConnect}
          onPress={onConnect}
          style={({ pressed }) => [
            styles.actionButton,
            !canConnect && styles.actionButtonDisabled,
            pressed && canConnect && styles.pressed
          ]}
        >
          <Text style={[styles.actionButtonText, !canConnect && styles.actionButtonTextDisabled, font("display", fontsReady)]}>
            Kết nối {ROLE_LABEL[slot.role]}
          </Text>
        </Pressable>
      );
    case "connecting":
      return (
        <View style={[styles.actionButton, styles.actionButtonBusy]}>
          <Text style={[styles.actionButtonTextBusy, font("display", fontsReady)]}>Đang kết nối…</Text>
        </View>
      );
    case "connected":
      return (
        <View style={styles.connectedRow}>
          <View style={styles.connectedInfo}>
            <CircleCheck color={colors.accent} size={16} />
            <Text style={[styles.connectedText, font("mono", fontsReady)]}>
              {slot.link.jointCount} khớp đã xác nhận
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Ngắt kết nối ${ROLE_LABEL[slot.role]}`}
            accessibilityRole="button"
            onPress={onDisconnect}
            style={({ pressed }) => [styles.disconnectButton, pressed && styles.pressed]}
          >
            <Unplug color={colors.textHi} size={15} />
            <Text style={[styles.disconnectText, font("display", fontsReady)]}>Ngắt</Text>
          </Pressable>
        </View>
      );
    case "error":
      return (
        <View style={styles.errorRow}>
          <View style={styles.errorInfo}>
            <CircleAlert color={colors.danger} size={16} />
            <Text style={[styles.errorText, font("body", fontsReady)]}>{slot.link.message}</Text>
          </View>
          <Pressable
            accessibilityLabel={`Thử lại kết nối ${ROLE_LABEL[slot.role]}`}
            accessibilityRole="button"
            onPress={onConnect}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <RefreshCw color={colors.textHi} size={15} />
            <Text style={[styles.retryText, font("display", fontsReady)]}>Thử lại</Text>
          </Pressable>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  stoppedBanner: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderLeftColor: colors.danger,
    borderLeftWidth: 3,
    borderRadius: radius.button,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  stoppedText: {
    ...type.body,
    color: colors.textHi,
    flex: 1
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.round
  },

  // Device discovery hero
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.lg,
    gap: spacing.md
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  heroLabel: {
    ...type.title,
    flexShrink: 1
  },
  heroDetail: {
    ...type.small,
    color: colors.textLo
  },
  heroDetailDanger: {
    color: colors.danger
  },
  scanButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 56
  },
  scanButtonDisabled: {
    backgroundColor: colors.surface2,
    opacity: 0.58
  },
  scanButtonBusy: {
    backgroundColor: colors.surface2,
    borderColor: colors.caution,
    borderWidth: 1
  },
  scanButtonText: {
    ...type.label,
    color: colors.accentText
  },
  scanButtonTextDisabled: {
    color: colors.textLo
  },
  scanButtonTextBusy: {
    color: colors.caution
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS_OUTER,
    gap: spacing.lg,
    padding: spacing.lg
  },
  cardDanger: {
    borderColor: colors.danger,
    borderWidth: 1
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    ...type.title,
    color: colors.textHi
  },
  cardHint: {
    ...type.body,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.round,
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  statusPillConnected: {
    backgroundColor: colors.accent
  },
  statusDot: {
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  statusText: {
    ...type.label,
    color: colors.textHi
  },
  statusTextCaution: {
    color: colors.caution
  },
  statusTextDanger: {
    color: colors.danger
  },
  statusTextConnected: {
    color: colors.accentText
  },
  portPlaceholder: {
    ...type.body,
    color: colors.textLo
  },
  portPlaceholderDanger: {
    ...type.body,
    color: colors.danger
  },
  portRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  portChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.surface2,
    borderRadius: CARD_RADIUS_INNER,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.xxs,
    minHeight: 64,
    padding: spacing.md
  },
  portChipSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.textHi
  },
  portChipTaken: {
    borderColor: colors.caution
  },
  portChipDisabled: {
    opacity: 0.58
  },
  portPath: {
    ...type.mono,
    color: colors.textHi
  },
  portPathSelected: {
    color: colors.textHi
  },
  portVendor: {
    ...type.small,
    color: colors.textLo
  },
  portVendorSelected: {
    color: colors.textHi
  },
  portTakenText: {
    ...type.small,
    color: colors.caution,
    marginTop: 2
  },
  conflictRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS_INNER,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  conflictText: {
    ...type.small,
    color: colors.danger,
    flex: 1
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52
  },
  actionButtonDisabled: {
    opacity: 0.52
  },
  actionButtonBusy: {
    backgroundColor: colors.surface2,
    borderColor: colors.caution,
    borderWidth: 1
  },
  actionButtonText: {
    ...type.label,
    color: colors.textHi
  },
  actionButtonTextDisabled: {
    color: colors.textLo
  },
  actionButtonTextBusy: {
    ...type.label,
    color: colors.caution
  },
  connectedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  connectedInfo: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  connectedText: {
    color: colors.textHi
  },
  disconnectButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  disconnectText: {
    ...type.label,
    color: colors.textHi
  },
  errorRow: {
    gap: spacing.sm
  },
  errorInfo: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xs
  },
  errorText: {
    ...type.small,
    color: colors.danger,
    flex: 1
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  retryText: {
    ...type.label,
    color: colors.textHi
  },
  continueGroup: {
    gap: spacing.sm
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 56
  },
  continueButtonDisabled: {
    backgroundColor: colors.surface2
  },
  continueText: {
    ...type.label,
    color: colors.accentText
  },
  continueTextDisabled: {
    color: colors.textLo
  },
  teleopButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52
  },
  teleopText: {
    ...type.label,
    color: colors.textHi
  },
  continueHint: {
    ...type.small,
    color: colors.textLo,
    textAlign: "center"
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  }
});
