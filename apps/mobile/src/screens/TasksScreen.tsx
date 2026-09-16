import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { TaskCard } from "../components/TaskCard";
import { useAppTheme } from "../ThemeContext";
import { getTasks, Task } from "../data/tasks";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type FilterMode = "all" | "favorites";

type Props = {
  fontsReady: boolean;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
};

export function TasksScreen({ fontsReady, onBack, onOpenTask }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    let mounted = true;

    getTasks().then((data) => {
      if (mounted) setTasks(data);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getFavorites().then((ids) => {
        if (active) setFavoriteIds(ids);
      });

      return () => {
        active = false;
      };
    }, [])
  );

  const visibleTasks = useMemo(
    () => (filter === "favorites" ? tasks.filter((task) => favoriteIds.includes(task.id)) : tasks),
    [favoriteIds, filter, tasks]
  );

  const handleToggleFavorite = (taskId: string) => {
    // Optimistic update so the heart flips instantly; toggleFavorite persists
    // in the background and its resolved list is the source of truth.
    setFavoriteIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
    void toggleFavorite(taskId).then(setFavoriteIds);
  };

  return (
    <ScrollView
      accessibilityLabel="Màn hình thư viện tác vụ"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader fontsReady={fontsReady} onBack={onBack} subtitle="Chọn tác vụ cho SO-ARM101" title="Tác vụ" />

      <View style={styles.filterShell}>
        <FilterChip
          active={filter === "all"}
          fontsReady={fontsReady}
          label="Tất cả"
          onPress={() => setFilter("all")}
          styles={styles}
        />
        <FilterChip
          active={filter === "favorites"}
          fontsReady={fontsReady}
          label="Yêu thích"
          onPress={() => setFilter("favorites")}
          styles={styles}
        />
      </View>

      {visibleTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, font("body", fontsReady)]}>
            {filter === "favorites" ? "Chưa có tác vụ yêu thích." : "Chưa có tác vụ nào."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleTasks.map((task) => (
            <TaskCard
              fontsReady={fontsReady}
              isFavorite={favoriteIds.includes(task.id)}
              key={task.id}
              onPress={() => onOpenTask(task.id)}
              onToggleFavorite={() => handleToggleFavorite(task.id)}
              task={task}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function FilterChip({
  active,
  fontsReady,
  label,
  onPress,
  styles
}: {
  active: boolean;
  fontsReady: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive, font("display", fontsReady)]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxxl
    },
    filterShell: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.button,
      flexDirection: "row",
      gap: spacing.xxs,
      padding: spacing.xxs
    },
    filterChip: {
      alignItems: "center",
      borderRadius: radius.button,
      flex: 1,
      paddingVertical: spacing.sm
    },
    // Dark-neutral structural selection instead of a lime text hint: the
    // selected filter needs to read as unmistakable at a glance, and lime
    // isn't spent on every selected state in this system — see
    // controlStrong's doc comment in theme.ts.
    filterChipActive: {
      backgroundColor: colors.controlStrong
    },
    filterChipText: {
      ...type.label,
      color: colors.textSecondary
    },
    filterChipTextActive: {
      color: colors.controlStrongForeground
    },
    list: {
      gap: spacing.md
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: spacing.xxl
    },
    emptyText: {
      ...type.body,
      color: colors.textSecondary
    }
  });
}
