import { ArrowRight, User } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { FeaturedTaskCard } from "../components/FeaturedTaskCard";
import { HomeToolsList } from "../components/home/HomeToolsList";
import { RobotHero } from "../components/home/RobotHero";
import { RobotReadinessCard } from "../components/home/RobotReadinessCard";
import { SkySection, SkyText } from "../components/ui";
import { getActiveArms, RobotReadiness } from "../data/robot";
import { getTasks, Task } from "../data/tasks";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { useSkyNexTokens } from "../design-system/tokens";
import { useRobotSetup, useRobotSummary } from "../hooks/useRobotSummary";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";

// "robot" opens the Robot tab (its hub); the others are the readiness card's
// contextual steps and the Vision tab.
export type HomeRoute = "robot" | "connect" | "calibrate" | "teleop" | "phone-teleop" | "camera";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  isRobotMotionActive?: boolean;
  // Opens the Profile tab (account and appearance live there).
  onOpenAccount: () => void;
  onOpenTask: (taskId: string) => void;
  reduceMotion: boolean;
  onOpenRoute: (route: HomeRoute) => void;
  onOpenStatus: () => void;
  onOpenTasksLibrary: () => void;
};

// One quiet line about the active setup, only when it has several arms —
// never a per-arm list (that is Status). Counts come from the shared setup;
// the state itself is the shared readiness.
function describeSetup(readiness: RobotReadiness | undefined, arms: ReturnType<typeof getActiveArms>): string | null {
  if (arms.length < 2 || !readiness) return null;
  const connected = arms.filter((arm) => arm.connected).length;
  const uncalibrated = arms.filter((arm) => !arm.calibrated).length;
  if (readiness === "offline" && connected > 0) return `${connected}/${arms.length} tay đã kết nối`;
  if (readiness === "needs-calibration") return `${uncalibrated} tay cần hiệu chỉnh`;
  return `${arms.length} tay trong hệ thống`;
}

// Home — the calm starting point: who the robot is (RobotHero), whether it
// is ready and the one next step (RobotReadinessCard), what it can do
// (Skills), and the two other places to go (Robot, Vision). Profile is the
// avatar. No metrics, feeds or previews that aren't real.
export function HomeScreen({
  emergencyStopped,
  fontsReady,
  isRobotMotionActive = false,
  onOpenAccount,
  onOpenRoute,
  onOpenStatus,
  onOpenTask,
  onOpenTasksLibrary,
  reduceMotion
}: Props) {
  const { colors } = useSkyNexTokens();
  const summary = useRobotSummary({ emergencyStopped });
  const setup = useRobotSetup();
  const arms = useMemo(() => getActiveArms(setup), [setup]);
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

  return (
    <ScrollView
      contentContainerStyle={homeStyles.screenContent}
      showsVerticalScrollIndicator={false}
      style={[homeStyles.screen, { backgroundColor: colors.background }]}
    >
      {/*
        Foreground layer: RobotHero's canvas extends HERO_PRESENTATION_CROP
        above its own box and becomes visible once the robot is interacted
        with, so this row is stacked above it (see homeStyles.topRow). The row
        itself takes no touches (box-none) — only the label and avatar sit
        above the hero, so drags elsewhere still reach the robot.
      */}
      <View pointerEvents="box-none" style={homeStyles.topRow}>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} style={homeStyles.brand} variant="sectionTitle">
          SkyNex
        </SkyText>
        <Pressable
          accessibilityHint="Mở Hồ sơ: tài khoản và giao diện"
          accessibilityLabel="Hồ sơ"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onOpenAccount}
          style={({ pressed }) => [
            homeStyles.avatar,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            pressed && homeStyles.pressed
          ]}
        >
          <User color={colors.textSecondary} size={18} strokeWidth={2} />
        </Pressable>
      </View>

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
          onOpenControl={() => onOpenRoute("teleop")}
          onOpenStatus={onOpenStatus}
          setupNote={describeSetup(summary.readiness, arms)}
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
            snapToInterval={featuredCardWidth + space.sm}
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

      <SkySection fontsReady={fontsReady} title="Khám phá">
        <HomeToolsList fontsReady={fontsReady} onOpenRoute={onOpenRoute} />
      </SkySection>
    </ScrollView>
  );
}

const homeStyles = StyleSheet.create({
  screen: {
    flex: 1
  },
  // Painted above RobotHero's upward canvas overflow (a later sibling, so it
  // would otherwise draw on top). zIndex orders siblings on iOS, Android and
  // web; `position: "relative"` makes it apply on web. No background, so no
  // visible band — only the label and avatar stay on top.
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 2
  },
  brand: {
    letterSpacing: 0.2
  },
  avatar: {
    alignItems: "center",
    borderRadius: corner.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  screenContent: {
    gap: layout.sectionGap,
    paddingBottom: space.xxxl + layout.floatingEStopClearance,
    paddingHorizontal: layout.screenGutter,
    paddingTop: space.lg
  },
  featuredRow: {
    gap: space.sm,
    paddingRight: layout.screenGutter
  },
  seeAll: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xxs
  },
  pressed: {
    opacity: 0.78
  }
});
