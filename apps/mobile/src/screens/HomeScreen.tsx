import { ArrowRight, Bot, Cable, Camera, ChevronRight, Check, Hand, Radio, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArmModelViewer } from "../components/ArmModelViewer";
import { FeaturedTaskCard } from "../components/FeaturedTaskCard";
import { useAppTheme } from "../ThemeContext";
import { getTasks, Task } from "../data/tasks";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, ThemeMode, type } from "../theme";

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

// The primary pill's label follows the robot's actual readiness gate, so the
// one action worth thumb-reach always matches what the operator needs next.
const PRIMARY_LABEL: Record<HomeRoute, string> = {
  connect: "Kết nối",
  calibrate: "Hiệu chỉnh",
  teleop: "Điều khiển",
  "phone-teleop": "Phone Teleop",
  camera: "Camera"
};

const SECONDARY_LABEL: Record<HomeRoute, string> = {
  connect: "Connect",
  calibrate: "Calibrate",
  teleop: "Teleop",
  "phone-teleop": "Phone",
  camera: "Camera"
};

function renderRouteIcon(route: HomeRoute, color: string, size: number) {
  switch (route) {
    case "connect":
      return <Cable color={color} size={size} />;
    case "calibrate":
      return <RotateCcw color={color} size={size} />;
    case "teleop":
      return <Hand color={color} size={size} />;
    case "phone-teleop":
      return <Hand color={color} size={size} />;
    case "camera":
      return <Camera color={color} size={size} />;
  }
}

// GlobalChrome (single row) and the bottom tab bar are fixed heights that
// live outside this screen; sizing the hero against the space actually left
// after them keeps the title/subtitle visually tied to the thumb-zone CTAs.
const CHROME_HEIGHT = 64;
const TAB_BAR_HEIGHT = 64;
const HERO_FILL_RATIO = 0.63;
const MIN_HERO_HEIGHT = 320;

// Idle/presentation Home is a static pose shot, not a live workspace: the
// 3D camera (ArmModelViewer's fitCameraToBoundingSphere) centers the robot
// in its canvas with a fixed fit margin, leaving empty canvas space above
// it. In presentation mode we crop that dead band off the top via an
// overflow-hidden viewport — the inner hero block still measures out at
// the full, unchanged heroHeight (so ArmModelViewer never resizes and the
// robot never rescales), it's just shifted up and the surplus clipped from
// view. The crop amount is capped well below the empty band so the robot's
// own silhouette is never touched, only genuinely empty canvas.
// The moment Home drives live/real-time robot poses (isRobotMotionActive),
// the crop must be lifted entirely — a raised arm has to be able to use
// the full vertical workspace without hitting a clipped edge.
const HERO_PRESENTATION_CROP = 104;

// theme.ts tops out at radius.card (16) — the CTA cluster's "rich card" look
// calls for a deliberately larger, softer corner than the rest of the app's
// thin-bordered surfaces, so these are scoped to this cluster only.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 20;

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
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const robot = mockHomeState.kind === "success" ? mockHomeState.robot : null;
  const [featuredTasks, setFeaturedTasks] = useState<Task[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Theme mode Settings switches while Home sits unfocused in the background
  // (the only place theme changes now happen) collapses this tab's layout to
  // 0×0 — remounting ArmModelViewer right then bakes a zero-size GL context
  // that never recovers, even once the tab is visible again and its layout
  // is back to normal. Deferring which mode the remount key reflects until
  // Home is actually focused again avoids that trap without touching
  // ArmModelViewer itself: the hero keeps showing its last-mounted colors
  // while backgrounded (invisible anyway) and only remounts once this
  // screen has real layout to mount into.
  const isFocused = useIsFocused();
  const [armViewerMode, setArmViewerMode] = useState(mode);
  useEffect(() => {
    if (isFocused) setArmViewerMode(mode);
  }, [isFocused, mode]);

  // The presentation crop assumes the model sits at its canonical/default
  // orientation. Once the user drags/pinches the hero, the arm can rotate
  // into the crop band and get clipped, so any manual interaction disables
  // the crop for the rest of this Home mount — there's no reset/recenter
  // signal from ArmModelViewer to know when the view is canonical again, so
  // re-enabling the crop mid-session would risk clipping a still-rotated
  // pose. isHeroInteracting covers the live gesture; hasUserAdjustedHero
  // latches that off-state once the gesture ends.
  const [isHeroInteracting, setIsHeroInteracting] = useState(false);
  const [hasUserAdjustedHero, setHasUserAdjustedHero] = useState(false);
  const handleHeroInteractionStart = useCallback(() => {
    setIsHeroInteracting(true);
    setHasUserAdjustedHero(true);
  }, []);
  const handleHeroInteractionEnd = useCallback(() => {
    setIsHeroInteracting(false);
  }, []);

  const availableHeight = windowHeight - insets.top - insets.bottom - CHROME_HEIGHT - TAB_BAR_HEIGHT;
  const heroHeight = Math.max(MIN_HERO_HEIGHT, Math.round(availableHeight * HERO_FILL_RATIO));
  const featuredCardWidth = Math.min(320, Math.max(284, Math.round(windowWidth * 0.74)));
  const featuredCardHeight = windowWidth < 390 ? 196 : 204;
  // Full, uncropped workspace once Home drives live/real-time robot poses or
  // the user is/has been manually rotating the model; compact cropped
  // presentation pose only for the untouched, canonical idle view. See
  // HERO_PRESENTATION_CROP.
  const showFullHero = isRobotMotionActive || isHeroInteracting || hasUserAdjustedHero;
  const heroTopCrop = showFullHero ? 0 : HERO_PRESENTATION_CROP;

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

  const primaryRoute: HomeRoute = !robot?.connected ? "connect" : !robot?.calibrated ? "calibrate" : "teleop";
  const isRouteDisabled = (route: HomeRoute) =>
    (route === "calibrate" || route === "teleop" || route === "phone-teleop") && emergencyStopped;
  const secondaryRoutes = (["connect", "calibrate", "teleop", "phone-teleop", "camera"] as HomeRoute[]).filter(
    (route) => route !== primaryRoute
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, { minHeight: availableHeight }]}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <FeaturedTasksStrip
        cardHeight={featuredCardHeight}
        cardWidth={featuredCardWidth}
        colors={colors}
        favoriteIds={favoriteIds}
        fontsReady={fontsReady}
        onOpenTask={onOpenTask}
        onOpenTasksLibrary={onOpenTasksLibrary}
        onToggleFavorite={handleToggleFeaturedFavorite}
        styles={styles}
        tasks={featuredTasks}
      />

      <View
        style={[
          styles.heroViewport,
          {
            height: heroHeight - heroTopCrop,
            overflow: heroTopCrop > 0 ? "hidden" : "visible"
          }
        ]}
      >
        <View style={[styles.hero, { height: heroHeight, marginTop: -heroTopCrop }]}>
          <View style={styles.modelSlot}>
            <ArmModelViewer
              // ArmModelViewer bakes accentColor/backgroundColor/floorColor
              // into the GL scene once, at context-creation time, and never
              // re-applies them on prop changes (its render loop repaints
              // the same scene object every frame — see WebGL onContextCreate
              // internals, not touched here). Keying on theme mode forces a
              // full unmount/remount on Light/Dark switch instead, which is
              // the external, non-invasive way to get a correctly colored
              // scene without changing ArmModelViewer itself.
              key={`arm-viewer-${armViewerMode}`}
              accentColor={colors.accent}
              // Canvas fill matches the page background exactly, in both
              // modes — an earlier attempt used surfaceSecondary here for a
              // Light-only "stage," but that read as a rectangular media
              // placeholder box, not a subtle grounding. Blending the canvas
              // into the page (no seam, no box) is what actually gives the
              // robot presence without a card. Dark is unaffected since it
              // was always `background` here.
              backgroundColor={colors.background}
              compact
              floorColor={colors.surfaceSecondary}
              onInteractionEnd={handleHeroInteractionEnd}
              onInteractionStart={handleHeroInteractionStart}
              reduceMotion={reduceMotion}
              showFaults={false}
              softFloor
            />
          </View>

          <View style={styles.heroCopy}>
            <Text style={[styles.robotName, font("display", fontsReady)]}>{robot?.name ?? "SO-ARM101"}</Text>
            <Text style={[styles.robotSubtitle, font("body", fontsReady)]}>
              {robot?.model ?? "Robot song tay"}, vận hành trực tiếp
            </Text>

            {/*
              Secondary, restrained robot-context entry — must never compete
              with E-STOP or the primary CTA below. See StatusScreen's
              HomeStack route: this is the only way in now that Status isn't
              a bottom tab.
            */}
            <Pressable
              accessibilityHint="Xem trạng thái SO-ARM101"
              accessibilityLabel="Trạng thái"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onOpenStatus}
              style={({ pressed }) => [styles.statusLink, pressed && styles.pressed]}
            >
              <Text style={[styles.statusLinkText, font("display", fontsReady)]}>Trạng thái</Text>
              <ChevronRight color={colors.accentStrong} size={14} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.ctaCluster}>
        <PrimaryPill
          colors={colors}
          disabled={isRouteDisabled(primaryRoute)}
          fontsReady={fontsReady}
          label={PRIMARY_LABEL[primaryRoute]}
          onPress={() => onOpenRoute(primaryRoute)}
          styles={styles}
        />

        <View style={styles.secondaryShell}>
          <View style={styles.secondaryRow}>
            {secondaryRoutes.map((route) => (
              <SecondaryAction
                colors={colors}
                disabled={isRouteDisabled(route)}
                fontsReady={fontsReady}
                icon={(color) => renderRouteIcon(route, color, 19)}
                key={route}
                label={SECONDARY_LABEL[route]}
                onPress={() => onOpenRoute(route)}
                styles={styles}
              />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function FeaturedTasksStrip({
  cardHeight,
  cardWidth,
  colors,
  favoriteIds,
  fontsReady,
  onOpenTask,
  onOpenTasksLibrary,
  onToggleFavorite,
  styles,
  tasks
}: {
  cardHeight: number;
  cardWidth: number;
  colors: ThemeColors;
  favoriteIds: string[];
  fontsReady: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenTasksLibrary: () => void;
  onToggleFavorite: (taskId: string) => void;
  styles: ReturnType<typeof createStyles>;
  tasks: Task[];
}) {
  if (!tasks.length) return null;

  return (
    <View style={styles.featuredSection}>
      <View style={styles.featuredHeader}>
        <Text style={[styles.featuredTitle, font("display", fontsReady)]}>Tác vụ nổi bật</Text>
        <Pressable
          accessibilityLabel="Xem tất cả tác vụ"
          accessibilityRole="button"
          onPress={onOpenTasksLibrary}
          style={({ pressed }) => [styles.featuredLink, pressed && styles.pressed]}
        >
          <Text style={[styles.featuredLinkText, font("display", fontsReady)]}>Xem tất cả</Text>
          <ArrowRight color={colors.accentStrong} size={15} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featuredRow}
        decelerationRate="fast"
        snapToInterval={cardWidth + spacing.md}
        snapToAlignment="start"
      >
        {tasks.map((task) => (
          <FeaturedTaskCard
            cardHeight={cardHeight}
            cardWidth={cardWidth}
            fontsReady={fontsReady}
            isFavorite={favoriteIds.includes(task.id)}
            key={task.id}
            onPress={() => onOpenTask(task.id)}
            onToggleFavorite={() => onToggleFavorite(task.id)}
            task={task}
          />
        ))}
      </ScrollView>
    </View>
  );
}

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

function PrimaryPill({
  colors,
  label,
  disabled,
  fontsReady,
  onPress,
  styles
}: {
  colors: ThemeColors;
  label: string;
  disabled: boolean;
  fontsReady: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryPill,
        disabled && styles.primaryPillDisabled,
        focused && styles.focused,
        pressed && !disabled && styles.pillPressed
      ]}
    >
      <Text
        style={[styles.primaryPillText, disabled && styles.primaryPillTextDisabled, font("display", fontsReady)]}
      >
        {label}
      </Text>
      <View style={[styles.primaryPillIcon, disabled && styles.primaryPillIconDisabled]}>
        <ArrowRight color={disabled ? colors.textSecondary : colors.accent} size={18} />
      </View>
    </Pressable>
  );
}

function SecondaryAction({
  colors,
  label,
  icon,
  disabled,
  fontsReady,
  onPress,
  styles
}: {
  colors: ThemeColors;
  label: string;
  icon: (color: string) => ReactNode;
  disabled: boolean;
  fontsReady: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryCard,
        disabled && styles.secondaryCardDisabled,
        focused && styles.focused,
        pressed && !disabled && styles.pillPressed
      ]}
    >
      <View style={[styles.secondaryIcon, disabled && styles.secondaryIconDisabled]}>
        {icon(disabled ? colors.textSecondary : colors.textPrimary)}
      </View>
      <Text style={[styles.secondaryLabel, disabled && styles.secondaryLabelDisabled, font("display", fontsReady)]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    screenContent: {
      paddingTop: spacing.lg,
      paddingHorizontal: spacing.xl
    },
    heroViewport: {
      width: "100%"
    },
    hero: {
      width: "100%"
    },
    modelSlot: {
      flex: 1,
      width: "100%"
    },
    heroCopy: {
      alignItems: "center",
      gap: spacing.xxs,
      paddingTop: spacing.sm
    },
    robotName: {
      ...type.display,
      color: colors.textPrimary,
      letterSpacing: 0,
      textAlign: "center"
    },
    robotSubtitle: {
      ...type.body,
      color: colors.textSecondary,
      textAlign: "center"
    },
    // Deliberately a plain text+chevron row, not a pill/card/CTA — this is
    // a secondary affordance and must read as subordinate to E-STOP and the
    // primary CTA below. minHeight + hitSlop keep the tap target ≥44pt
    // despite the small visual footprint.
    statusLink: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      marginTop: spacing.xxs,
      minHeight: 32,
      paddingHorizontal: spacing.xs
    },
    statusLinkText: {
      ...type.label,
      color: colors.accentStrong
    },
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
    },
    ctaCluster: {
      gap: spacing.lg,
      paddingBottom: spacing.lg,
      paddingTop: spacing.xs
    },
    featuredSection: {
      gap: spacing.sm,
      marginBottom: spacing.lg
    },
    featuredHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between"
    },
    // Light-only: a small dedicated bump over type.bodyStrong (15px) so
    // this section entrance reads a touch clearer, without jumping all the
    // way to type.title (24px). Dark keeps the original size exactly —
    // this polish pass is Light-only, so the bump is gated on mode rather
    // than applied globally through a typography-system change.
    featuredTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary,
      ...(mode === "light" ? { fontSize: 17, lineHeight: 23 } : null)
    },
    featuredLink: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xxs,
      minHeight: 36,
      paddingLeft: spacing.sm
    },
    featuredLinkText: {
      ...type.label,
      color: colors.accentStrong
    },
    featuredRow: {
      gap: spacing.sm,
      paddingRight: spacing.xl
    },
    primaryPill: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: CARD_RADIUS_OUTER,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 68,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      width: "100%"
    },
    primaryPillDisabled: {
      backgroundColor: colors.surfaceSecondary
    },
    primaryPillText: {
      ...type.title,
      color: colors.accentForeground
    },
    primaryPillTextDisabled: {
      color: colors.textSecondary
    },
    primaryPillIcon: {
      alignItems: "center",
      backgroundColor: colors.accentForeground,
      borderRadius: radius.round,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    primaryPillIconDisabled: {
      backgroundColor: colors.surface
    },
    secondaryShell: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: CARD_RADIUS_OUTER,
      padding: spacing.sm
    },
    secondaryRow: {
      flexDirection: "row",
      gap: spacing.sm
    },
    secondaryCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: CARD_RADIUS_INNER,
      flex: 1,
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.md
    },
    secondaryCardDisabled: {
      opacity: 0.58
    },
    secondaryIcon: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: radius.round,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    secondaryIconDisabled: {
      opacity: 0.7
    },
    secondaryLabel: {
      ...type.label,
      color: colors.textPrimary
    },
    secondaryLabelDisabled: {
      color: colors.textSecondary
    },
    focused: {
      borderColor: colors.accentStrong,
      borderWidth: 2
    },
    pillPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }]
    },
    pressed: {
      opacity: 0.78
    }
  });
}
