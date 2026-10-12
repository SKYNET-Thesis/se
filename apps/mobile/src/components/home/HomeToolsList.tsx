import { Bot, Camera, ChevronRight } from "lucide-react-native";
import { Fragment, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import type { HomeRoute } from "../../screens/HomeScreen";
import { SkyCard, SkyText } from "../ui";

type Props = {
  fontsReady: boolean;
  onOpenRoute: (route: HomeRoute) => void;
};

// The two other places to go from Home, by their tab names. Skills has its
// own section right above; Profile is the avatar. Robot opens the Robot hub
// (where Manual, Phone, Connect, Calibration and Status live) rather than
// bypassing it. Neither row moves the robot, so neither is locked by E-STOP.
// Vision says only where it goes — never that a camera is live.
const DESTINATIONS: readonly { route: HomeRoute; title: string; description: string; icon: typeof Bot }[] = [
  { route: "robot", title: "Robot", description: "Điều khiển, kết nối và hiệu chỉnh", icon: Bot },
  { route: "camera", title: "Vision", description: "Góc nhìn camera của robot", icon: Camera }
];

// Quiet grouped rows — secondary to the readiness CTA, never competing tiles.
export function HomeToolsList({ fontsReady, onOpenRoute }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SkyCard style={styles.card}>
      {DESTINATIONS.map(({ route, title, description, icon: Icon }, index) => (
        <Fragment key={route}>
          {index > 0 && <View style={styles.divider} />}
          <Pressable
            accessibilityHint={description}
            accessibilityLabel={title}
            accessibilityRole="button"
            onPress={() => onOpenRoute(route)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Icon color={colors.textPrimary} size={19} />
            </View>
            <View style={styles.text}>
              <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
                {title}
              </SkyText>
              <SkyText fontsReady={fontsReady} numberOfLines={1} style={styles.description} variant="caption">
                {description}
              </SkyText>
            </View>
            <ChevronRight color={colors.textSecondary} size={18} />
          </Pressable>
        </Fragment>
      ))}
    </SkyCard>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    card: {
      borderRadius: corner.productCard,
      overflow: "hidden",
      padding: 0
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
      minHeight: 64,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.sm
    },
    // Inset to the text column, iOS grouped-list style.
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.productCardPadding + 40 + space.sm
    },
    iconWrap: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.pill,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    text: {
      flex: 1,
      gap: 2
    },
    // A touch stronger than the secondary tone, from the primary text token
    // (works in Light and Dark; no new colour), still clearly subordinate to
    // the title.
    description: {
      color: colors.textPrimary,
      opacity: 0.72
    },
    pressed: {
      opacity: 0.78
    }
  });
}
