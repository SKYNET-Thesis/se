import { ChevronLeft } from "lucide-react-native";
import { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { SkyText } from "../ui";

type Props = {
  title: string;
  // Optional, only where it adds real context.
  subtitle?: string;
  fontsReady: boolean;
  // The screen's own back handler (it decides where back goes).
  onBack: () => void;
  // An existing, real action only — never a placeholder. Size it with
  // SkyTopBarAction so it shares the back control's geometry.
  right?: ReactNode;
  // 1 (default) keeps every title on one line. 2 lets a long title wrap
  // naturally instead of truncating — no forced break, no smaller font.
  titleNumberOfLines?: 1 | 2;
};

// Touch target and the visible control inside it: a 40pt SkyNex squircle
// (radius ~1/3 of its side) inside a 44pt target.
const TARGET = 44;
const CONTROL = 40;
const CONTROL_RADIUS = 14;
// Extra breathing room between the bar and the screen's first content,
// on top of each screen's own section gap — the same on every screen.
const CONTENT_GAP = 6;
// Header title: one step below the page `title` (24/32) so the bar stays
// quiet; first line centred on the back control.
const TITLE_SIZE = 22;
const TITLE_LINE = 28;

// SkyNex top bar for pushed / detail screens:
//
//   [Back] [Title · optional subtitle ..........] [Optional action]
//
// Lives at the top of the screen's own content (the stacks hide React
// Navigation's header), so the safe-area inset, back gestures and hardware
// back are exactly as before. Quiet by design: neutral controls, primary
// title, secondary subtitle — no orange in the bar.
export function SkyTopBar({ fontsReady, onBack, right, subtitle, title, titleNumberOfLines = 1 }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <SkyTopBarAction accessibilityLabel="Quay lại" onPress={onBack}>
        <ChevronLeft color={colors.textPrimary} size={22} strokeWidth={2.2} />
      </SkyTopBarAction>

      <View style={styles.titleBlock}>
        <SkyText
          accessibilityRole="header"
          // Same size on every screen: a title that doesn't fit ends in an
          // ellipsis rather than shrinking (screen readers still read it all).
          ellipsizeMode="tail"
          fontsReady={fontsReady}
          numberOfLines={titleNumberOfLines}
          style={styles.title}
          variant="title"
        >
          {title}
        </SkyText>
        {subtitle ? (
          <SkyText fontsReady={fontsReady} numberOfLines={2} style={styles.subtitle} tone="secondary" variant="caption">
            {subtitle}
          </SkyText>
        ) : null}
      </View>

      {right}
    </View>
  );
}

// The shared control: a 40pt round, neutral raised button inside a 44pt
// touch target. Back uses it; a screen's right action should too.
export function SkyTopBarAction({
  accessibilityHint,
  accessibilityLabel,
  children,
  onPress
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  children: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}
    >
      <View style={styles.control}>{children}</View>
    </Pressable>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    // Back and action align with the title's first line; a subtitle grows
    // the bar downward without moving them.
    row: {
      alignItems: "flex-start",
      flexDirection: "row",
      // The control's own 2pt inset inside its target already separates it
      // from the title, so a tighter gap gives the title more width.
      gap: space.xs,
      marginBottom: CONTENT_GAP,
      minHeight: TARGET
    },
    target: {
      alignItems: "center",
      height: TARGET,
      justifyContent: "center",
      width: TARGET
    },
    control: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: CONTROL_RADIUS,
      borderWidth: StyleSheet.hairlineWidth,
      height: CONTROL,
      justifyContent: "center",
      width: CONTROL
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      paddingTop: (TARGET - TITLE_LINE) / 2
    },
    title: {
      fontSize: TITLE_SIZE,
      lineHeight: TITLE_LINE
    },
    // Same caption size; a little more line height and separation so two
    // lines read easily without getting heavier.
    subtitle: {
      lineHeight: 18,
      marginTop: 4
    },
    // Restrained: opacity only.
    pressed: {
      opacity: 0.7
    }
  });
}
