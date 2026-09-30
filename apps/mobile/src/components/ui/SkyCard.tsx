import { useMemo } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { corner } from "../../design-system/radius";
import { layout } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";

export type SkyCardProps = ViewProps;

// Universal SkyNex card container (default variant only). Depth comes from
// the surface-on-background contrast plus a restrained border — this app
// uses no shadows anywhere, and cards shouldn't be the first to add one.
export function SkyCard({ style, ...rest }: SkyCardProps) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return <View {...rest} style={[styles.card, style]} />;
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: corner.card,
      borderWidth: 1,
      padding: layout.cardPadding
    }
  });
}
