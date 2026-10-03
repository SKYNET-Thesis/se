import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Heart } from "lucide-react-native";
import { ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkillCard, SkillHero } from "../components/skills";
import { getSuggestedSkillId } from "../data/robot";
import { getSkills } from "../data/skills";
import { resolveLibraryHeroMedia } from "../data/skillMedia";
import { layout } from "../design-system/spacing";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, type } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { Skill } from "../types/skill";

type FilterMode = "all" | "favorites";
type IconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

type Props = {
  fontsReady: boolean;
  onOpenTask: (taskId: string) => void;
};

// The bottom tab bar is a fixed height outside this screen (same constant
// RobotHero uses on Home).
const TAB_BAR_HEIGHT = 64;
// An immersive stage: half of what the user sees above the tab bar on a
// portrait phone — substantial, with the tabs and first tiles still in
// view. Never taller than a 4:5 portrait frame (short/wide windows), never
// below a real stage. Portrait-ish frames use the art-directed mobile crop
// of the photo when present (see resolveLibraryHeroMedia); `cover` fills
// the frame either way — never contain/letterbox.
const HERO_VIEWPORT_SHARE = 0.5;
const HERO_MAX_ASPECT = 5 / 4;
const HERO_MIN_HEIGHT = 240;
// A frame at least this tall relative to its width counts as portrait.
const HERO_PORTRAIT_FROM = 0.75;
// The library sheet is the lower section of the screen, not a card: full
// width, no outer border, only its top corners rounded where it meets the
// stage. Its content (selector + tiles) is padded inside it instead.
const SHEET_PADDING = spacing.md;
const SHEET_RADIUS = 28;
// The sheet rises over the stage's lower edge so the stage flows into the
// collection instead of ending at a gap. The overlap equals the corner
// radius so the stage — never the page background — shows behind the
// sheet's curved corners. The overlap falls inside the 3:2 frame, on the
// photo's tabletop (bottom ~10%), never on the robot.
const SHEET_OVERLAP = SHEET_RADIUS;

// Skills answers "what can my robot do?" — composed as two masses:
//   1. a screen-level stage for one featured capability: full bleed, no
//      corners, border or surface of its own, directly under the chrome —
//      part of the screen, not a card placed on it;
//   2. a full-width library sheet rising over the stage's lower edge and
//      running to the bottom of the screen, holding the Tất cả / Yêu thích
//      selector and the tiles.
// Depth is stage → sheet (surface tone) → tiles (raised surface), carried by
// tone alone — no shadows and no outer frame, as elsewhere in the app.
// Robot identity is Home's job, so there is no robot hero here, and as a
// tab root there is no back button.
export function TasksScreen({ fontsReady, onOpenTask }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    let mounted = true;

    Promise.all([getSkills(), getSuggestedSkillId()]).then(([data, id]) => {
      if (!mounted) return;
      setSkills(data);
      setSuggestedId(id);
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

  const visibleSkills = useMemo(
    () => (filter === "favorites" ? skills.filter((skill) => favoriteIds.includes(skill.id)) : skills),
    [favoriteIds, filter, skills]
  );

  // Same source as Home's suggestion; re-checked as ready here so the stage
  // can never feature a learning or coming-soon skill.
  const heroSkill = skills.find((skill) => skill.id === suggestedId && skill.availability === "ready");

  // The hero runs edge to edge from the very top, so it is measured against
  // everything above the tab bar (status-bar area included).
  const visibleHeight = windowHeight - insets.bottom - TAB_BAR_HEIGHT;
  const heroHeight = Math.round(
    Math.max(HERO_MIN_HEIGHT, Math.min(visibleHeight * HERO_VIEWPORT_SHARE, windowWidth * HERO_MAX_ASPECT))
  );
  const heroMedia = resolveLibraryHeroMedia({ portrait: heroHeight >= windowWidth * HERO_PORTRAIT_FROM });

  // Exact 2-column width (not a percentage) so both columns and the gap
  // between them always add up to the sheet's inner width.
  const sheetInnerWidth = windowWidth - SHEET_PADDING * 2;
  const cardWidth = Math.floor((sheetInnerWidth - layout.stackGap) / 2);

  const handleToggleFavorite = (skillId: string) => {
    // Optimistic update so the heart flips instantly; toggleFavorite persists
    // in the background and its resolved list is the source of truth.
    setFavoriteIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]));
    void toggleFavorite(skillId).then(setFavoriteIds);
  };

  return (
    <ScrollView
      accessibilityLabel="Màn hình thư viện kỹ năng"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {/* The hero runs behind the status bar and its top is dark in both
          themes, so the status bar is light while this screen is in front
          (pushed on the app's status-bar stack; popped when it isn't). */}
      {isFocused && heroSkill && <StatusBar style="light" />}
      {heroSkill && (
        <SkillHero
          accessibilityHint="Xem chi tiết kỹ năng"
          // The library's own hero photo, not the featured skill's cover.
          cover={heroMedia}
          fontsReady={fontsReady}
          height={heroHeight}
          mediaStyle={styles.heroMedia}
          onPress={() => onOpenTask(heroSkill.id)}
          rounded={false}
          skill={heroSkill}
        />
      )}

      <View style={[styles.sheet, !heroSkill && [styles.sheetStandalone, { paddingTop: insets.top + spacing.xs }]]}>
        {/* The sheet's header: same controls and behavior as before — only
          their position changed. */}
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

        {visibleSkills.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, font("body", fontsReady)]}>
              {filter === "favorites" ? "Chưa có kỹ năng yêu thích." : "Chưa có kỹ năng nào."}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {visibleSkills.map((skill) => (
              <SkillCard
                accessibilityHint="Xem chi tiết kỹ năng"
                fontsReady={fontsReady}
                isFavorite={favoriteIds.includes(skill.id)}
                key={skill.id}
                onPress={() => onOpenTask(skill.id)}
                onToggleFavorite={() => handleToggleFavorite(skill.id)}
                skill={skill}
                style={{ width: cardWidth }}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
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
          style={[
            styles.filterOptionText,
            active && styles.filterOptionTextActive,
            font(active ? "displayBold" : "bodyMedium", fontsReady)
          ]}
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
    // No gutter or padding: the stage meets the chrome and both screen
    // edges, and the sheet (flexGrow) runs on to the bottom of the screen.
    content: {
      flexGrow: 1
    },
    // Keeps the placeholder glyph centred in the visible part of the stage.
    heroMedia: {
      paddingBottom: SHEET_OVERLAP
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      flexGrow: 1,
      gap: spacing.xs,
      marginTop: -SHEET_OVERLAP,
      paddingBottom: spacing.xl,
      paddingHorizontal: SHEET_PADDING,
      paddingTop: spacing.xs
    },
    // No stage (nothing ready yet): nothing to rise over.
    sheetStandalone: {
      marginTop: 0
    },
    // Unchanged from the previous screen: two plain icon+label options
    // centered with generous space between them, no pill/segment fill, no
    // bounding box — an Apple-style minimal selector, not a tab bar.
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
      lineHeight: 18
    },
    filterOptionTextActive: {
      // Weight comes from the font role (Bold when active, Medium when not).
      color: colors.accentStrong
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
    // Widths are floored to whole points; space-between absorbs the
    // sub-point remainder so both columns still meet the sheet's inner edges.
    grid: {
      columnGap: layout.stackGap,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: layout.stackGap
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
