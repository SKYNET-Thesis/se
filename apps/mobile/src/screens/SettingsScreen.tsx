import { Check, ChevronRight, Moon, Sun, User } from "lucide-react-native";
import { ComponentType, ReactNode, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../ThemeContext";
import { font, radius, spacing, ThemeColors, ThemeMode, type } from "../theme";

type Props = {
  fontsReady: boolean;
};

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Tài khoản</Text>
        <View style={styles.group}>
          <SettingsRow
            accessibilityHint="Quản lý tài khoản"
            accessibilityLabel="Tài khoản"
            accessibilityRole="button"
            colors={colors}
            fontsReady={fontsReady}
            Icon={User}
            onPress={() => {
              // TODO(account): route to real auth/account management once a
              // backend exists. No fake login/register flow in the meantime.
            }}
            right={<ChevronRight color={colors.textSecondary} size={20} />}
            styles={styles}
            subtitle="Chưa đăng nhập"
            title="Tài khoản"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Giao diện</Text>
        <AppearanceGroup colors={colors} fontsReady={fontsReady} mode={mode} onChange={setMode} styles={styles} />
      </View>
    </ScrollView>
  );
}

// Same LEFT icon / CENTER text / RIGHT accessory grammar as the account row
// above — a plain radiogroup of two full-width rows, not the old segmented
// control. Selection reads from the checkmark alone (see SettingsRow's
// `right` prop below), never from filling the row with accent.
function AppearanceGroup({
  colors,
  fontsReady,
  mode,
  onChange,
  styles
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const options: { icon: IconComponent; label: string; value: ThemeMode }[] = [
    { icon: Sun, label: "Sáng", value: "light" },
    { icon: Moon, label: "Tối", value: "dark" }
  ];

  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {options.map((option, index) => {
        const selected = mode === option.value;
        return (
          <View key={option.value}>
            {index > 0 && <View style={styles.rowDivider} />}
            <SettingsRow
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              colors={colors}
              fontsReady={fontsReady}
              Icon={option.icon}
              onPress={() => onChange(option.value)}
              right={selected ? <Check color={colors.accentStrong} size={20} strokeWidth={2.5} /> : null}
              styles={styles}
              title={option.label}
            />
          </View>
        );
      })}
    </View>
  );
}

// Shared row primitive: icon chip left, title (+ optional subtitle) center,
// a fixed-width accessory slot right. Both the account row and the two
// theme rows are built from this so they read as one visual language —
// only what fills `right` (chevron vs. checkmark) tells them apart.
function SettingsRow({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  colors,
  fontsReady,
  Icon,
  onPress,
  right,
  styles,
  subtitle,
  title
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  accessibilityRole: "button" | "radio";
  accessibilityState?: { selected?: boolean; checked?: boolean };
  colors: ThemeColors;
  fontsReady: boolean;
  Icon: IconComponent;
  onPress: () => void;
  right?: ReactNode;
  styles: ReturnType<typeof createStyles>;
  subtitle?: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Icon color={colors.textSecondary} size={20} strokeWidth={2} />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, font("display", fontsReady)]}>{title}</Text>
        {subtitle && <Text style={[styles.rowSubtitle, font("body", fontsReady)]}>{subtitle}</Text>}
      </View>

      <View style={styles.rowAccessory}>{right}</View>
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
    section: {
      gap: spacing.sm
    },
    sectionTitle: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    // One shared grouped surface per section — rows inside share this
    // border/radius and are separated by a plain 1px divider, never nested
    // cards of their own.
    group: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      overflow: "hidden"
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      minHeight: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    rowDivider: {
      backgroundColor: colors.border,
      height: 1
    },
    // Same chip treatment for every row's leading icon — the account
    // avatar and the Sun/Moon glyphs all sit in this, which is what makes
    // the two sections read as one grammar rather than two components.
    rowIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.round,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44
    },
    rowText: {
      flex: 1,
      gap: 2
    },
    rowLabel: {
      ...type.bodyStrong,
      color: colors.textPrimary
    },
    rowSubtitle: {
      ...type.small,
      color: colors.textSecondary
    },
    // Fixed width so a selected row's checkmark never shifts the label
    // column relative to its unselected sibling.
    rowAccessory: {
      alignItems: "flex-end",
      justifyContent: "center",
      width: 24
    },
    pressed: {
      opacity: 0.78
    }
  });
}
