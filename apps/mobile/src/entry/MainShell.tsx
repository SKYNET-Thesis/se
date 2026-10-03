import { useNavigationContainerRef } from "@react-navigation/native";
import { ShieldAlert, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingEStop } from "../components/FloatingEStop";
import { AppNavigator, RootTabParamList } from "../navigation/AppNavigator";
import { font, radius, spacing, ThemeColors, type } from "../theme";
import { useAppTheme } from "../ThemeContext";

type Props = {
  fontsReady: boolean;
  reduceMotion: boolean;
  // E-STOP's source of truth stays in App.tsx, ABOVE the entry gate, so
  // unmounting this shell (e.g. signing out) can never reset a stop. This
  // shell only displays it and asks for changes.
  emergencyStopped: boolean;
  onEmergencyStop: () => void;
  // Called only after the user confirms in the Reset modal below.
  onResetEmergencyStop: () => void;
};

// The main app as the user knows it: the tab navigator, the floating E-STOP
// above every screen, and the Reset confirmation. Mounted only in the entry
// flow's "app" phase, so the tabs never mount early and E-STOP never
// appears over onboarding or the auth entry.
//
// No top bar: the shell reserves no row and no top safe-area edge. Each
// screen gets the top inset from the navigator (AppNavigator's scene
// padding), except hero screens that opt into running edge-to-edge behind
// the status bar (the Skills library).
export function MainShell({
  emergencyStopped,
  fontsReady,
  onEmergencyStop,
  onResetEmergencyStop,
  reduceMotion
}: Props) {
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const insets = useSafeAreaInsets();
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  // Measured by the tab navigator, so the E-STOP's drag region always ends
  // above the real tab bar (0 while it is hidden, e.g. under the keyboard).
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const navigationRef = useNavigationContainerRef<RootTabParamList>();

  const requestResetEmergencyStop = () => {
    setResetConfirmVisible(true);
  };

  const confirmResetEmergencyStop = () => {
    onResetEmergencyStop();
    setResetConfirmVisible(false);
  };

  const cancelResetEmergencyStop = () => {
    setResetConfirmVisible(false);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={[styles.safe, { backgroundColor: themeColors.background }]}
      >
        <View style={styles.content}>
          <AppNavigator
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            navigationRef={navigationRef}
            onEmergencyStop={onEmergencyStop}
            onTabBarHeightChange={setTabBarHeight}
            reduceMotion={reduceMotion}
          />
        </View>
      </SafeAreaView>

      {/* Above every screen. Same App.tsx handler as before; Reset opens the
          same confirmation below. */}
      <FloatingEStop
        bottomReserved={insets.bottom + tabBarHeight}
        emergencyStopped={emergencyStopped}
        fontsReady={fontsReady}
        onEmergencyStop={onEmergencyStop}
        onRequestReset={requestResetEmergencyStop}
        reduceMotion={reduceMotion}
        topInset={insets.top}
      />

      <ResetConfirmModal
        colors={themeColors}
        fontsReady={fontsReady}
        onCancel={cancelResetEmergencyStop}
        onConfirm={confirmResetEmergencyStop}
        styles={styles}
        visible={resetConfirmVisible}
      />
    </View>
  );
}

function ResetConfirmModal({
  colors,
  fontsReady,
  onCancel,
  onConfirm,
  styles,
  visible
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <ShieldAlert color={colors.danger} size={20} />
            </View>
            <Pressable
              accessibilityLabel="Đóng xác nhận Reset"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onCancel}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <X color={colors.textPrimary} size={18} />
            </Pressable>
          </View>

          <Text style={[styles.modalTitle, font("display", fontsReady)]}>Reset E-STOP?</Text>
          <Text style={[styles.modalText, font("body", fontsReady)]}>
            Chỉ reset sau khi đã kiểm tra vùng làm việc và robot đứng yên.
          </Text>

          <View style={styles.modalActions}>
            <Pressable
              accessibilityLabel="Hủy reset E-STOP"
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.modalSecondaryButton, pressed && styles.pressed]}
            >
              <Text style={[styles.modalSecondaryText, font("display", fontsReady)]}>Hủy</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Xác nhận reset E-STOP"
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.modalDangerButton, pressed && styles.pressed]}
            >
              <Text style={[styles.modalDangerText, font("display", fontsReady)]}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1
    },
    safe: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      flex: 1
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: colors.background,
      flex: 1,
      justifyContent: "center",
      opacity: 0.96,
      padding: spacing.lg
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.md,
      width: "100%",
      maxWidth: 420
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    modalIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.button,
      height: 40,
      justifyContent: "center",
      width: 40
    },
    modalClose: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38
    },
    modalTitle: {
      ...type.title,
      color: colors.textPrimary
    },
    modalText: {
      ...type.body,
      color: colors.textSecondary
    },
    modalActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    modalSecondaryButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexGrow: 1,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 120,
      paddingHorizontal: spacing.md
    },
    modalSecondaryText: {
      ...type.label,
      color: colors.textPrimary
    },
    modalDangerButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: radius.button,
      flexGrow: 1,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 120,
      paddingHorizontal: spacing.md
    },
    modalDangerText: {
      ...type.label,
      color: colors.dangerForeground
    },
    pressed: {
      opacity: 0.78
    }
  });
}
