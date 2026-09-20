import { ArrowRight, ChevronLeft, Heart, TriangleAlert } from "lucide-react-native";
import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeroStage } from "../components/HeroStage";
import { ScreenHeader } from "../components/ScreenHeader";
import { getTaskIcon } from "../components/TaskCard";
import { TaskStatusChip } from "../components/TaskStatusChip";
import { Toast } from "../components/Toast";
import { useAppTheme } from "../ThemeContext";
import { getTaskById, Task, TaskStatus } from "../data/tasks";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { font, radius, spacing, ThemeColors, type } from "../theme";

type Props = {
  fontsReady: boolean;
  taskId: string;
  onBack: () => void;
};

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

// One target frame size — ~45-50% of the viewport height — regardless of
// whether the fallback emblem or a real future photo/video fills it. A
// prepared showcase frame shouldn't visibly change proportions the day real
// SO-ARM101 media replaces the placeholder; the old media-vs-fallback split
// (a tall aspect-1 frame for media, a short 0.78 one for the icon) would
// have made that swap look like a redesign instead of just new content
// dropping into the same stage. Ratio + clamp verified against real
// renders (Playwright boundingBox against the status card's actual top
// edge) on both 375x812 and 430x932, not derived from this constant alone.
const HERO_HEIGHT_RATIO = 0.47;
const HERO_MIN_HEIGHT = 320;
const HERO_MAX_HEIGHT = 460;
// Fraction of hero height the fade occupies — sized to comfortably hold the
// "SO-ARM101" + task-name caption HeroStage overlays at the bottom of it
// (see the HeroStage call below), not just the hero/body seam it used to be
// tuned for alone.
const HERO_FADE_RATIO = 0.34;

// "Chạy tác vụ" execution feedback state machine. No backend/VLA endpoint
// exists yet (see the TODO below), so `starting` is driven by a simulated
// delay and always resolves to `success` — `error` is wired through the
// button/toast rendering now so the only future change is what sets it.
type TaskExecutionState = "idle" | "starting" | "success" | "error";

const EXECUTION_STARTING_DELAY_MS = 900;
const EXECUTION_TOAST_DURATION_MS = 2600;

export function TaskDetailScreen({ fontsReady, taskId, onBack }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // undefined = still loading, null = id doesn't match any task.
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  const [executionState, setExecutionState] = useState<TaskExecutionState>("idle");
  const [toastVisible, setToastVisible] = useState(false);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(
    () => () => {
      if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    []
  );

  const handleToggleFavorite = () => {
    setIsFavorite((prev) => !prev);
    void toggleFavorite(taskId).then((ids) => setIsFavorite(ids.includes(taskId)));
  };

  // Simulated execution: no VLA/task-execution backend exists yet, so this
  // just proves out the interaction (loading → confirmed feedback → idle)
  // against a fake delay. Swapping the setTimeout below for the real
  // request — and setting `error` on failure — is the only future change;
  // the button/toast already render every state correctly.
  const handleRunTask = () => {
    if (executionState === "starting") return;

    setExecutionState("starting");
    startingTimeoutRef.current = setTimeout(() => {
      setExecutionState("success");
      setToastVisible(true);
      toastTimeoutRef.current = setTimeout(() => setToastVisible(false), EXECUTION_TOAST_DURATION_MS);
    }, EXECUTION_STARTING_DELAY_MS);
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
  const heroHeight = Math.min(
    HERO_MAX_HEIGHT,
    Math.max(HERO_MIN_HEIGHT, Math.round(windowHeight * HERO_HEIGHT_RATIO))
  );
  const heroEmblemSize = Math.min(200, Math.round(windowWidth * 0.42));
  const heroIconSize = Math.round(heroEmblemSize * 0.46);
  const heroFadeHeight = Math.round(heroHeight * HERO_FADE_RATIO);
  const taskFacts = buildTaskFacts(task);
  // 4 columns fit comfortably at 390px+; below that (375px) it reads
  // cramped, so fall back to a 2×2 grid rather than shrinking type.
  const factColumns = windowWidth < 390 ? 2 : 4;
  const chapters = buildChapters(task, fontsReady, styles);

  return (
    <View style={styles.screenWrap}>
      <ScrollView
        accessibilityLabel={`Màn hình chi tiết tác vụ ${task.name}`}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        {/* Cinematic hero first — media dominates, with "SO-ARM101" and the
            task name overlaid inside it (HeroStage's caption slot) instead
            of as a separate text block above the visual. Back/favorite
            float on top of the stage, same overlay pattern this app already
            uses elsewhere, legible against any future real photo via
            HeroStage's own top scrim. */}
        <View style={styles.heroWrap}>
          <HeroStage
            emblemIcon={Icon}
            emblemSize={heroEmblemSize}
            fadeHeight={heroFadeHeight}
            fontsReady={fontsReady}
            height={heroHeight}
            iconSize={heroIconSize}
            imageUrl={task.imageUrl}
            overline="SO-ARM101"
            title={task.name}
          />

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
          {/* Premium status card — task context (status, name, one short
              description), not a dashboard readout. Repeats the task name
              in a smaller, secondary weight; the hero already said it once,
              large. */}
          <View style={styles.statusCard}>
            <TaskStatusChip fontsReady={fontsReady} size="md" status={task.status} />
            <Text style={[styles.statusCardTitle, font("display", fontsReady)]}>{task.name}</Text>
            <Text style={[styles.statusCardDescription, font("body", fontsReady)]}>{task.description}</Text>
          </View>

          <ExecutionAvailability
            colors={colors}
            executionState={executionState}
            fontsReady={fontsReady}
            onRunTask={handleRunTask}
            status={task.status}
            styles={styles}
          />

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

      <Toast
        colors={colors}
        fontsReady={fontsReady}
        subtitle="Robot đang chuẩn bị"
        title="Đã gửi tác vụ"
        visible={toastVisible}
      />
    </View>
  );
}

// READY gets the one dominant lime action. TRAINING/COMING_SOON never show a
// fake-disabled version of it — status affects execution, not discoverability,
// so those states still surface as plain availability copy, not a dead CTA.
//
// The READY button itself now runs through `executionState`
// (idle/starting/success/error — see TaskExecutionState above): pressing it
// is no longer a silent no-op. There is still no VLA/task-execution backend,
// so "starting" resolves via a simulated delay owned by the parent screen —
// this component only renders whichever state it's given.
function ExecutionAvailability({
  colors,
  executionState,
  fontsReady,
  onRunTask,
  status,
  styles
}: {
  colors: ThemeColors;
  executionState: TaskExecutionState;
  fontsReady: boolean;
  onRunTask: () => void;
  status: TaskStatus;
  styles: ReturnType<typeof createStyles>;
}) {
  if (status === "ready") {
    const isStarting = executionState === "starting";
    const isError = executionState === "error";
    const label = isStarting ? "Đang gửi lệnh…" : isError ? "Thử lại" : "Chạy tác vụ";

    return (
      <Pressable
        accessibilityHint={isStarting ? undefined : "Gửi lệnh chạy tác vụ tới robot"}
        accessibilityLabel={isStarting ? "Đang gửi lệnh chạy tác vụ" : label}
        accessibilityRole="button"
        accessibilityState={{ busy: isStarting, disabled: isStarting }}
        disabled={isStarting}
        onPress={onRunTask}
        style={({ pressed }) => [
          styles.runButton,
          isStarting && styles.runButtonBusy,
          pressed && !isStarting && styles.pillPressed
        ]}
      >
        <Text style={[styles.runButtonText, font("display", fontsReady)]}>{label}</Text>
        <View style={styles.runButtonIcon}>
          {isStarting ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : isError ? (
            <TriangleAlert color={colors.danger} size={18} />
          ) : (
            <ArrowRight color={colors.accent} size={18} />
          )}
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
    // Wraps the ScrollView so Toast (a sibling, absolutely positioned) is
    // pinned to the screen's own bounds instead of the scrollable content —
    // otherwise it would scroll away with the page instead of floating.
    screenWrap: {
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
    // Positions back/favorite as overlays on top of HeroStage — same
    // pattern this app already uses (see TasksScreen's own hero) — instead
    // of a separate toolbar row preceding the visual. The hero is the first
    // thing on screen now, so these float directly on it.
    heroWrap: {
      position: "relative"
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
      paddingTop: spacing.xl
    },
    // Task context, not a dashboard readout — one card, no per-field
    // borders/pills beyond the status chip it already reuses.
    statusCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg
    },
    statusCardTitle: {
      ...type.title,
      color: colors.textPrimary
    },
    statusCardDescription: {
      ...type.body,
      color: colors.textSecondary
    },
    divider: {
      backgroundColor: colors.border,
      height: 1,
      width: "100%"
    },
    factsGrid: {
      gap: spacing.lg
    },
    factsRow: {
      flexDirection: "row",
      gap: spacing.lg
    },
    fact: {
      flex: 1,
      gap: spacing.xs
    },
    // Uppercase + tracked-out, same micro-label idiom TasksScreen's own
    // hero metadata line already uses — reads as a product spec sheet
    // rather than a form's field labels.
    factLabel: {
      ...type.small,
      color: colors.textSecondary,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    },
    // Medium weight, not bodyStrong — this is now a supporting technical
    // detail below the status card and hero, not content competing with
    // them for attention.
    factValue: {
      ...type.body,
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
      gap: spacing.md
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
    // More vertical room per step (gap + paddingVertical both up from the
    // previous, tighter pass) — a numbered task flow to scan at a glance,
    // not a dense documentation list.
    stepsList: {
      gap: spacing.sm
    },
    stepRow: {
      flexDirection: "row",
      gap: spacing.md,
      paddingVertical: spacing.md
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
    // Kept on the same accent fill as idle (not `surfaceSecondary`, this
    // app's usual "disabled" treatment) — it's temporarily busy, not
    // unavailable, so it should still read as the same action in progress.
    runButtonBusy: {
      opacity: 0.85
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
