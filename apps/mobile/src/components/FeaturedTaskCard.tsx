import { ChevronRight, Heart } from "lucide-react-native";
import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { Task } from "../data/tasks";
import { font, radius, spacing, ThemeColors, type } from "../theme";
import { getTaskIcon } from "./TaskCard";
import { TASK_STATUS_LABEL, TaskStatusChip } from "./TaskStatusChip";

type Props = {
  cardHeight: number;
  cardWidth: number;
  fontsReady: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  task: Task;
};

export function FeaturedTaskCard({
  cardHeight,
  cardWidth,
  fontsReady,
  isFavorite,
  onPress,
  onToggleFavorite,
  task
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, { height: cardHeight, width: cardWidth }]}>
      <Pressable
        accessibilityLabel={`${task.name}, ${TASK_STATUS_LABEL[task.status]}. Xem chi tiết tác vụ`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <View style={styles.visualFrame}>
          <TaskVisual colors={colors} styles={styles} task={task} />
          <View style={styles.statusOverlay}>
            <TaskStatusChip fontsReady={fontsReady} size="sm" status={task.status} />
          </View>
        </View>

        <View style={styles.contentRow}>
          <View style={styles.textBlock}>
            <Text numberOfLines={1} style={[styles.name, font("display", fontsReady)]}>
              {task.name}
            </Text>
            <Text numberOfLines={2} style={[styles.description, font("body", fontsReady)]}>
              {task.description}
            </Text>
          </View>

          <View style={styles.viewAction}>
            <Text style={[styles.viewText, font("display", fontsReady)]}>Xem</Text>
            <ChevronRight color={colors.accentStrong} size={16} />
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={isFavorite ? `Bỏ yêu thích ${task.name}` : `Yêu thích ${task.name}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite }}
        hitSlop={4}
        onPress={onToggleFavorite}
        style={({ pressed }) => [styles.favoriteButton, pressed && styles.pressed]}
      >
        <Heart
          color={isFavorite ? colors.accentStrong : colors.textPrimary}
          fill={isFavorite ? colors.accentStrong : "none"}
          size={19}
        />
      </Pressable>
    </View>
  );
}

function TaskVisual({
  colors,
  styles,
  task
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  task: Task;
}) {
  const Icon = getTaskIcon(task.icon);

  if (shouldRenderImage(task.imageUrl)) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={{ uri: task.imageUrl }}
        style={styles.image}
      />
    );
  }

  const ready = task.status === "ready";

  return (
    <View style={styles.fallbackVisual}>
      <View style={[styles.iconPlate, ready && { borderColor: colors.accentStrong }]}>
        <Icon color={colors.textPrimary} size={48} strokeWidth={1.6} />
      </View>
    </View>
  );
}

function shouldRenderImage(imageUrl?: string) {
  return !!imageUrl && !/placehold|placeholder|dummyimage/i.test(imageUrl);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      overflow: "hidden"
    },
    cardBody: {
      flex: 1,
      padding: spacing.sm
    },
    visualFrame: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 116,
      justifyContent: "center",
      overflow: "hidden"
    },
    image: {
      height: "100%",
      width: "100%"
    },
    fallbackVisual: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center"
    },
    iconPlate: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 92,
      justifyContent: "center",
      width: 92
    },
    statusOverlay: {
      left: spacing.sm,
      position: "absolute",
      top: spacing.sm
    },
    favoriteButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      position: "absolute",
      right: spacing.sm,
      top: spacing.sm,
      width: 44
    },
    contentRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm
    },
    textBlock: {
      flex: 1,
      gap: spacing.xxs,
      minWidth: 0
    },
    name: {
      color: colors.textPrimary,
      fontSize: 19,
      fontWeight: "700",
      lineHeight: 24
    },
    description: {
      ...type.small,
      color: colors.textSecondary
    },
    viewAction: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      minHeight: 32,
      paddingLeft: spacing.xs
    },
    viewText: {
      ...type.label,
      color: colors.textSecondary
    },
    pressed: {
      opacity: 0.82
    }
  });
}
