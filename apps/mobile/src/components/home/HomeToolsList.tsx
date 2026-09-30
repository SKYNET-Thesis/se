import { Cable, Camera, ChevronRight, Hand, RotateCcw, Smartphone } from "lucide-react-native";
import { Fragment, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import type { HomeRoute } from "../../screens/HomeScreen";
import { SkyCard, SkyText } from "../ui";

type Props = {
  // Decided by HomeScreen (E-STOP rule); this list only renders it.
  disabledRoutes: readonly HomeRoute[];
  fontsReady: boolean;
  onOpenRoute: (route: HomeRoute) => void;
};

// Product/navigation terms stay English (Vision matches the tab label);
// the human description under each stays Vietnamese.
const TOOLS: readonly { route: HomeRoute; title: string; description: string; icon: typeof Hand }[] = [
  { route: "teleop", title: "Manual Control", description: "Tự điều khiển từng chuyển động", icon: Hand },
  { route: "phone-teleop", title: "Phone Control", description: "Điều khiển bằng điện thoại", icon: Smartphone },
  { route: "camera", title: "Vision", description: "Xem những gì robot đang thấy", icon: Camera },
  { route: "connect", title: "Connect", description: "Kết nối hoặc đổi robot", icon: Cable },
  { route: "calibrate", title: "Calibration", description: "Căn chỉnh lại các khớp", icon: RotateCcw }
];

// Hardware/operator actions, deliberately secondary to the readiness CTA:
// one grouped card of quiet rows instead of competing tiles.
export function HomeToolsList({ disabledRoutes, fontsReady, onOpenRoute }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SkyCard style={styles.card}>
      {TOOLS.map(({ route, title, description, icon: Icon }, index) => {
        const disabled = disabledRoutes.includes(route);
        const iconColor = disabled ? colors.textSecondary : colors.textPrimary;

        return (
          <Fragment key={route}>
            {index > 0 && <View style={styles.divider} />}
            <Pressable
              accessibilityHint={disabled ? "Tạm khóa khi E-STOP đang bật" : description}
              accessibilityLabel={title}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onOpenRoute(route)}
              style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Icon color={iconColor} size={19} />
              </View>
              <View style={styles.text}>
                <SkyText fontsReady={fontsReady} numberOfLines={1} variant="cardTitle">
                  {title}
                </SkyText>
                <SkyText fontsReady={fontsReady} numberOfLines={1} tone="secondary" variant="caption">
                  {disabled ? "Tạm khóa khi E-STOP đang bật" : description}
                </SkyText>
              </View>
              <ChevronRight color={colors.textSecondary} size={18} />
            </Pressable>
          </Fragment>
        );
      })}
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
    disabled: {
      opacity: 0.52
    },
    pressed: {
      opacity: 0.78
    }
  });
}
