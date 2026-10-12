import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { READINESS_BADGE_LABEL, RobotSummary } from "../../data/robot";
import { corner } from "../../design-system/radius";
import { layout } from "../../design-system/spacing";
import { useSkyNexTokens } from "../../design-system/tokens";
import { SkyButton, SkyCard, SkyText, StatusBadge } from "../ui";

type Props = {
  fontsReady: boolean;
  onCalibrate: () => void;
  onConnect: () => void;
  // Manual Control — it still needs its own deliberate "enable" step.
  onOpenControl: () => void;
  onOpenStatus: () => void;
  // One quiet line about a multi-arm setup ("2 tay trong hệ thống"); null
  // for a single arm. Never a per-arm list — that is Status.
  setupNote?: string | null;
  summary: RobotSummary;
};

// Home says the stopped state in words; the compact "E-STOP" badge label
// stays for the Robot screens.
const BADGE_LABEL = { ...READINESS_BADGE_LABEL, stopped: "Đã dừng khẩn cấp" };

// Robot state + the single next action. The CTA always matches the first
// unmet readiness gate (see data/robot.ts): connect, then calibrate, then —
// when ready — open Manual Control (which never arms or moves on its own;
// choosing a skill is the Skills section's job). Under E-STOP there is no
// action at all: the message explains it and Reset lives beside the
// floating E-STOP.
export function RobotReadinessCard({
  fontsReady,
  onCalibrate,
  onConnect,
  onOpenControl,
  onOpenStatus,
  setupNote,
  summary
}: Props) {
  const { colors } = useSkyNexTokens();
  const cta = resolveCta(summary, { onCalibrate, onConnect, onOpenControl });

  return (
    <SkyCard style={styles.card}>
      <View style={styles.headerRow}>
        <StatusBadge
          accessibilityLiveRegion="polite"
          fontsReady={fontsReady}
          label={BADGE_LABEL[summary.readiness]}
          status={summary.status}
        />
        {/*
          Restrained, text-only way into StatusScreen — the only entry now
          that Status isn't a bottom tab. Must never compete with the CTA.
        */}
        <Pressable
          accessibilityHint={`Xem trạng thái ${summary.name}`}
          accessibilityLabel="Trạng thái"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenStatus}
          style={({ pressed }) => [styles.statusLink, pressed && styles.pressed]}
        >
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Trạng thái
          </SkyText>
          <ChevronRight color={colors.textSecondary} size={14} />
        </Pressable>
      </View>

      <SkyText fontsReady={fontsReady} tone="secondary" variant="body">
        {summary.message}
      </SkyText>

      {setupNote && (
        <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
          {setupNote}
        </SkyText>
      )}

      {cta && (
        <SkyButton accessibilityHint={cta.hint} fontsReady={fontsReady} onPress={cta.onPress} size="lg" style={styles.cta}>
          {cta.label}
        </SkyButton>
      )}
    </SkyCard>
  );
}

function resolveCta(
  summary: RobotSummary,
  actions: Pick<Props, "onCalibrate" | "onConnect" | "onOpenControl">
) {
  switch (summary.readiness) {
    case "offline":
      return { label: "Kết nối robot", hint: "Mở màn hình kết nối", onPress: actions.onConnect };
    case "needs-calibration":
      return { label: "Hiệu chỉnh robot", hint: "Mở màn hình hiệu chỉnh", onPress: actions.onCalibrate };
    case "stopped":
      // No action: a disabled "start" would still read as an invitation to
      // move the robot. The message says what to do.
      return null;
    case "ready":
      return {
        label: "Điều khiển robot",
        hint: "Mở điều khiển thủ công. Robot chỉ di chuyển khi bạn bật điều khiển.",
        onPress: actions.onOpenControl
      };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: corner.productCard,
    gap: layout.stackGap,
    padding: layout.productCardPadding
  },
  // A little extra air above the action separates "what's going on" from
  // "what to do", without a divider.
  cta: {
    marginTop: 0
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  // Plain text+chevron, not a pill — minHeight + hitSlop keep the tap
  // target ≥44pt despite the small visual footprint.
  statusLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 32,
    paddingLeft: layout.inlineGap
  },
  pressed: {
    opacity: 0.78
  }
});
