import { ArrowRight, ChevronLeft, Heart, TriangleAlert } from "lucide-react-native";
import { ReactElement, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../components/ScreenHeader";
import { getTaskIcon } from "../components/TaskCard";
import { TaskStatusChip } from "../components/TaskStatusChip";
import { useAppTheme } from "../ThemeContext";
import { getTaskById, Task, TaskStatus } from "../data/tasks";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type Props = {
  fontsReady: boolean;
  taskId: string;
  onBack: () => void;
};

// Mock imageUrl values are placehold.co text-on-flat-color placeholders, not
// real task photography. FeaturedTaskCard already treats these as "no real
// image yet" on Home; matching that here keeps a task from ever showing a
// lorem-ipsum-looking placeholder as if it were real media. Swap for a real
// check once the media pipeline exists — the icon fallback path stays.
function hasRealImage(imageUrl?: string) {
  return !!imageUrl && !/placehold|placeholder|dummyimage/i.test(imageUrl);
}

type TaskFact = { label: string; value: string };

// Reads only static product metadata (level/duration/robot/mode) — none of
// this is live robot/runtime state. Any field the task doesn't set is
// omitted rather than rendered as "undefined" or a broken empty column.
function buildTaskFacts(task: Task): TaskFact[] {
  const entries: [string, string | undefined][] = [
    ["Mức độ", task.level],
    ["Thời gian", task.estimatedDuration],
    ["Robot", task.robot],
    ["Chế độ", task.mode]
  ];

  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({ label, value }));
}

// Hero height depends on whether there's real media to fill it. Real
// image/video earns an immersive, near-square frame; the icon fallback gets
// a visibly shorter frame so it reads as a deliberate emblem composition,
// not a giant empty placeholder waiting for content that doesn't exist yet.
const HERO_ASPECT_MEDIA = 1; // height ≈ width — immersive, editorial
const HERO_ASPECT_FALLBACK = 0.78; // height ≈ width * 0.78 — compact, intentional
// Fixed-opacity bands approximating a top-to-bottom fade, since this app has
// no gradient dependency. The last band lands at full opacity (1) so it
// terminates exactly at the page background color instead of stopping short
// and leaving a visible seam at the hero/body boundary.
const HERO_FADE_OPACITIES = [0.04, 0.1, 0.2, 0.34, 0.52, 0.74, 1];
// Fraction of hero height the fade occupies — kept modest so it never eats
// into the fallback emblem's own breathing room in the now-shorter hero.
const HERO_FADE_RATIO = 0.2;

export function TaskDetailScreen({ fontsReady, taskId, onBack }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // undefined = still loading, null = id doesn't match any task.
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;

    getTaskById(taskId).then((found) => {
      if (mounted) setTask(found ?? null);
    });
    getFavorites().then((ids) => {
      if (mounted) setIsFavorite(ids.includes(taskId));
    });

    return () => {
      mounted = false;
    };
  }, [taskId]);

  const handleToggleFavorite = () => {
    setIsFavorite((prev) => !prev);
    void toggleFavorite(taskId).then((ids) => setIsFavorite(ids.includes(taskId)));
  };

  if (task === undefined) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingHeader}>
          <ScreenHeader fontsReady={fontsReady} onBack={onBack} title="Đang tải…" />
        </View>
      </View>
    );
  }

  if (task === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingHeader}>
          <ScreenHeader fontsReady={fontsReady} onBack={onBack} title="Không tìm thấy" />
        </View>
        <View style={styles.notFound}>
          <TriangleAlert color={colors.caution} size={22} />
          <Text style={[styles.notFoundText, font("body", fontsReady)]}>Tác vụ này không còn tồn tại.</Text>
        </View>
      </View>
    );
  }

  const Icon = getTaskIcon(task.icon);
  const hasHeroMedia = hasRealImage(task.imageUrl) || Boolean(task.videoUrl);
  const heroHeight = Math.round(windowWidth * (hasHeroMedia ? HERO_ASPECT_MEDIA : HERO_ASPECT_FALLBACK));
  const heroEmblemSize = Math.min(200, Math.round(windowWidth * 0.42));
  const heroIconSize = Math.round(heroEmblemSize * 0.46);
  const heroFadeHeight = Math.round(heroHeight * HERO_FADE_RATIO);
  const taskFacts = buildTaskFacts(task);
  // 4 columns fit comfortably at 390px+; below that (375px) it reads
  // cramped, so fall back to a 2×2 grid rather than shrinking type.
  const factColumns = windowWidth < 390 ? 2 : 4;
  const chapters = buildChapters(task, fontsReady, styles);

  return (
    <ScrollView
      accessibilityLabel={`Màn hình chi tiết tác vụ ${task.name}`}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={[styles.hero, { height: heroHeight }]}>
        {hasRealImage(task.imageUrl) ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{ uri: task.imageUrl }}
            style={styles.heroImage}
          />
        ) : (
          <View style={styles.heroFallback}>
            <View style={[styles.heroEmblem, { height: heroEmblemSize, width: heroEmblemSize }]}>
              <Icon color={colors.textPrimary} size={heroIconSize} strokeWidth={1.5} />
            </View>
          </View>
        )}

        <View pointerEvents="none" style={[styles.heroFade, { height: heroFadeHeight }]}>
          {HERO_FADE_OPACITIES.map((opacity, index) => (
            <View key={index} style={[styles.heroFadeBand, { opacity }]} />
          ))}
        </View>

        <Pressable
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [
            styles.heroButton,
            styles.heroButtonLeft,
            { top: insets.top + spacing.sm },
            pressed && styles.pressed
          ]}
        >
          <ChevronLeft color={colors.textPrimary} size={22} />
        </Pressable>

        <Pressable
          accessibilityLabel={isFavorite ? "Bỏ yêu thích" : "Yêu thích"}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          hitSlop={8}
          onPress={handleToggleFavorite}
          style={({ pressed }) => [
            styles.heroButton,
            styles.heroButtonRight,
            { top: insets.top + spacing.sm },
            pressed && styles.pressed
          ]}
        >
          <Heart
            color={isFavorite ? colors.accentStrong : colors.textPrimary}
            fill={isFavorite ? colors.accentStrong : "none"}
            size={20}
          />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.identity}>
          <Text style={[styles.title, font("display", fontsReady)]}>{task.name}</Text>
          <TaskStatusChip fontsReady={fontsReady} size="md" status={task.status} />
        </View>

        <ExecutionAvailability colors={colors} fontsReady={fontsReady} status={task.status} styles={styles} />

        <Text style={[styles.description, font("body", fontsReady)]}>{task.description}</Text>

        {taskFacts.length > 0 && (
          <>
            <View style={styles.divider} />
            <QuickFacts columns={factColumns} facts={taskFacts} fontsReady={fontsReady} styles={styles} />
          </>
        )}

        {chapters.length > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.chapters}>{chapters}</View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// READY gets the one dominant lime action. TRAINING/COMING_SOON never show a
// fake-disabled version of it — status affects execution, not discoverability,
// so those states still surface as plain availability copy, not a dead CTA.
function ExecutionAvailability({
  colors,
  fontsReady,
  status,
  styles
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  status: TaskStatus;
  styles: ReturnType<typeof createStyles>;
}) {
  if (status === "ready") {
    return (
      <Pressable
        accessibilityHint="Chưa nối VLA — hành động này hiện chưa có tác dụng"
        accessibilityLabel="Chạy tác vụ"
        accessibilityRole="button"
        // TODO(VLA): wire real task execution once the backend/VLA
        // endpoint exists. Intentionally a no-op placeholder for now.
        onPress={() => undefined}
        style={({ pressed }) => [styles.runButton, pressed && styles.pillPressed]}
      >
        <Text style={[styles.runButtonText, font("display", fontsReady)]}>Chạy tác vụ</Text>
        <View style={styles.runButtonIcon}>
          <ArrowRight color={colors.accent} size={18} />
        </View>
      </Pressable>
    );
  }

  const isTraining = status === "training";

  return (
    <View style={styles.availabilityRow}>
      <TriangleAlert color={isTraining ? colors.caution : colors.textSecondary} size={16} />
      <Text style={[styles.availabilityText, font("body", fontsReady)]}>
        {isTraining ? "Chưa thể chạy tác vụ này" : "Tác vụ này chưa hỗ trợ thực thi"}
      </Text>
    </View>
  );
}

// Static product spec row (level/duration/robot/mode) — 4 columns when
// there's room, a 2×2 grid when there isn't. Either way it's plain
// typography + spacing: no per-fact card, border, pill, or icon.
function QuickFacts({
  columns,
  facts,
  fontsReady,
  styles
}: {
  columns: 2 | 4;
  facts: TaskFact[];
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const rows = columns === 4 ? [facts] : [facts.slice(0, 2), facts.slice(2, 4)].filter((row) => row.length > 0);

  return (
    <View style={styles.factsGrid}>
      {rows.map((row, index) => (
        <View key={index} style={styles.factsRow}>
          {row.map((fact) => (
            <Fact key={fact.label} fontsReady={fontsReady} label={fact.label} styles={styles} value={fact.value} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Fact({
  fontsReady,
  label,
  styles,
  value
}: {
  fontsReady: boolean;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, font("body", fontsReady)]}>{label}</Text>
      <Text style={[styles.factValue, font("display", fontsReady)]}>{value}</Text>
    </View>
  );
}

// Builds the "Yêu cầu / Quy trình / Kết quả mong đợi" editorial chapters in
// order, numbering only the chapters a task actually has — so a task
// missing one field (e.g. no expectedOutcome yet) never leaves a numbering
// gap like "01, 03".
function buildChapters(task: Task, fontsReady: boolean, styles: ReturnType<typeof createStyles>): ReactElement[] {
  const chapters: ReactElement[] = [];
  let index = 0;

  if (task.requirements && task.requirements.length > 0) {
    index += 1;
    chapters.push(
      <RequirementsSection
        fontsReady={fontsReady}
        index={index}
        key="requirements"
        requirements={task.requirements}
        styles={styles}
      />
    );
  }

  if (task.steps && task.steps.length > 0) {
    index += 1;
    chapters.push(<ProcessSection fontsReady={fontsReady} index={index} key="steps" steps={task.steps} styles={styles} />);
  }

  if (task.expectedOutcome) {
    index += 1;
    chapters.push(
      <ExpectedOutcomeSection fontsReady={fontsReady} index={index} key="outcome" outcome={task.expectedOutcome} styles={styles} />
    );
  }

  return chapters;
}

// Shared chapter heading: a restrained mono index ("01") beside a
// display-weight title. Deliberately smaller than the page title (type.title)
// so it reads as a section marker, not a second hero heading.
function SectionHeader({
  fontsReady,
  index,
  styles,
  title
}: {
  fontsReady: boolean;
  index: number;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionIndex, font("mono", fontsReady)]}>{String(index).padStart(2, "0")}</Text>
      <Text style={[styles.sectionTitle, font("display", fontsReady)]}>{title}</Text>
    </View>
  );
}

// Static task metadata: what the task needs, not a live setup checklist.
// Deliberately not a checkbox list — nothing here is interactive or
// tracks completion.
function RequirementsSection({
  fontsReady,
  index,
  requirements,
  styles
}: {
  fontsReady: boolean;
  index: number;
  requirements: string[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader fontsReady={fontsReady} index={index} styles={styles} title="Yêu cầu" />
      <View style={styles.requirementsList}>
        {requirements.map((item) => (
          <View key={item} style={styles.requirementRow}>
            <View style={styles.requirementDot} />
            <Text style={[styles.requirementText, font("body", fontsReady)]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Editorial process list — numbered steps in mono type, no per-step cards
// or connector lines. This describes what the task does in general, not a
// live execution timeline with per-step progress. This is the strongest
// content section on the page, so its own step numbers carry the accent
// color (the chapter index above stays restrained/textSecondary).
function ProcessSection({
  fontsReady,
  index,
  steps,
  styles
}: {
  fontsReady: boolean;
  index: number;
  steps: string[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader fontsReady={fontsReady} index={index} styles={styles} title="Quy trình" />
      <View style={styles.stepsList}>
        {steps.map((step, stepIndex) => (
          <View key={step} style={styles.stepRow}>
            <Text style={[styles.stepIndex, font("mono", fontsReady)]}>{String(stepIndex + 1).padStart(2, "0")}</Text>
            <Text style={[styles.stepText, font("body", fontsReady)]}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Definition-of-done copy, not a completion/success state — a restrained
// accent rule on the left marks it as the page's conclusion, with plain
// text beside it. No card background, no success badge.
function ExpectedOutcomeSection({
  fontsReady,
  index,
  outcome,
  styles
}: {
  fontsReady: boolean;
  index: number;
  outcome: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader fontsReady={fontsReady} index={index} styles={styles} title="Kết quả mong đợi" />
      <View style={styles.outcomeRow}>
        <View style={styles.outcomeBar} />
        <Text style={[styles.outcomeText, font("body", fontsReady)]}>{outcome}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    loadingHeader: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg
    },
    content: {
      paddingBottom: spacing.xxxl
    },
    notFound: {
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl
    },
    notFoundText: {
      ...type.body,
      color: colors.textSecondary,
      textAlign: "center"
    },
    hero: {
      backgroundColor: colors.surfaceSecondary,
      overflow: "hidden",
      width: "100%"
    },
    heroImage: {
      height: "100%",
      width: "100%"
    },
    heroFallback: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center"
    },
    heroEmblem: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      justifyContent: "center"
    },
    heroFade: {
      bottom: 0,
      flexDirection: "column",
      left: 0,
      position: "absolute",
      right: 0
    },
    heroFadeBand: {
      backgroundColor: colors.background,
      flex: 1
    },
    heroButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      position: "absolute",
      width: 44
    },
    heroButtonLeft: {
      left: spacing.md
    },
    heroButtonRight: {
      right: spacing.md
    },
    body: {
      gap: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg
    },
    identity: {
      gap: spacing.sm
    },
    title: {
      ...type.display,
      color: colors.textPrimary
    },
    description: {
      ...type.body,
      color: colors.textSecondary
    },
    divider: {
      backgroundColor: colors.border,
      height: 1,
      width: "100%"
    },
    factsGrid: {
      gap: spacing.md
    },
    factsRow: {
      flexDirection: "row",
      gap: spacing.lg
    },
    fact: {
      flex: 1,
      gap: spacing.xs
    },
    factLabel: {
      ...type.small,
      color: colors.textSecondary
    },
    factValue: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    chapters: {
      gap: spacing.xxl
    },
    section: {
      gap: spacing.md
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    sectionIndex: {
      ...type.mono,
      color: colors.textSecondary
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      lineHeight: 24
    },
    requirementsList: {
      gap: spacing.sm
    },
    requirementRow: {
      flexDirection: "row",
      gap: spacing.sm
    },
    requirementDot: {
      backgroundColor: colors.accentStrong,
      borderRadius: radius.round,
      height: 6,
      marginTop: 8,
      width: 6
    },
    requirementText: {
      ...type.body,
      color: colors.textPrimary,
      flex: 1
    },
    stepsList: {
      gap: spacing.xs
    },
    stepRow: {
      flexDirection: "row",
      gap: spacing.md,
      paddingVertical: spacing.sm
    },
    stepIndex: {
      ...type.mono,
      color: colors.accentStrong,
      paddingTop: 3,
      width: 28
    },
    stepText: {
      ...type.bodyStrong,
      color: colors.textPrimary,
      flex: 1
    },
    outcomeRow: {
      alignItems: "stretch",
      flexDirection: "row",
      gap: spacing.md
    },
    outcomeBar: {
      backgroundColor: colors.accentStrong,
      borderRadius: 1,
      width: 2
    },
    outcomeText: {
      ...type.body,
      color: colors.textPrimary,
      flex: 1
    },
    runButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.round,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 60,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    runButtonText: {
      ...type.title,
      color: colors.accentForeground
    },
    runButtonIcon: {
      alignItems: "center",
      backgroundColor: colors.accentForeground,
      borderRadius: radius.round,
      height: 36,
      justifyContent: "center",
      width: 36
    },
    availabilityRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    availabilityText: {
      ...type.body,
      color: colors.textPrimary,
      flex: 1
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
