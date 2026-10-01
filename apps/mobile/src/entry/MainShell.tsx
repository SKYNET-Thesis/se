import { useNavigationContainerRef } from "@react-navigation/native";
import { ShieldAlert, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlobalChrome } from "../components/GlobalChrome";
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

// The main app as the user knows it: GlobalChrome (with E-STOP) above the
// tab navigator, plus the Reset confirmation. Moved out of App.tsx as-is —
// mounted only in the entry flow's "app" phase, so the tabs never mount
// early and the chrome never appears over onboarding or the auth entry.
export function MainShell({
  emergencyStopped,
  fontsReady,
  onEmergencyStop,
  onResetEmergencyStop,
  reduceMotion
}: Props) {
  const { colors: themeColors } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [activeRouteName, setActiveRouteName] = useState<string | undefined>("HomeMain");
  // Owned here (not inside AppNavigator) so the Home avatar's "open Settings
  // > Tài khoản" shortcut below can imperatively navigate — GlobalChrome is
  // mounted above the whole navigator and has no navigation prop of its own.
  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const openAccountSettings = () => navigationRef.current?.navigate("Settings");

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
    <>
      <SafeAreaView
        edges={["top", "left", "right", "bottom"]}
        style={[styles.safe, { backgroundColor: themeColors.background }]}
      >
        <GlobalChrome
          emergencyStopped={emergencyStopped}
          fontsReady={fontsReady}
          isHome={activeRouteName === "HomeMain"}
          onEmergencyStop={onEmergencyStop}
          onOpenAccount={openAccountSettings}
          onResetEmergencyStop={requestResetEmergencyStop}
        />
        <View style={styles.content}>
          <AppNavigator
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            navigationRef={navigationRef}
            onActiveRouteChange={setActiveRouteName}
            onEmergencyStop={onEmergencyStop}
            reduceMotion={reduceMotion}
          />
        </View>
      </SafeAreaView>

      <ResetConfirmModal
        colors={themeColors}
        fontsReady={fontsReady}
        onCancel={cancelResetEmergencyStop}
        onConfirm={confirmResetEmergencyStop}
        styles={styles}
        visible={resetConfirmVisible}
      />
    </>
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
