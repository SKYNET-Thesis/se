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
  onOpenSkill: (taskId: string) => void;
  onOpenSkillsLibrary: () => void;
  onOpenStatus: () => void;
  summary: RobotSummary;
};



// Robot state + the single next action. The CTA always matches the first
// unmet readiness gate (see data/robot.ts), so the one lime action on Home
// is never "drive it yourself" — manual control lives in HomeToolsList.
export function RobotReadinessCard({
  fontsReady,
  onCalibrate,
  onConnect,
  onOpenSkill,
  onOpenSkillsLibrary,
  onOpenStatus,
  summary
}: Props) {
  const { colors } = useSkyNexTokens();
  const cta = resolveCta(summary, { onCalibrate, onConnect, onOpenSkill, onOpenSkillsLibrary });

  return (
    <SkyCard style={styles.card}>
      <View style={styles.headerRow}>
        <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[summary.readiness]} status={summary.status} />
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
          <SkyText fontsReady={fontsReady} style={{ color: colors.accentInk }} variant="status">
            Trạng thái
          </SkyText>
          <ChevronRight color={colors.accentInk} size={14} />
        </Pressable>
      </View>

      <SkyText fontsReady={fontsReady} tone="secondary" variant="body">
        {summary.message}
      </SkyText>

      <SkyButton
        accessibilityHint={cta.hint}
        disabled={cta.disabled}
        fontsReady={fontsReady}
        onPress={cta.onPress}
        size="lg"
        style={styles.cta}
      >
        {cta.label}
      </SkyButton>
    </SkyCard>
  );
}

function resolveCta(
  summary: RobotSummary,
  actions: Pick<Props, "onCalibrate" | "onConnect" | "onOpenSkill" | "onOpenSkillsLibrary">
) {
  const skill = summary.suggestedSkill;
  // "Bắt đầu", not "Chạy": the CTA opens the skill's detail screen, where
  // the actual run happens — the label must not promise immediate motion.
  const runSkill = skill
    ? {
        label: `Bắt đầu ${skill.name}`,
        hint: `Mở ${skill.name} để xem và chạy kỹ năng`,
        onPress: () => actions.onOpenSkill(skill.id)
      }
    : { label: "Xem kỹ năng", hint: "Mở thư viện kỹ năng", onPress: actions.onOpenSkillsLibrary };

  switch (summary.readiness) {
    case "offline":
      return { label: "Kết nối robot", hint: "Mở màn hình kết nối", onPress: actions.onConnect, disabled: false };
    case "needs-calibration":
      return { label: "Hiệu chỉnh", hint: "Mở màn hình hiệu chỉnh", onPress: actions.onCalibrate, disabled: false };
    case "stopped":
      // Same action the ready state would offer, visibly unavailable — the
      // card's message explains why and how to resume.
      return { ...runSkill, hint: "Không khả dụng khi E-STOP đang bật", disabled: true };
    case "ready":
      return { ...runSkill, disabled: false };
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
    marginTop: layout.hairlineGap
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
