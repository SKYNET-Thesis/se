import { Check, Circle, Clock } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { TaskStatus } from "../data/tasks";
import { font, radius, spacing, ThemeColors, type } from "../theme";

// Single source of truth for the Vietnamese status word — read by the chip
// below, and also imported directly by screens that need the word alone
// (e.g. building an accessibilityLabel like "<name>, <status>").
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  ready: "Sẵn sàng",
  training: "Đang huấn luyện",
  coming_soon: "Sắp có"
};

type TaskStatusChipProps = {
  status: TaskStatus;
  size?: "sm" | "md";
  fontsReady?: boolean;
};

// One shared semantic chip for task status, at two sizes: "sm" for
// FeaturedTaskCard/TaskCard (compact, never dominates the card) and "md" for
// TaskDetail (the original, already-approved Detail proportions). Every size
// shares the same visual grammar — neutral surfaceSecondary/border shell,
// signal carried by the icon color only, label text always shown so status
// never relies on color alone — so a task's status reads as the same
// component family everywhere instead of three different-looking badges.
// READY never gets a filled-lime treatment: the one dominant lime element on
// any screen is the "Chạy tác vụ" CTA, not this chip.
export function TaskStatusChip({ status, size = "md", fontsReady = true }: TaskStatusChipProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const label = TASK_STATUS_LABEL[status];
  // accentStrong (not accent) — this icon sits directly on the chip's
  // surface, and bare lime is close to invisible against Light's near-white
  // surfaces (~1.3:1). accentStrong is the same lime family, deepened only
  // on Light; on Dark it equals accent exactly, so this chip is unchanged.
  const iconColor = status === "ready" ? colors.accentStrong : status === "training" ? colors.caution : colors.textSecondary;
  const textColor = status === "coming_soon" ? colors.textSecondary : colors.textPrimary;
  const isSmall = size === "sm";
  const Icon = status === "ready" ? Check : status === "training" ? Clock : Circle;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      style={[styles.chip, isSmall ? styles.chipSm : styles.chipMd]}
    >
      <Icon color={iconColor} size={isSmall ? 11 : 13} strokeWidth={2} />
      <Text style={[isSmall ? styles.textSm : styles.textMd, { color: textColor }, font("display", fontsReady)]}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      flexDirection: "row"
    },
    // Compact card placement (FeaturedTaskCard, TaskCard). No spacing token
    // lands exactly on this scale, so these four numbers are the chip's own
    // deliberately small, fixed proportions rather than reused tokens.
    chipSm: {
      gap: 4,
      height: 22,
      paddingHorizontal: 7
    },
    // TaskDetail's original, approved proportions — paddingHorizontal is the
    // one dimension that does land on an existing token (spacing.xs = 8).
    chipMd: {
      gap: 6,
      height: 28,
      paddingHorizontal: spacing.xs
    },
    textSm: {
      fontSize: 11,
      lineHeight: 14
    },
    textMd: {
      ...type.small
    }
  });
}
