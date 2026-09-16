import { ChevronRight, User } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { font, radius, spacing, ThemeColors, ThemeMode, type } from "../theme";

type Props = {
  fontsReady: boolean;
};

// Account management lives HERE, inside Settings — the Home avatar is only
// a shortcut into this screen, never a profile system of its own. This
// section is deliberately first so that shortcut always lands on it.
export function SettingsScreen({ fontsReady }: Props) {
  const { colors, mode, setMode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      accessibilityLabel="Màn hình cài đặt"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <Text style={[styles.pageTitle, font("display", fontsReady)]}>Cài đặt</Text>

      <AccountRow colors={colors} fontsReady={fontsReady} styles={styles} />

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Giao diện</Text>
        <AppearanceControl colors={colors} mode={mode} onChange={setMode} styles={styles} />
      </View>
    </ScrollView>
  );
}

function AccountRow({
  colors,
  fontsReady,
  styles
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityHint="Chưa có tài khoản đăng nhập"
      accessibilityLabel="Tài khoản, chưa đăng nhập. Quản lý tài khoản"
      accessibilityRole="button"
      onPress={() => {
        // TODO(account): route to real auth/account management once a
        // backend exists. No fake login/register flow in the meantime.
      }}
      style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
    >
      <View style={styles.accountAvatar}>
        <User color={colors.textSecondary} size={20} strokeWidth={2} />
      </View>

      <View style={styles.accountText}>
        <Text style={[styles.accountTitle, font("display", fontsReady)]}>Tài khoản</Text>
        <Text style={[styles.accountSubtitle, font("body", fontsReady)]}>Chưa đăng nhập</Text>
        <View style={styles.accountLinkRow}>
          <Text style={[styles.accountLink, font("display", fontsReady)]}>Quản lý tài khoản</Text>
          <ChevronRight color={colors.accentStrong} size={14} />
        </View>
      </View>
    </Pressable>
  );
}

function AppearanceControl({
  colors,
  mode,
  onChange,
  styles
}: {
  colors: ThemeColors;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      <SegmentButton
        active={mode === "light"}
        label="Sáng"
        onPress={() => onChange("light")}
        styles={styles}
      />
      <SegmentButton
        active={mode === "dark"}
        label="Tối"
        onPress={() => onChange("dark")}
        styles={styles}
      />
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
  styles
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && !active && styles.pressed]}
    >
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg
    },
    pageTitle: {
      ...type.title,
      color: colors.textPrimary
    },
    accountRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.md,
      minHeight: 64
    },
    accountAvatar: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    accountText: {
      flex: 1,
      gap: 2,
      paddingTop: 2
    },
    accountTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    accountSubtitle: {
      ...type.small,
      color: colors.textSecondary
    },
    accountLinkRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      marginTop: spacing.xxs
    },
    accountLink: {
      ...type.label,
      color: colors.accentStrong
    },
    divider: {
      backgroundColor: colors.border,
      height: 1
    },
    section: {
      gap: spacing.sm
    },
    sectionTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    segmented: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      padding: 4
    },
    segment: {
      alignItems: "center",
      borderRadius: radius.button - 2,
      flex: 1,
      justifyContent: "center",
      minHeight: 40
    },
    segmentActive: {
      backgroundColor: colors.accent
    },
    segmentLabel: {
      ...type.label,
      color: colors.textSecondary
    },
    segmentLabelActive: {
      color: colors.accentForeground
    },
    pressed: {
      opacity: 0.78
    }
  });
}
