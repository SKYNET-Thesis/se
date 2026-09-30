import { ReactNode } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { layout } from "../../design-system/spacing";
import { SkyText } from "./SkyText";

export type SkySectionProps = ViewProps & {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  fontsReady?: boolean;
};

// Reusable page section: heading block, then content. Horizontal gutter is
// left to the screen's own content container (which already applies
// layout.screenGutter), so sections stack without double padding.
export function SkySection({ children, fontsReady = true, style, subtitle, title, ...rest }: SkySectionProps) {
  return (
    <View {...rest} style={[styles.section, style]}>
      <View style={styles.header}>
        <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
          {title}
        </SkyText>
        {subtitle ? (
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            {subtitle}
          </SkyText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: layout.stackGap
  },
  header: {
    gap: layout.hairlineGap
  }
});
