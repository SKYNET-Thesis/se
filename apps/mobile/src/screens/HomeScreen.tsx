import { ArrowRight, Bot, Check, Radio, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { FeaturedTaskCard } from "../components/FeaturedTaskCard";
import { HomeToolsList } from "../components/home/HomeToolsList";
import { RobotHero } from "../components/home/RobotHero";
import { RobotReadinessCard } from "../components/home/RobotReadinessCard";
import { SkySection, SkyText } from "../components/ui";
import { getTasks, Task } from "../data/tasks";
import { layout } from "../design-system/spacing";
import { useSkyNexTokens } from "../design-system/tokens";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, ThemeMode, type } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { useRobotSummary } from "../hooks/useRobotSummary";

export type HomeRoute = "connect" | "calibrate" | "teleop" | "phone-teleop" | "camera";
type HomeDataState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; robot: RobotSummary }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "disabled"; reason: string };

type RobotSummary = {
  name: string;
  model: string;
  mode: "Monitor" | "Manual" | "Teleop";
  connected: boolean;
  calibrated: boolean;
  followerLatencyMs: number;
  leaderLatencyMs: number;
  activeProfile: string;
};

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  isRobotMotionActive?: boolean;
  onOpenTask: (taskId: string) => void;
  reduceMotion: boolean;
  onOpenRoute: (route: HomeRoute) => void;
  onOpenStatus: () => void;
  onOpenTasksLibrary: () => void;
};

// Mock for the (currently unmounted) HomeStatusSummary dashboard panel only.
// The live Home reads robot state from data/robot.ts.
const mockHomeState: HomeDataState = {
  kind: "success",
  robot: {
    name: "SO-ARM101",
    model: "Robot song tay",
    mode: "Monitor",
    connected: true,
    calibrated: true,
    followerLatencyMs: 12,
    leaderLatencyMs: 14,
    activeProfile: "SO101-LAB-A"
  }
};

// Routes that move the robot are locked while E-STOP is active; Connect and
// Camera stay available. Same rule Home has always applied.
const MOTION_ROUTES: readonly HomeRoute[] = ["calibrate", "teleop", "phone-teleop"];

// Home V2 — "your robot companion is ready": identity (RobotHero), readiness
// and the single next action (RobotReadinessCard), what it can do (Skills),
// then operator tools. This screen owns data loading and the E-STOP route
// rule; the sections below it are presentation only.
export function HomeScreen({
  emergencyStopped,
  fontsReady,
  isRobotMotionActive = false,
  onOpenRoute,
  onOpenStatus,
  onOpenTask,
  onOpenTasksLibrary,
  reduceMotion
}: Props) {
  const { colors } = useSkyNexTokens();
  const summary = useRobotSummary({ emergencyStopped });
  const [featuredTasks, setFeaturedTasks] = useState<Task[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const { width: windowWidth } = useWindowDimensions();

  const featuredCardWidth = Math.min(320, Math.max(284, Math.round(windowWidth * 0.74)));
  const featuredCardHeight = windowWidth < 390 ? 196 : 204;


  useEffect(() => {
    let mounted = true;

    getTasks().then((tasks) => {
      if (mounted) setFeaturedTasks(tasks.slice(0, 3));
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

  const handleToggleFeaturedFavorite = (taskId: string) => {
    setFavoriteIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
    void toggleFavorite(taskId).then(setFavoriteIds);
  };

  const disabledRoutes = emergencyStopped ? MOTION_ROUTES : [];

  return (
    <ScrollView
      contentContainerStyle={homeStyles.screenContent}
      showsVerticalScrollIndicator={false}
      style={[homeStyles.screen, { backgroundColor: colors.background }]}
    >
      <RobotHero
        fontsReady={fontsReady}
        headline={summary?.headline ?? ""}
        isRobotMotionActive={isRobotMotionActive}
        name={summary?.name ?? "SO-ARM101"}
        reduceMotion={reduceMotion}
      />

      {summary && (
        <RobotReadinessCard
          fontsReady={fontsReady}
          onCalibrate={() => onOpenRoute("calibrate")}
          onConnect={() => onOpenRoute("connect")}
          onOpenSkill={onOpenTask}
          onOpenSkillsLibrary={onOpenTasksLibrary}
          onOpenStatus={onOpenStatus}
          summary={summary}
        />
      )}

      {featuredTasks.length > 0 && (
        <SkySection
          action={
            <Pressable
              accessibilityLabel="Xem tất cả kỹ năng"
              accessibilityRole="button"
              // Sits on the title line, so it takes no extra height — the
              // slop brings the touch target to ≥44pt instead.
              hitSlop={{ bottom: 12, left: 8, right: 8, top: 12 }}
              onPress={onOpenTasksLibrary}
              style={({ pressed }) => [homeStyles.seeAll, pressed && homeStyles.pressed]}
            >
              <SkyText fontsReady={fontsReady} style={{ color: colors.accentInk }} variant="status">
                Xem tất cả
              </SkyText>
              <ArrowRight color={colors.accentInk} size={15} />
            </Pressable>
          }
          fontsReady={fontsReady}
          subtitle="Chọn một kỹ năng để bắt đầu"
          title="Skills"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={homeStyles.featuredRow}
            decelerationRate="fast"
            snapToInterval={featuredCardWidth + spacing.md}
            snapToAlignment="start"
          >
            {featuredTasks.map((task) => (
              <FeaturedTaskCard
                cardHeight={featuredCardHeight}
                cardWidth={featuredCardWidth}
                fontsReady={fontsReady}
                isFavorite={favoriteIds.includes(task.id)}
                key={task.id}
                onPress={() => onOpenTask(task.id)}
                onToggleFavorite={() => handleToggleFeaturedFavorite(task.id)}
                task={task}
              />
            ))}
          </ScrollView>
        </SkySection>
      )}

      <SkySection fontsReady={fontsReady} subtitle="Điều khiển và thiết lập robot" title="Tools">
        <HomeToolsList disabledRoutes={disabledRoutes} fontsReady={fontsReady} onOpenRoute={onOpenRoute} />
      </SkySection>
    </ScrollView>
  );
}

const homeStyles = StyleSheet.create({
  screen: {
    flex: 1
  },
  screenContent: {
    gap: layout.sectionGap,
    paddingBottom: layout.sectionGap,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.lg
  },
  featuredRow: {
    gap: spacing.sm,
    paddingRight: layout.screenGutter
  },
  seeAll: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs
  },
  pressed: {
    opacity: 0.78
  }
});

export function HomeStatusSummary({
  emergencyStopped,
  fontsReady
}: {
  emergencyStopped: boolean;
  fontsReady: boolean;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const state = emergencyStopped
    ? ({ kind: "disabled", reason: "Hệ thống đang ở trạng thái E-STOP." } satisfies HomeDataState)
    : mockHomeState;

  return renderHomeState(state, fontsReady, colors, styles);
}

function renderHomeState(
  state: HomeDataState,
  fontsReady: boolean,
  colors: ThemeColors,
  styles: ReturnType<typeof createStyles>
) {
  switch (state.kind) {
    case "idle":
      return (
        <StatePanel
          fontsReady={fontsReady}
          icon={<Radio size={18} color={colors.textSecondary} />}
          styles={styles}
          title="Chưa có phiên vận hành"
          tone="neutral"
          value="Idle"
        />
      );
    case "loading":
      return (
        <StatePanel
          fontsReady={fontsReady}
          icon={<Radio size={18} color={colors.caution} />}
          styles={styles}
          title="Đang đọc trạng thái robot"
          tone="caution"
          value="Loading"
        />
      );
    case "error":
      return (
        <StatePanel
          body={state.message}
          fontsReady={fontsReady}
          icon={<TriangleAlert size={18} color={colors.danger} />}
          styles={styles}
          title="Không đọc được robot"
          tone="danger"
          value="Error"
        />
      );
    case "empty":
      return (
        <StatePanel
          body="Chưa chọn robot trong workspace."
          fontsReady={fontsReady}
          icon={<Bot size={18} color={colors.textSecondary} />}
          styles={styles}
          title="Không có robot"
          tone="neutral"
          value="Empty"
        />
      );
    case "disabled":
      return (
        <StatePanel
          body={state.reason}
          fontsReady={fontsReady}
          icon={<ShieldAlert size={18} color={colors.danger} />}
          styles={styles}
          title="Vận hành đã dừng"
          tone="danger"
          value="Stopped"
        />
      );
    case "success":
      return <StatusPanel fontsReady={fontsReady} robot={state.robot} styles={styles} />;
  }
}

function StatusPanel({
  robot,
  fontsReady,
  styles
}: {
  robot: RobotSummary;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.statusPanel}>
      <View style={styles.statusHeader}>
        <View>
          <Text style={[styles.panelTitle, font("display", fontsReady)]}>Trạng thái tổng</Text>
          <Text style={[styles.panelCaption, font("body", fontsReady)]}>Dữ liệu mock, chưa nối thiết bị thật</Text>
        </View>
        <View style={styles.readyPill}>
          <Check size={14} color={styles.readyText.color} />
          <Text style={[styles.readyText, font("display", fontsReady)]}>Sẵn sàng</Text>
        </View>
      </View>

      <View style={styles.statusGrid}>
        <StatusMetric
          fontsReady={fontsReady}
          label="Kết nối"
          styles={styles}
          value={robot.connected ? "Online" : "Offline"}
        />
        <StatusMetric fontsReady={fontsReady} label="Calibrate" styles={styles} value={robot.calibrated ? "OK" : "Chưa"} />
        <StatusMetric fontsReady={fontsReady} label="Chế độ" styles={styles} value={robot.mode} />
        <StatusMetric fontsReady={fontsReady} label="Hồ sơ" styles={styles} value={robot.activeProfile} wide />
      </View>

      <View style={styles.latencyRow}>
        <Text style={[styles.latencyText, font("mono", fontsReady)]}>Follower {robot.followerLatencyMs} ms</Text>
        <Text style={[styles.latencyText, font("mono", fontsReady)]}>Leader {robot.leaderLatencyMs} ms</Text>
      </View>
    </View>
  );
}

function StatusMetric({
  label,
  value,
  wide,
  fontsReady,
  styles
}: {
  label: string;
  value: string;
  wide?: boolean;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.metric, wide && styles.metricWide]}>
      <Text style={[styles.metricLabel, font("body", fontsReady)]}>{label}</Text>
      <Text style={[styles.metricValue, font(label === "Hồ sơ" ? "monoStrong" : "display", fontsReady)]}>{value}</Text>
    </View>
  );
}

function StatePanel({
  icon,
  title,
  value,
  body,
  tone,
  fontsReady,
  styles
}: {
  icon: ReactNode;
  title: string;
  value: string;
  body?: string;
  tone: "neutral" | "caution" | "danger";
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.statePanel, tone === "danger" && styles.statePanelDanger]}>
      <View style={styles.stateTitleRow}>
        {icon}
        <Text style={[styles.panelTitle, font("display", fontsReady)]}>{title}</Text>
        <Text
          style={[
            styles.stateValue,
            tone === "caution" && styles.stateValueCaution,
            tone === "danger" && styles.stateValueDanger,
            font("monoStrong", fontsReady)
          ]}
        >
          {value}
        </Text>
      </View>
      {body && <Text style={[styles.panelCaption, font("body", fontsReady)]}>{body}</Text>}
    </View>
  );
}

// Styles for the retained HomeStatusSummary dashboard panel above.
function createStyles(colors: ThemeColors, mode: ThemeMode) {
  return StyleSheet.create({
    statusPanel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: spacing.lg,
      padding: spacing.md
    },
    statusHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between"
    },
    panelTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    panelCaption: {
      ...type.small,
      color: colors.textSecondary,
      marginTop: spacing.xxs
    },
    readyPill: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.button,
      flexDirection: "row",
      gap: spacing.xs,
      minHeight: 34,
      paddingHorizontal: spacing.sm
    },
    readyText: {
      ...type.label,
      color: colors.accentForeground
    },
    statusGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    metric: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      gap: spacing.xs,
      minHeight: 78,
      padding: spacing.sm
    },
    metricWide: {
      flexBasis: "100%"
    },
    metricLabel: {
      ...type.small,
      color: colors.textSecondary
    },
    metricValue: {
      ...type.label,
      color: colors.textPrimary
    },
    latencyRow: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      paddingTop: spacing.md
    },
    latencyText: {
      ...type.mono,
      color: colors.textSecondary
    },
    statePanel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md
    },
    statePanelDanger: {
      borderColor: colors.danger
    },
    stateTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    stateValue: {
      ...type.mono,
      color: colors.textSecondary,
      marginLeft: "auto"
    },
    stateValueCaution: {
      color: colors.caution
    },
    stateValueDanger: {
      color: colors.danger
    }
  });
}
