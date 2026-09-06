import { ChevronLeft } from "lucide-react-native";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing, type } from "../theme";

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  fontsReady: boolean;
  onBack: () => void;
  right?: ReactNode;
};

export function ScreenHeader({ title, subtitle, meta, fontsReady, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="Quay lại"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <ChevronLeft color={colors.textHi} size={22} />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text numberOfLines={1} style={[styles.title, font("display", fontsReady)]}>
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={2} style={[styles.subtitle, font("body", fontsReady)]}>
            {subtitle}
          </Text>
        )}
      </View>

      {right}
      {!right && meta && <Text style={[styles.meta, font("mono", fontsReady)]}>{meta}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xxs
  },
  title: {
    ...type.title,
    color: colors.textHi
  },
  subtitle: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.xxs
  },
  meta: {
    ...type.mono,
    color: colors.textLo,
    marginTop: spacing.sm + 4
  },
  pressed: {
    opacity: 0.78
  }
});
