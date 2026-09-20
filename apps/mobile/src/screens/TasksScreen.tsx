import { useFocusEffect } from "@react-navigation/native";
import { Bot, ChevronLeft, Heart } from "lucide-react-native";
import { ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeroStage } from "../components/HeroStage";
import { TaskGridTile } from "../components/TaskCard";
import { useAppTheme } from "../ThemeContext";
import { getTasks, Task } from "../data/tasks";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type FilterMode = "all" | "favorites";
type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Props = {
  fontsReady: boolean;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
};

// A deliberately bigger top radius than this app's usual 24px "rich card"
// convention (Home/Connect/Calibrate/Camera/Status) — the library section
// is meant to read as a sheet rising up from the page, not just another
// card, so it gets its own scale. Bottom stays on the ordinary card radius
// so it doesn't end on a hard square corner over empty page background.
const SHEET_RADIUS_TOP = 36;
const SHEET_RADIUS_BOTTOM = radius.card;

// No overlap anymore — the hero is now a real photo with a caption sitting
// close to its own bottom edge (HeroStage's caption), so there's no more
// safe empty padding for the sheet to rise into without risking the
// caption text. The rounded top radius + handle bar alone still carry the
// "floating sheet" read.

// Hero visual scales with the window instead of a fixed px value. The
// identity text (title/subtitle/capability line) overlays the visual itself
// (HeroStage's caption slot) instead of sitting in a separate block below
// it. Height is capped so the frame stays at least as wide-vs-tall as the
// source photo (1536x1024, 1.5:1): ~244px at 375 wide, ~280px at 430 wide.
// Any taller and native cover flips from cropping top/bottom to cropping the
// left/right edges, which slices both robot arms off the sides of the frame.
// Verified against real renders on both 375x812 and 430x932.
const HERO_VISUAL_HEIGHT_RATIO = 0.3;
const HERO_VISUAL_MIN_HEIGHT = 240;
const HERO_VISUAL_MAX_HEIGHT = 300;

// Same circular "product pedestal" emblem + fade-to-background treatment
// TaskDetailScreen already uses for its own icon-fallback hero (see
// TaskDetailScreen's HERO_ASPECT_FALLBACK/heroEmblem/heroFade) — reused at
// the same proportions so both heroes read as one design system instead of
// TasksScreen inventing a second, different "robot visual" language.
const HERO_EMBLEM_MAX_SIZE = 200;
const HERO_EMBLEM_WIDTH_RATIO = 0.42;
const HERO_EMBLEM_ICON_RATIO = 0.46;
// Sized to comfortably hold the title+subtitle+metadata caption HeroStage
// now overlays at the bottom of the visual (see the HeroStage call below),
// not just the hero/sheet seam it used to be tuned for alone.
const HERO_FADE_HEIGHT_RATIO = 0.6;

// Compact metadata line, not pills — same short spec-badge vocabulary
// onboarding already uses for "DUAL ARM" / "AI VISION" / "READY" (English,
// compact, inside otherwise-Vietnamese copy), just rendered as one subtle
// uppercase text line instead of three bordered chips, so the hero reads as
// a product statement instead of a row of dashboard badges.
const HERO_CAPABILITIES = ["Vision", "Motion", "Automation"];

// Bundled local asset (same require(...)-as-Image-source pattern this app
// already uses for its brand marks/3D models — see OnboardingScreen.tsx and
// ArmModelViewer.tsx), not a remote URL, per the asset being shipped with
// the app rather than fetched.
const HERO_IMAGE = require("../../assets/images/hero/so-arm101-home-hero.png");
// Fraction (0-1, top to bottom) of HERO_IMAGE where the arms/fabric cluster
// sits — see HeroStage's imageFocalY, and the crop reasoning in TasksHero
// below. Specific to this one photo's composition.
const HERO_IMAGE_FOCAL_Y = 0.6;

export function TasksScreen({ fontsReady, onBack, onOpenTask }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
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
      accessibilityLabel="Màn hình thư viện kỹ năng"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <TasksHero colors={colors} fontsReady={fontsReady} insetsTop={insets.top} onBack={onBack} styles={styles} />

      {/* Full-bleed sheet — no horizontal padding at this level on purpose,
          its own children (intro, grid, filter footer) carry their own
          inset. That's what makes the background actually reach the screen
          edges instead of reading as another inset card like the rest of
          the page. Sits directly after the hero photo (no overlap into it
          — see SHEET_RADIUS_TOP's comment), with a handle bar at its top;
          this app has no shadow/elevation anywhere, so the rounded top +
          handle is what reads as "sheet rising up," not a flat card.
          Filter intentionally sits AFTER the grid, not before it — a user
          should discover what the robot can do first; the Tất cả/Yêu thích
          toggle is a secondary sort/filter action on that list, not a gate
          in front of it. */}
      <View style={styles.librarySheet}>
        <View style={styles.sheetHandle} />

        <View style={styles.libraryIntro}>
          <Text style={[styles.libraryTitle, font("display", fontsReady)]}>Thư viện kỹ năng</Text>
          {/* Small library-size fact, not a dashboard metric card — answers
              "how much is there to explore" before the grid does it visually. */}
          <Text style={[styles.libraryMeta, font("body", fontsReady)]}>{tasks.length} kỹ năng khả dụng</Text>
        </View>

        <View style={styles.libraryContent}>
          {visibleTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, font("body", fontsReady)]}>
                {filter === "favorites" ? "Chưa có tác vụ yêu thích." : "Chưa có tác vụ nào."}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {visibleTasks.map((task) => (
                <TaskGridTile
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
        </View>

        <View style={styles.libraryContent}>
          <View style={styles.filterDivider} />

          <View style={styles.filterSelector}>
            <FilterOption
              active={filter === "all"}
              colors={colors}
              fontsReady={fontsReady}
              label="Tất cả"
              onPress={() => setFilter("all")}
              styles={styles}
            />
            <FilterOption
              active={filter === "favorites"}
              colors={colors}
              fontsReady={fontsReady}
              icon={Heart}
              label="Yêu thích"
              onPress={() => setFilter("favorites")}
              styles={styles}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Product-identity-first hero: a full-bleed visual (back button overlaid on
// it, same circular-emblem + fade-to-background treatment TaskDetailScreen
// already uses for its own icon-fallback hero) showing the real SO-ARM101
// hero photo, with "SO-ARM101" + tagline + capability line overlaid inside
// it (HeroStage's caption slot) instead of as a separate text block below —
// the whole identity now reads as one product-showcase visual, not an
// image followed by a caption card. No "Tác vụ" page-chrome framing here on
// purpose — the segment control and grid below already establish this is
// the task library once you reach it. Deliberately the only thing in the
// first viewport — the task library (heading, filter, grid) only appears
// once the user scrolls past this, the way a product page's hero owns the
// first screen alone.
function TasksHero({
  colors,
  fontsReady,
  insetsTop,
  onBack,
  styles
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  insetsTop: number;
  onBack: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroVisualHeight = Math.min(
    HERO_VISUAL_MAX_HEIGHT,
    Math.max(HERO_VISUAL_MIN_HEIGHT, Math.round(windowHeight * HERO_VISUAL_HEIGHT_RATIO))
  );
  const heroEmblemSize = Math.min(HERO_EMBLEM_MAX_SIZE, Math.round(windowWidth * HERO_EMBLEM_WIDTH_RATIO));
  const heroIconSize = Math.round(heroEmblemSize * HERO_EMBLEM_ICON_RATIO);
  const heroFadeHeight = Math.round(heroVisualHeight * HERO_FADE_HEIGHT_RATIO);

  return (
    <View style={styles.hero}>
      {/* Reusable product-stage component (src/components/HeroStage.tsx) —
          same premium treatment as before (emblem + ambient glow + bottom
          fade), now showing the real bundled SO-ARM101 hero photo instead
          of the icon-emblem placeholder, with the identity caption overlaid
          on it. imageFocalY biases the cover-crop toward the arms/fabric
          cluster in the lower half of the source photo (see
          so-arm101-home-hero.png) instead of a plain center crop, which
          would show too much empty wall above them in this hero band. */}
      <HeroStage
        emblemIcon={Bot}
        emblemSize={heroEmblemSize}
        fadeHeight={heroFadeHeight}
        fontsReady={fontsReady}
        height={heroVisualHeight}
        iconSize={heroIconSize}
        imageFocalY={HERO_IMAGE_FOCAL_Y}
        imageSource={HERO_IMAGE}
        metadata={HERO_CAPABILITIES.map((label) => label.toUpperCase()).join(" · ")}
        subtitle={"Robot thông minh\ntrong tầm tay bạn"}
        title="SO-ARM101"
      />

      <Pressable
        accessibilityLabel="Quay lại"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, { top: insetsTop + spacing.sm }, pressed && styles.pressed]}
      >
        <ChevronLeft color={colors.textPrimary} size={22} />
      </Pressable>
    </View>
  );
}

// Premium capability-selector action, not a tab bar and not the bordered/
// filled segmented control this app uses for actual navigation (see Home's
// SecondaryAction) — two plain icon+label options, no container, active
// state carried by color + weight + a small underline together (never
// color alone), inactive stays muted. Each option still keeps a real 44pt
// tap target via minHeight rather than visible padding, so it stays
// visually light while staying accessible. The underline renders on both
// options at all times (transparent when inactive) so switching the active
// option never shifts either label vertically.
function FilterOption({
  active,
  colors,
  fontsReady,
  icon: Icon,
  label,
  onPress,
  styles
}: {
  active: boolean;
  colors: ThemeColors;
  fontsReady: boolean;
  icon?: IconComponent;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const tintColor = active ? colors.accentStrong : colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.filterOption, pressed && styles.pressed]}
    >
      <View style={styles.filterOptionRow}>
        {Icon && <Icon color={tintColor} size={14} strokeWidth={2} />}
        <Text
          style={[styles.filterOptionText, active && styles.filterOptionTextActive, font("display", fontsReady)]}
        >
          {label}
        </Text>
      </View>

      <View style={[styles.filterUnderline, active && styles.filterUnderlineActive]} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    // No horizontal padding here on purpose — both the hero visual and the
    // library sheet need to reach the screen edges; see their own comments.
    content: {
      paddingBottom: spacing.xxxl
    },
    // No static height here — TasksHero applies it inline, scaled off the
    // window so the hero visual actually dominates the first viewport on
    // both a 375x812 and a 430x932 screen. See HERO_VISUAL_HEIGHT_RATIO.
    // The stage itself (emblem/glow/fade) now lives in HeroStage.
    hero: {
      position: "relative"
    },
    backButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      left: spacing.md,
      position: "absolute",
      width: 44
    },
    // Same dot+label idiom StatusScreen already uses for robot readiness
    // (small accentStrong circle + label), sized at that pattern's smaller
    // "per-channel" variant since this line is subordinate to the title/
    // tagline/metadata above it, not a hero-level statement of its own.
    readinessRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: spacing.xs
    },
    readinessDot: {
      backgroundColor: colors.accentStrong,
      borderRadius: radius.round,
      height: 8,
      width: 8
    },
    readinessText: {
      ...type.label,
      color: colors.accentStrong
    },
    readinessTextSecondary: {
      ...type.small,
      color: colors.textSecondary
    },
    // The sheet itself: full width, no side margins, rounded top only —
    // this is what actually makes it read as a distinct panel rising from
    // the page instead of sitting as another inset card. Its own children
    // re-add horizontal inset (libraryContent) so nothing touches the edge.
    // No negative marginTop here anymore — the hero is a real photo with a
    // caption sitting close to its own bottom edge now, so there's no more
    // safe empty space to overlap into without risking that text; the
    // rounded top + handle bar below still carry the "floating sheet" read
    // on their own (this app has no shadow/elevation anywhere).
    librarySheet: {
      backgroundColor: colors.surfaceSecondary,
      borderBottomLeftRadius: SHEET_RADIUS_BOTTOM,
      borderBottomRightRadius: SHEET_RADIUS_BOTTOM,
      borderTopLeftRadius: SHEET_RADIUS_TOP,
      borderTopRightRadius: SHEET_RADIUS_TOP,
      paddingBottom: spacing.md,
      paddingTop: spacing.lg
    },
    // Bottom-sheet "rising up" affordance — a plain neutral bar, not a
    // button/control, purely visual.
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: colors.border,
      borderRadius: radius.round,
      height: 4,
      marginBottom: spacing.md,
      width: 36
    },
    libraryContent: {
      paddingHorizontal: spacing.xl
    },
    // Title + small library-size fact, grouped as one intro block ahead of
    // the grid — its own marginBottom is what separates it from the grid
    // now that there's no filter row between them to provide that gap.
    libraryIntro: {
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xl
    },
    libraryTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary,
      marginBottom: spacing.xxs
    },
    libraryMeta: {
      ...type.small,
      color: colors.textSecondary
    },
    filterDivider: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: spacing.md
    },
    // The relocated Tất cả/Yêu thích control: two plain icon+label options
    // centered with generous space between them, no pill/segment fill, no
    // bounding box — an Apple-style minimal selector, not a tab bar. Stays
    // a trailing sort/filter action on the grid above it, not a primary
    // navigation element competing with the hero or the library title.
    filterSelector: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xxl,
      justifyContent: "center"
    },
    // minHeight (not visible padding) is what keeps the real tap target at
    // 44pt — the icon+label+underline stack itself stays small regardless.
    filterOption: {
      alignItems: "center",
      gap: spacing.xxs,
      justifyContent: "center",
      minHeight: 44
    },
    filterOptionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4
    },
    // Active state is carried by color + weight *and* the underline below
    // (never color alone) — same fontSize as the inactive state so toggling
    // never reflows/jitters either label.
    filterOptionText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 18
    },
    filterOptionTextActive: {
      color: colors.accentStrong,
      fontWeight: "700"
    },
    // Rendered on both options at all times (transparent when inactive) —
    // that's what keeps the row's height identical regardless of which
    // option is selected.
    filterUnderline: {
      backgroundColor: "transparent",
      borderRadius: radius.round,
      height: 2,
      width: 22
    },
    filterUnderlineActive: {
      backgroundColor: colors.accentStrong
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: spacing.xxl
    },
    emptyText: {
      ...type.body,
      color: colors.textSecondary
    },
    pressed: {
      opacity: 0.78
    }
  });
}
