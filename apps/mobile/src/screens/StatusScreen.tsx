import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
};

type Tone = "ok" | "caution" | "danger" | "neutral";

const toneColor: Record<Tone, string> = {
  ok: colors.accent,
  caution: colors.caution,
  danger: colors.danger,
  neutral: colors.textLo
};

type ArmChannel = {
  label: "Follower" | "Leader";
  connected: boolean;
  port: string;
  latencyMs: number | null;
  calibrated: boolean;
};

type StatusSnapshot = {
  heroLabel: string;
  heroTone: Tone;
  mode: string;
  modeTone: Tone;
  systemLatencyMs: number | null;
  follower: ArmChannel;
  leader: ArmChannel;
  camerasOnline: number;
  camerasTotal: number;
  robotLabel: string;
  robotTone: Tone;
  calibrationLabel: string;
  calibrationTone: Tone;
  connectionLabel: string;
  connectionTone: Tone;
};

type SystemState = "normal" | "disconnected" | "calibration-incomplete" | "emergency-stopped" | "loading";

// Swap this during development/QA to preview any mock state below. The real
// `emergencyStopped` prop always overrides it once wired to a live signal,
// so GlobalChrome's E-STOP stays the single source of truth for that state.
const MOCK_STATE: SystemState = "normal";

const SNAPSHOTS: Record<Exclude<SystemState, "loading">, StatusSnapshot> = {
  normal: {
    heroLabel: "Sẵn sàng",
    heroTone: "ok",
    mode: "Manual",
    modeTone: "ok",
    systemLatencyMs: 42,
    follower: { label: "Follower", connected: true, port: "/dev/ttyACM0", latencyMs: 18, calibrated: true },
    leader: { label: "Leader", connected: true, port: "/dev/ttyACM1", latencyMs: 14, calibrated: true },
    camerasOnline: 3,
    camerasTotal: 3,
    robotLabel: "Online",
    robotTone: "ok",
    calibrationLabel: "Hoàn tất",
    calibrationTone: "ok",
    connectionLabel: "Sẵn sàng",
    connectionTone: "ok"
  },
  disconnected: {
    heroLabel: "Mất kết nối",
    heroTone: "danger",
    mode: "—",
    modeTone: "neutral",
    systemLatencyMs: null,
    follower: { label: "Follower", connected: false, port: "—", latencyMs: null, calibrated: false },
    leader: { label: "Leader", connected: false, port: "—", latencyMs: null, calibrated: false },
    camerasOnline: 0,
    camerasTotal: 3,
    robotLabel: "Offline",
    robotTone: "danger",
    calibrationLabel: "Không rõ",
    calibrationTone: "neutral",
    connectionLabel: "Mất kết nối",
    connectionTone: "danger"
  },
  "calibration-incomplete": {
    heroLabel: "Cần hiệu chỉnh",
    heroTone: "caution",
    mode: "Manual",
    modeTone: "ok",
    systemLatencyMs: 45,
    follower: { label: "Follower", connected: true, port: "/dev/ttyACM0", latencyMs: 19, calibrated: false },
    leader: { label: "Leader", connected: true, port: "/dev/ttyACM1", latencyMs: 15, calibrated: false },
    camerasOnline: 3,
    camerasTotal: 3,
    robotLabel: "Online",
    robotTone: "ok",
    calibrationLabel: "Chưa hoàn tất",
    calibrationTone: "caution",
    connectionLabel: "Sẵn sàng",
    connectionTone: "ok"
  },
  "emergency-stopped": {
    heroLabel: "Đã dừng khẩn cấp",
    heroTone: "danger",
    mode: "Dừng khẩn cấp",
    modeTone: "danger",
    systemLatencyMs: 42,
    follower: { label: "Follower", connected: true, port: "/dev/ttyACM0", latencyMs: 18, calibrated: true },
    leader: { label: "Leader", connected: true, port: "/dev/ttyACM1", latencyMs: 14, calibrated: true },
    camerasOnline: 3,
    camerasTotal: 3,
    robotLabel: "Đã dừng",
    robotTone: "danger",
    calibrationLabel: "Hoàn tất",
    calibrationTone: "ok",
    connectionLabel: "Sẵn sàng",
    connectionTone: "ok"
  }
};

// theme.ts tops out at radius.card (16). Matches the larger, softer corner
// HomeScreen's own "rich card" cluster already established for this app —
// kept identical here so Status reads as the same product as Home.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 20;

export function StatusScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  const state: SystemState = emergencyStopped ? "emergency-stopped" : MOCK_STATE;

  return (
    <ScrollView
      accessibilityLabel="Màn hình trạng thái tổng OmniArm"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={onBack}
        subtitle="Theo dõi hệ thống theo thời gian thực"
        title="Trạng thái"
      />

      {state === "loading" ? (
        <LoadingState fontsReady={fontsReady} />
      ) : (
        <>
          <HeroCard fontsReady={fontsReady} snapshot={SNAPSHOTS[state]} />

          <View style={styles.armShell}>
            <View style={styles.armShellRow}>
              <ArmChannelCard channel={SNAPSHOTS[state].follower} fontsReady={fontsReady} />
              <ArmChannelCard channel={SNAPSHOTS[state].leader} fontsReady={fontsReady} />
            </View>
          </View>

          <ReadinessCard fontsReady={fontsReady} snapshot={SNAPSHOTS[state]} />
          <ProfileCard fontsReady={fontsReady} />
        </>
      )}
    </ScrollView>
  );
}

function HeroCard({ snapshot, fontsReady }: { snapshot: StatusSnapshot; fontsReady: boolean }) {
  const heroColor = toneColor[snapshot.heroTone];
  const hasLatency = snapshot.systemLatencyMs !== null;

  return (
    <View style={[styles.heroCard, snapshot.heroTone === "danger" && styles.heroCardDanger]}>
      <View style={styles.heroTop}>
        <View style={styles.heroStateRow}>
          <View style={[styles.dot, { backgroundColor: heroColor }]} />
          <Text style={[styles.heroLabel, font("display", fontsReady), { color: heroColor }]}>
            {snapshot.heroLabel}
          </Text>
        </View>

        <View
          style={[
            styles.modePill,
            snapshot.modeTone === "ok" && styles.modePillOk,
            snapshot.modeTone === "danger" && styles.modePillDanger
          ]}
        >
          <Text
            style={[
              styles.modeText,
              font("display", fontsReady),
              snapshot.modeTone === "ok" && styles.modeTextOk,
              snapshot.modeTone === "danger" && styles.modeTextDanger
            ]}
          >
            {snapshot.mode}
          </Text>
        </View>
      </View>

      <View style={styles.heroLatencyBlock}>
        <Text style={[styles.heroLatencyLabel, font("body", fontsReady)]}>Độ trễ hệ thống</Text>
        <View style={styles.heroLatencyRow}>
          <Text
            style={[
              type.display,
              font("monoStrong", fontsReady),
              styles.heroLatencyValue,
              { color: hasLatency ? colors.textHi : colors.textLo }
            ]}
          >
            {hasLatency ? snapshot.systemLatencyMs : "—"}
          </Text>
          {hasLatency && <Text style={[styles.heroLatencyUnit, font("mono", fontsReady)]}>ms</Text>}
        </View>
      </View>
    </View>
  );
}

function ArmChannelCard({ channel, fontsReady }: { channel: ArmChannel; fontsReady: boolean }) {
  const connectionTone: Tone = channel.connected ? "ok" : "danger";
  const statusLabel = channel.connected ? "Đã kết nối" : "Mất kết nối";
  const calibratedLabel = !channel.connected ? "—" : channel.calibrated ? "Có" : "Chưa";
  const calibratedTone: Tone = !channel.connected ? "neutral" : channel.calibrated ? "ok" : "caution";

  return (
    <View style={styles.armCard}>
      <View style={styles.armHeaderRow}>
        <View style={[styles.dot, styles.dotSmall, { backgroundColor: toneColor[connectionTone] }]} />
        <Text style={[styles.armLabel, font("display", fontsReady)]}>{channel.label}</Text>
      </View>
      <Text style={[styles.armStatus, font("body", fontsReady), { color: toneColor[connectionTone] }]}>
        {statusLabel}
      </Text>

      <View style={styles.armRows}>
        <View style={styles.armRow}>
          <Text style={[styles.armRowLabel, font("body", fontsReady)]}>Cổng</Text>
          <Text style={[styles.armRowValue, font("mono", fontsReady)]}>{channel.port}</Text>
        </View>
        <View style={styles.armRow}>
          <Text style={[styles.armRowLabel, font("body", fontsReady)]}>Độ trễ</Text>
          <Text style={[styles.armRowValue, font("monoStrong", fontsReady)]}>
            {channel.latencyMs !== null ? `${channel.latencyMs} ms` : "—"}
          </Text>
        </View>
        <View style={styles.armRow}>
          <Text style={[styles.armRowLabel, font("body", fontsReady)]}>Hiệu chỉnh</Text>
          <Text style={[styles.armRowValue, font("display", fontsReady), { color: toneColor[calibratedTone] }]}>
            {calibratedLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ReadinessCard({ snapshot, fontsReady }: { snapshot: StatusSnapshot; fontsReady: boolean }) {
  const cameraTone: Tone =
    snapshot.camerasOnline === snapshot.camerasTotal ? "ok" : snapshot.camerasOnline === 0 ? "danger" : "caution";

  const rows: { label: string; value: string; tone: Tone }[] = [
    { label: "Kết nối", value: snapshot.connectionLabel, tone: snapshot.connectionTone },
    { label: "Hiệu chỉnh", value: snapshot.calibrationLabel, tone: snapshot.calibrationTone },
    { label: "Chế độ điều khiển", value: snapshot.mode, tone: snapshot.modeTone },
    { label: "Camera", value: `${snapshot.camerasOnline}/${snapshot.camerasTotal} hoạt động`, tone: cameraTone },
    { label: "Robot", value: snapshot.robotLabel, tone: snapshot.robotTone }
  ];

  return (
    <View style={styles.readinessCard}>
      <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Trạng thái điều khiển</Text>

      <View>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.readinessRow, index > 0 && styles.readinessRowDivider]}>
            <Text style={[styles.readinessLabel, font("body", fontsReady)]}>{row.label}</Text>
            <Text style={[styles.readinessValue, font("display", fontsReady), { color: toneColor[row.tone] }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProfileCard({ fontsReady }: { fontsReady: boolean }) {
  const rows = [
    { label: "Model", value: "SO-ARM101" },
    { label: "Cấu hình", value: "Dual Arm" },
    { label: "Firmware", value: "Mock" },
    { label: "Phiên bản app", value: "0.1.0" }
  ];

  return (
    <View style={styles.profileCard}>
      <Text style={[styles.profileTitle, font("display", fontsReady)]}>Hồ sơ hệ thống</Text>

      <View>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.profileRow, index > 0 && styles.profileRowDivider]}>
            <Text style={[styles.profileLabel, font("body", fontsReady)]}>{row.label}</Text>
            <Text style={[styles.profileValue, font("mono", fontsReady)]}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LoadingState({ fontsReady }: { fontsReady: boolean }) {
  return (
    <View style={styles.loadingWrap}>
      <Text style={[styles.loadingCaption, font("body", fontsReady)]}>Đang đồng bộ trạng thái hệ thống…</Text>
      <View style={[styles.skeletonBlock, styles.skeletonHero]} />
      <View style={[styles.skeletonBlock, styles.skeletonRow]} />
      <View style={[styles.skeletonBlock, styles.skeletonRow]} />
    </View>
  );
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.round
  },
  dotSmall: {
    width: 8,
    height: 8
  },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.lg,
    gap: spacing.lg
  },
  heroCardDanger: {
    borderColor: colors.danger
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  heroStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1
  },
  heroLabel: {
    ...type.title,
    flexShrink: 1
  },
  modePill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 34,
    paddingHorizontal: spacing.sm
  },
  modePillOk: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  modePillDanger: {
    borderColor: colors.danger
  },
  modeText: {
    ...type.label,
    color: colors.textHi
  },
  modeTextOk: {
    color: colors.accentText
  },
  modeTextDanger: {
    color: colors.danger
  },
  heroLatencyBlock: {
    gap: spacing.xxs
  },
  heroLatencyLabel: {
    ...type.small,
    color: colors.textLo
  },
  heroLatencyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xxs
  },
  heroLatencyValue: {
    letterSpacing: 0
  },
  heroLatencyUnit: {
    ...type.mono,
    color: colors.textLo,
    paddingBottom: spacing.xs
  },

  // Follower / Leader
  armShell: {
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.sm
  },
  armShellRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  armCard: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS_INNER,
    padding: spacing.md,
    gap: spacing.sm,
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 140
  },
  armHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  armLabel: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  armStatus: {
    ...type.small
  },
  armRows: {
    gap: spacing.xs,
    marginTop: spacing.xxs
  },
  armRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  armRowLabel: {
    ...type.small,
    color: colors.textLo
  },
  armRowValue: {
    ...type.small,
    color: colors.textHi
  },

  // Readiness
  readinessCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.lg,
    gap: spacing.md
  },
  sectionTitle: {
    ...type.bodyStrong,
    color: colors.textHi
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: spacing.xs
  },
  readinessRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1
  },
  readinessLabel: {
    ...type.body,
    color: colors.textLo
  },
  readinessValue: {
    ...type.bodyStrong
  },

  // Profile
  profileCard: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: CARD_RADIUS_INNER,
    padding: spacing.lg,
    gap: spacing.sm
  },
  profileTitle: {
    ...type.label,
    color: colors.textLo
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    paddingVertical: spacing.xxs
  },
  profileRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1
  },
  profileLabel: {
    ...type.small,
    color: colors.textLo
  },
  profileValue: {
    ...type.small,
    color: colors.textHi
  },

  // Loading
  loadingWrap: {
    gap: spacing.md
  },
  loadingCaption: {
    ...type.small,
    color: colors.textLo,
    textAlign: "center"
  },
  skeletonBlock: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: CARD_RADIUS_OUTER
  },
  skeletonHero: {
    height: 150
  },
  skeletonRow: {
    height: 96
  }
});
