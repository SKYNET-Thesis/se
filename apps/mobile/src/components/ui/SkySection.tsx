import { ReactNode } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { layout } from "../../design-system/spacing";
import { SkyText } from "./SkyText";

export type SkySectionProps = ViewProps & {
  title: string;
  subtitle?: string;
  // Optional trailing header control, e.g. a "Xem tất cả" link.
  action?: ReactNode;
  children?: ReactNode;
  fontsReady?: boolean;
};

// Reusable page section: heading block, then content. Horizontal gutter is
// left to the screen's own content container (which already applies
// layout.screenGutter), so sections stack without double padding.
export function SkySection({ action, children, fontsReady = true, style, subtitle, title, ...rest }: SkySectionProps) {
  return (
    <View {...rest} style={[styles.section, style]}>
      <View style={styles.header}>
        {/* The action aligns with the title line, not the title+subtitle block. */}
        <View style={styles.titleRow}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} style={styles.title} variant="sectionTitle">
            {title}
          </SkyText>
          {action}
        </View>
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
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: layout.stackGap
  },
  title: {
    flex: 1
  }
});
