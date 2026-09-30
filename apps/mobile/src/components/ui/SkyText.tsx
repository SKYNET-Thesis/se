import { Text, TextProps } from "react-native";
import { useSkyNexTokens } from "../../design-system/tokens";
import { textStyle, TextRole } from "../../design-system/typography";

export type SkyTextTone = "primary" | "secondary";

export type SkyTextProps = TextProps & {
  variant?: TextRole;
  // Only the two text colors the theme defines. Anything else (e.g. text on
  // an accent fill) is the owning component's job via `style`.
  tone?: SkyTextTone;
  // Same contract as theme.ts `font()`: system fallback until fonts load.
  fontsReady?: boolean;
};

// Central SkyNex typography primitive. Size, line height, weight and family
// all come from design-system/typography.ts — never set them inline here.
export function SkyText({ variant = "body", tone = "primary", fontsReady = true, style, ...rest }: SkyTextProps) {
  const { colors } = useSkyNexTokens();
  const color = tone === "secondary" ? colors.textSecondary : colors.textPrimary;

  return <Text {...rest} style={[textStyle(variant, fontsReady), { color }, style]} />;
}
