import { ChevronLeft, Heart, ShieldAlert, TriangleAlert } from "lucide-react-native";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkillMedia, SkillStatus } from "../components/skills";
import { Toast } from "../components/Toast";
import { SkyButton, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { READINESS_BADGE_LABEL, RobotSummary } from "../data/robot";
import { useRobotSummary } from "../hooks/useRobotSummary";
import { formatSkillDuration, formatSkillLevel, getSkillById } from "../data/skills";
import { getFavorites, toggleFavorite } from "../services/favoritesStorage";
import { useAppTheme } from "../ThemeContext";
import { Skill } from "../types/skill";

type Props = {
  // Owned by App.tsx; the same flag Home's readiness is resolved from, so
  // both screens always agree on whether the robot may move.
  emergencyStopped: boolean;
  fontsReady: boolean;
  // Technical route param kept for compatibility; it IS the skill id.
  taskId: string;
  onBack: () => void;
  onCalibrate: () => void;
  onConnect: () => void;
};

// The former top-bar row (removed in 6.3.1; kept here so this layout
// doesn't change) and the tab bar sit outside this screen (same constants as
// Home / Skills), so the hero is sized against the space the user sees.
const CHROME_HEIGHT = 64;
const TAB_BAR_HEIGHT = 64;
// The hero leads but stays smaller than the Skills library's discovery stage
// (~50%): this page is for reading and acting, not browsing.
const HERO_SHARE = 0.32;
const HERO_MIN_HEIGHT = 180;
const HERO_MAX_HEIGHT = 320;
// Back / favorite sit on the media: 44pt targets.
const OVERLAY_BUTTON = 44;
// The content sheet rises over the bottom of the media by this much, with
// rounded top corners only. The media frame grows by the same amount, so the
// visible hero — and everything below it — stays where it was.
const SHEET_OVERLAP = space.xl;
const SHEET_RADIUS = 28;

// Start feedback. There is no execution backend yet: "starting" is a short
// local acknowledgement and nothing is sent to a robot. No progress, no
// completion and no result is ever shown — only that the request was taken.
type StartState = "idle" | "starting";
const STARTING_DELAY_MS = 900;
const STARTED_TOAST_MS = 2600;

// Skill Detail answers "what does this skill do, how, and can I start it
// now?". Media leads, the name appears once, then a compact readiness +
// action area, then three plain sections (what the robot needs, how it
// works, what to expect). Robot identity lives on Home, not here.
export function TaskDetailScreen({ emergencyStopped, fontsReady, taskId, onBack, onCalibrate, onConnect }: Props) {
  const { colors } = useSkyNexTokens();
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // undefined = loading, null = no skill with this id.
  const [skill, setSkill] = useState<Skill | null | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  // Same readiness source Home uses (data/robot.ts) — never recomputed here.
  const robot = useRobotSummary({ emergencyStopped });
  const [startState, setStartState] = useState<StartState>("idle");
  const [toastVisible, setToastVisible] = useState(false);
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    getSkillById(taskId).then((found) => {
      if (mounted) setSkill(found ?? null);
    });
    getFavorites().then((ids) => {
      if (mounted) setIsFavorite(ids.includes(taskId));
    });
    return () => {
      mounted = false;
    };
  }, [taskId]);


  // Safety (Phase 5.1): losing readiness — E-STOP above all — cancels a
  // start that is still in flight, so it can never report "started" after
  // the robot was stopped. Checked against the raw flag too, so the abort
  // doesn't wait for the async summary.
  const robotReady = robot?.readiness === "ready" && !emergencyStopped;
  useEffect(() => {
    if (robotReady) return;
    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = null;
    }
    setStartState("idle");
  }, [robotReady]);

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

  const handleStart = () => {
    // The button is already gated; this is the last-line guard so no code
    // path can start a skill on an unready or stopped robot.
    if (startState === "starting" || !robotReady || skill?.availability !== "ready") return;
    setStartState("starting");
    startingTimeoutRef.current = setTimeout(() => {
      startingTimeoutRef.current = null;
      setStartState("idle");
      setToastVisible(true);
      toastTimeoutRef.current = setTimeout(() => setToastVisible(false), STARTED_TOAST_MS);
    }, STARTING_DELAY_MS);
  };

  const usefulHeight = windowHeight - insets.top - insets.bottom - CHROME_HEIGHT - TAB_BAR_HEIGHT;
  const heroHeight = Math.round(Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, usefulHeight * HERO_SHARE)));

  const backButton = (
    <Pressable
      accessibilityLabel="Quay lại"
      accessibilityRole="button"
      onPress={onBack}
      style={({ pressed }) => [styles.overlayButton, styles.overlayLeft, pressed && styles.pressed]}
    >
      <ChevronLeft color={colors.textPrimary} size={22} />
    </Pressable>
  );

  if (skill === undefined) {
    return <View style={styles.screen}>{backButton}</View>;
  }

  if (skill === null) {
    // Unknown id (deleted skill, stale link): no fake content, back still works.
    return (
      <View style={styles.screen}>
        {backButton}
        <View style={styles.notFound}>
          <TriangleAlert color={colors.textSecondary} size={22} />
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
            Không tìm thấy kỹ năng
          </SkyText>
          <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary">
            Kỹ năng này không còn tồn tại.
          </SkyText>
        </View>
      </View>
    );
  }

  const meta = [formatSkillDuration(skill.durationSeconds), formatSkillLevel(skill.level)].filter(Boolean).join(" · ");

  return (
    <View style={styles.screen}>
      <ScrollView
        accessibilityLabel={`Chi tiết kỹ năng ${skill.name}`}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Media first, full width like the Skills stage. Decorative for
            screen readers — the name below carries the meaning. A real cover
            (and later a preview poster) drops into the same frame and runs
            edge to edge under the sheet; the padding only re-centres the
            placeholder glyph in the part left visible. */}
        <View style={styles.hero}>
          <SkillMedia
            height={heroHeight + SHEET_OVERLAP}
            shape="stage"
            skill={skill}
            style={styles.heroMedia}
          />
          {backButton}
          <Pressable
            accessibilityLabel={isFavorite ? `Bỏ yêu thích ${skill.name}` : `Yêu thích ${skill.name}`}
            accessibilityRole="button"
            aria-selected={isFavorite}
            onPress={handleToggleFavorite}
            style={({ pressed }) => [styles.overlayButton, styles.overlayRight, pressed && styles.pressed]}
          >
            <Heart
              color={isFavorite ? colors.accentInk : colors.textPrimary}
              fill={isFavorite ? colors.accentInk : "none"}
              size={20}
            />
          </Pressable>
        </View>

        {/* One continuous sheet from the title to the end of the page: no
            cards inside, sections are separated by dividers and space. */}
        <View style={styles.sheet}>
          {/* Identity: the name once, one human sentence, quiet metadata.
              Skill availability (Đang học / Sắp có) shows only when it isn't
              ready — it is about the SKILL, never the robot. */}
          <View style={styles.identity}>
            {skill.availability !== "ready" && (
              <View style={styles.statusRow}>
                <SkillStatus availability={skill.availability} fontsReady={fontsReady} />
              </View>
            )}
            <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
              {skill.name}
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary">
              {skill.summary}
            </SkyText>
            {meta ? (
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                {meta}
              </SkyText>
            ) : null}
          </View>

          <ActionArea
            fontsReady={fontsReady}
            onCalibrate={onCalibrate}
            onConnect={onConnect}
            onStart={handleStart}
            robot={robot}
            skill={skill}
            startState={startState}
            styles={styles}
            colors={colors}
          />

          {skill.requirements && skill.requirements.length > 0 && (
            <Section fontsReady={fontsReady} styles={styles} title="Robot cần…">
              {skill.requirements.map((item) => (
                <View key={item} style={styles.row}>
                  <View style={styles.bullet} />
                  <SkyText fontsReady={fontsReady} style={styles.rowText}>
                    {item}
                  </SkyText>
                </View>
              ))}
            </Section>
          )}

          {skill.steps && skill.steps.length > 0 && (
            <Section fontsReady={fontsReady} styles={styles} title="Cách hoạt động">
              {skill.steps.map((step, index) => (
                <View accessibilityLabel={`Bước ${index + 1}: ${step}`} accessible key={step} style={styles.row}>
                  <SkyText fontsReady={fontsReady} style={styles.stepNumber} tone="secondary" variant="sectionTitle">
                    {index + 1}
                  </SkyText>
                  <SkyText fontsReady={fontsReady} style={styles.rowText}>
                    {step}
                  </SkyText>
                </View>
              ))}
            </Section>
          )}

          {skill.expectedOutcome ? (
            <Section fontsReady={fontsReady} styles={styles} title="Kết quả mong đợi">
              <SkyText fontsReady={fontsReady}>{skill.expectedOutcome}</SkyText>
            </Section>
          ) : null}
        </View>
      </ScrollView>

      {/* Local acknowledgement only — see StartState. */}
      <Toast colors={themeColors} fontsReady={fontsReady} title="Đã bắt đầu kỹ năng" visible={toastVisible} />
    </View>
  );
}

// Readiness + action. The action comes first visually (it is what the page
// is for); the readiness line under it says why. The robot's state is the
// one Home shows — same source, same labels, same message.
function ActionArea({
  colors,
  fontsReady,
  onCalibrate,
  onConnect,
  onStart,
  robot,
  skill,
  startState,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onCalibrate: () => void;
  onConnect: () => void;
  onStart: () => void;
  robot: RobotSummary | null;
  skill: Skill;
  startState: StartState;
  styles: ReturnType<typeof createStyles>;
}) {
  // Skill not available yet: nothing to start, so no robot CTA at all.
  if (skill.availability !== "ready") {
    return (
      <View style={styles.action}>
        <SkyText fontsReady={fontsReady} tone="secondary">
          {skill.availability === "learning"
            ? "Robot đang học kỹ năng này, chưa thể bắt đầu."
            : "Kỹ năng này sắp có, chưa thể bắt đầu."}
        </SkyText>
      </View>
    );
  }

  // Readiness resolves within a tick; never flash a start the robot can't take.
  if (!robot) return null;

  const readinessLine = (
    <View style={styles.readiness}>
      <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[robot.readiness]} status={robot.status} />
      <SkyText fontsReady={fontsReady} style={styles.readinessText} tone="secondary" variant="caption">
        {robot.message}
      </SkyText>
    </View>
  );

  if (robot.readiness === "offline" || robot.readiness === "needs-calibration") {
    const offline = robot.readiness === "offline";
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint={offline ? "Mở màn hình kết nối" : "Mở màn hình hiệu chỉnh"}
          fontsReady={fontsReady}
          onPress={offline ? onConnect : onCalibrate}
          size="lg"
        >
          {offline ? "Kết nối robot" : "Hiệu chỉnh"}
        </SkyButton>
        {readinessLine}
      </View>
    );
  }

  if (robot.readiness === "stopped") {
    // Safety state: the start is visibly unavailable (neutral, never orange)
    // and the reason is in red. Reset stays where it lives — beside the floating E-STOP.
    return (
      <View style={styles.action}>
        <SkyButton
          accessibilityHint="Không khả dụng khi E-STOP đang bật"
          accessibilityLabel={`Bắt đầu ${skill.name}`}
          disabled
          fontsReady={fontsReady}
          size="lg"
        >
          Bắt đầu
        </SkyButton>
        <View accessibilityRole="alert" style={styles.safety}>
          <ShieldAlert color={colors.statusDanger} size={18} />
          <View style={styles.safetyText}>
            <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
              E-STOP đang bật
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {robot.message}
            </SkyText>
          </View>
        </View>
      </View>
    );
  }

  const starting = startState === "starting";
  return (
    <View style={styles.action}>
      <SkyButton
        accessibilityHint={starting ? undefined : "Bắt đầu kỹ năng trên robot"}
        accessibilityLabel={starting ? `Đang bắt đầu ${skill.name}` : `Bắt đầu ${skill.name}`}
        fontsReady={fontsReady}
        loading={starting}
        onPress={onStart}
        size="lg"
      >
        {starting ? "Đang bắt đầu…" : "Bắt đầu"}
      </SkyButton>
      {readinessLine}
    </View>
  );
}

// Plain section: thin divider, a quiet heading, content. No chapter numbers,
// no card around it.
function Section({
  children,
  fontsReady,
  styles,
  title
}: {
  children: ReactNode;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.divider} />
      <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
        {title}
      </SkyText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    // flexGrow lets the sheet reach the tab bar on short content.
    content: {
      flexGrow: 1
    },
    hero: {
      position: "relative"
    },
    heroMedia: {
      paddingBottom: SHEET_OVERLAP
    },
    overlayButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: corner.pill,
      height: OVERLAY_BUTTON,
      justifyContent: "center",
      position: "absolute",
      top: space.sm,
      width: OVERLAY_BUTTON,
      zIndex: 1
    },
    overlayLeft: {
      left: layout.screenGutter - space.xs
    },
    overlayRight: {
      right: layout.screenGutter - space.xs
    },
    pressed: {
      opacity: 0.78
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      flexGrow: 1,
      marginTop: -SHEET_OVERLAP,
      paddingBottom: space.xxxl,
      paddingHorizontal: space.lg,
      paddingTop: layout.sectionGap
    },
    identity: {
      gap: space.xs
    },
    statusRow: {
      alignItems: "flex-start",
      marginBottom: space.xxs
    },
    action: {
      gap: space.md,
      marginTop: layout.sectionGap
    },
    readiness: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm
    },
    readinessText: {
      flexShrink: 1
    },
    safety: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.sm
    },
    safetyText: {
      flex: 1,
      gap: space.xxs
    },
    section: {
      gap: space.md,
      marginTop: layout.sectionGap
    },
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginBottom: space.xs
    },
    sectionBody: {
      gap: space.md
    },
    row: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.md
    },
    rowText: {
      flex: 1
    },
    // Quiet dot, aligned to the first line of body text.
    bullet: {
      backgroundColor: colors.textSecondary,
      borderRadius: corner.pill,
      height: 6,
      marginLeft: 6,
      marginTop: 8,
      width: 6
    },
    stepNumber: {
      textAlign: "center",
      width: 18
    },
    notFound: {
      alignItems: "center",
      flex: 1,
      gap: space.sm,
      justifyContent: "center",
      padding: layout.screenGutter
    },
    centered: {
      textAlign: "center"
    }
  });
}
