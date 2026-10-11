import { Check, LogOut, Moon, Sun, User } from "lucide-react-native";
import { ComponentType, Fragment, ReactNode, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { SkyButton, SkyCard, SkySection, SkyText } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { useAppTheme } from "../ThemeContext";
import { ThemeMode } from "../theme";

type Props = {
  fontsReady: boolean;
};

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

// Profile V2 — the user's own SkyNex area (the "Profile" tab; the Home avatar
// opens it too). It answers who you are using SkyNex as, and where your
// preferences are. Only what the app really knows is shown:
//
//   • Identity comes from the auth status alone. There is no account backend
//     yet, so no name, email, photo, plan or sync is ever shown or implied.
//   • Appearance is the existing theme state (Light / Dark); no other theme
//     source, no "System" option the app doesn't have.
//   • No rows for features that don't exist (language, notifications, about,
//     version) and no robot shortcut — the Robot tab is that.
//
// Leaving guest or signing out only changes the auth status; AppEntry then
// swaps the Main App for the auth flow, so nothing here navigates. E-STOP
// lives above that gate (App.tsx) and is untouched by it.
export function SettingsScreen({ fontsReady }: Props) {
  const { colors } = useSkyNexTokens();
  const { mode, setMode } = useAppTheme();
  const { signOut, status } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const signedIn = status === "signedIn";

  return (
    <ScrollView
      accessibilityLabel="Hồ sơ"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {/* Root tab: a page title, no back button. */}
      <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="title">
        Hồ sơ
      </SkyText>

      <IdentityCard colors={colors} fontsReady={fontsReady} onAuth={signOut} signedIn={signedIn} styles={styles} />

      <SkySection fontsReady={fontsReady} title="Cài đặt">
        <AppearanceGroup colors={colors} fontsReady={fontsReady} mode={mode} onChange={setMode} styles={styles} />
      </SkySection>

      {signedIn && (
        <SkySection fontsReady={fontsReady} title="Tài khoản">
          <SkyCard style={styles.group}>
            <Row
              accessibilityHint="Thoát khỏi tài khoản và quay về màn hình chào mừng"
              accessibilityLabel="Đăng xuất"
              colors={colors}
              fontsReady={fontsReady}
              Icon={LogOut}
              onPress={signOut}
              styles={styles}
              title="Đăng xuất"
              tone="danger"
            />
          </SkyCard>
        </SkySection>
      )}
    </ScrollView>
  );
}

// Who you are using SkyNex as. Guest is a complete, intentional state — the
// robot works over the local network without an account — with one way into
// the existing auth entry (Welcome: sign in or create an account).
function IdentityCard({
  colors,
  fontsReady,
  onAuth,
  signedIn,
  styles
}: {
  colors: SkyNexColors;
  fontsReady: boolean;
  onAuth: () => void;
  signedIn: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  // A real session has no profile fields yet; when the backend provides a
  // name / email, they replace this generic line — never placeholders.
  const title = signedIn ? "Đã đăng nhập" : "Khách";
  const subtitle = signedIn
    ? "Bạn đang dùng SkyNex với tài khoản của mình."
    : "Bạn đang sử dụng SkyNex mà không cần tài khoản.";

  return (
    <SkyCard style={styles.card}>
      <View accessibilityLabel={`${title}. ${subtitle}`} accessible style={styles.identity}>
        <View style={styles.avatar}>
          <User color={colors.textPrimary} size={28} strokeWidth={1.75} />
        </View>
        <View style={styles.identityText}>
          <SkyText fontsReady={fontsReady} numberOfLines={2} variant="title">
            {title}
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary">
            {subtitle}
          </SkyText>
        </View>
      </View>

      {!signedIn && (
        <SkyButton
          accessibilityHint="Mở màn hình chào mừng để đăng nhập hoặc tạo tài khoản"
          accessibilityLabel="Đăng nhập hoặc tạo tài khoản"
          fontsReady={fontsReady}
          onPress={onAuth}
        >
          Đăng nhập hoặc tạo tài khoản
        </SkyButton>
      )}
    </SkyCard>
  );
}

// Light / Dark — the two modes the app has — as a radio group of quiet rows.
// The selection reads from the checkmark and the radio state, never from
// filling the row with accent.
function AppearanceGroup({
  colors,
  fontsReady,
  mode,
  onChange,
  styles
}: {
  colors: SkyNexColors;
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
    <SkyCard accessibilityLabel="Giao diện" accessibilityRole="radiogroup" style={styles.group}>
      <SkyText fontsReady={fontsReady} style={styles.groupLabel} tone="secondary" variant="caption">
        Giao diện
      </SkyText>
      {options.map((option) => {
        const selected = mode === option.value;
        return (
          <Fragment key={option.value}>
            <View style={styles.divider} />
            <Row
              accessibilityLabel={`Giao diện ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              colors={colors}
              fontsReady={fontsReady}
              Icon={option.icon}
              onPress={() => onChange(option.value)}
              right={selected ? <Check color={colors.accentInk} size={20} strokeWidth={2.5} /> : null}
              styles={styles}
              title={option.label}
            />
          </Fragment>
        );
      })}
    </SkyCard>
  );
}

// Shared row: icon, title, fixed-width accessory slot (so a checkmark never
// shifts the label). `danger` tints the icon and label only — restrained,
// never a filled red button.
function Row({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  colors,
  fontsReady,
  Icon,
  onPress,
  right,
  styles,
  title,
  tone = "default"
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  accessibilityRole?: "button" | "radio";
  accessibilityState?: { checked?: boolean; selected?: boolean };
  colors: SkyNexColors;
  fontsReady: boolean;
  Icon: IconComponent;
  onPress: () => void;
  right?: ReactNode;
  styles: ReturnType<typeof createStyles>;
  title: string;
  tone?: "default" | "danger";
}) {
  const color = tone === "danger" ? colors.statusDanger : colors.textPrimary;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      // RN web drops `checked` from accessibilityState for role=radio.
      aria-checked={accessibilityRole === "radio" ? accessibilityState?.checked : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Icon color={tone === "danger" ? colors.statusDanger : colors.textSecondary} size={19} />
      </View>
      <SkyText fontsReady={fontsReady} numberOfLines={1} style={[styles.rowTitle, { color }]} variant="cardTitle">
        {title}
      </SkyText>
      <View style={styles.rowAccessory}>{right}</View>
    </Pressable>
  );
}

const ROW_ICON = 40;

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: layout.sectionGap,
      paddingBottom: space.xxxl + layout.floatingEStopClearance,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    card: {
      borderRadius: corner.productCard,
      gap: space.lg,
      padding: layout.productCardPadding
    },
    identity: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md
    },
    avatar: {
      alignItems: "center",
      backgroundColor: colors.robotSurface,
      borderRadius: corner.pill,
      height: 64,
      justifyContent: "center",
      width: 64
    },
    // minWidth 0 lets long copy (and, later, long names) wrap instead of
    // pushing past the card.
    identityText: {
      flex: 1,
      gap: 2,
      minWidth: 0
    },
    // One grouped surface per setting; rows inside are split by hairlines,
    // never nested cards.
    group: {
      borderRadius: corner.productCard,
      overflow: "hidden",
      padding: 0
    },
    groupLabel: {
      paddingBottom: space.xs,
      paddingHorizontal: layout.productCardPadding,
      paddingTop: space.md
    },
    divider: {
      backgroundColor: colors.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.productCardPadding + ROW_ICON + space.md
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      minHeight: 56,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.xs
    },
    rowIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.pill,
      height: ROW_ICON,
      justifyContent: "center",
      width: ROW_ICON
    },
    rowTitle: {
      flex: 1
    },
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
