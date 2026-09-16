import { Boxes, ChefHat, ChevronRight, Grip, Heart, LayoutGrid, Utensils } from "lucide-react-native";
import { ComponentType, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { Task } from "../data/tasks";
import { font, radius, spacing, ThemeColors, type } from "../theme";
import { TaskStatusChip } from "./TaskStatusChip";

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

// theme.ts tops out at radius.card (16) — matches the larger, softer corner
// Home/Teleop/Connect/Calibrate/Camera already established for this app's
// "rich card" surfaces, kept identical here so Tasks reads as the same
// product.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 18;

const TASK_ICON_MAP: Record<string, IconComponent> = {
  utensils: Utensils,
  grip: Grip,
  "chef-hat": ChefHat,
  boxes: Boxes
};

// Falls back to a generic icon for any icon key the UI doesn't recognize
// yet — keeps an unexpected/future value from a real API from breaking
// the card instead of matching nothing.
export function getTaskIcon(icon?: string): IconComponent {
  return (icon && TASK_ICON_MAP[icon]) || LayoutGrid;
}

function TaskVisual({
  colors,
  compact,
  styles,
  task
}: {
  colors: ThemeColors;
  compact?: boolean;
  styles: ReturnType<typeof createStyles>;
  task: Task;
}) {
  const Icon = getTaskIcon(task.icon);
  const tileStyle = compact ? styles.compactMediaTile : styles.mediaTile;

  if (task.imageUrl) {
    return (
      <View style={tileStyle}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: task.imageUrl }}
          style={styles.mediaImage}
        />
      </View>
    );
  }

  return (
    <View style={tileStyle}>
      <Icon color={colors.textPrimary} size={compact ? 22 : 26} />
    </View>
  );
}

type TaskCardProps = {
  fontsReady: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  task: Task;
};

// Full row card for the Tasks library screen: icon + name + description,
// a favorite toggle, and a status-aware "Xem" affordance.
export function TaskCard({ fontsReady, isFavorite, onPress, onToggleFavorite, task }: TaskCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Xem tác vụ ${task.name}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.cardTopRow}>
          <TaskVisual colors={colors} styles={styles} task={task} />
          <View style={styles.cardTextBlock}>
            <Text style={[styles.cardName, font("display", fontsReady)]}>{task.name}</Text>
            <Text numberOfLines={2} style={[styles.cardDescription, font("body", fontsReady)]}>
              {task.description}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottomRow}>
          <TaskStatusChip fontsReady={fontsReady} size="sm" status={task.status} />
          <View style={styles.viewChip}>
            <Text style={[styles.viewChipText, font("display", fontsReady)]}>Xem</Text>
            <ChevronRight color={colors.textPrimary} size={16} />
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={isFavorite ? `Bỏ yêu thích ${task.name}` : `Yêu thích ${task.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggleFavorite}
        style={({ pressed }) => [styles.favoriteButton, pressed && styles.pressed]}
      >
        <Heart
          color={isFavorite ? colors.accentStrong : colors.textSecondary}
          fill={isFavorite ? colors.accentStrong : "none"}
          size={18}
        />
      </Pressable>
    </View>
  );
}

type CompactTaskCardProps = {
  fontsReady: boolean;
  onPress: () => void;
  task: Task;
};

// Compact tile for Home's "Tác vụ nổi bật" strip — icon, name, status only,
// no favorite/Xem controls (kept minimal so the strip stays "gọn").
export function CompactTaskCard({ fontsReady, onPress, task }: CompactTaskCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityLabel={`Mở tác vụ ${task.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}
    >
      <TaskVisual colors={colors} compact styles={styles} task={task} />
      <Text numberOfLines={1} style={[styles.compactName, font("display", fontsReady)]}>
        {task.name}
      </Text>
      <TaskStatusChip fontsReady={fontsReady} size="sm" status={task.status} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: CARD_RADIUS_OUTER,
      borderWidth: 1,
      padding: spacing.md
    },
    cardTopRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingRight: spacing.xxl
    },
    mediaTile: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: CARD_RADIUS_INNER,
      height: 56,
      justifyContent: "center",
      overflow: "hidden",
      width: 56
    },
    cardTextBlock: {
      flex: 1,
      gap: spacing.xxs,
      minWidth: 0
    },
    cardName: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    cardDescription: {
      ...type.small,
      color: colors.textSecondary
    },
    cardBottomRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      marginTop: spacing.sm
    },
    viewChip: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.round,
      flexDirection: "row",
      gap: spacing.xxs,
      minHeight: 32,
      paddingHorizontal: spacing.sm
    },
    viewChipText: {
      ...type.label,
      color: colors.textPrimary
    },
    favoriteButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.round,
      height: 36,
      justifyContent: "center",
      position: "absolute",
      right: spacing.md,
      top: spacing.md,
      width: 36
    },
    pressed: {
      opacity: 0.85
    },
    compactCard: {
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: CARD_RADIUS_INNER,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.sm,
      width: 144
    },
    compactMediaTile: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.button,
      height: 76,
      justifyContent: "center",
      overflow: "hidden",
      width: "100%"
    },
    mediaImage: {
      height: "100%",
      width: "100%"
    },
    compactName: {
      ...type.label,
      color: colors.textPrimary
    }
  });
}
