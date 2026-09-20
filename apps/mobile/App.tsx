import { useNavigationContainerRef } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ShieldAlert, X } from "lucide-react-native";
import { GlobalChrome } from "./src/components/GlobalChrome";
import { AppNavigator, RootTabParamList } from "./src/navigation/AppNavigator";
import { OnboardingScreen } from "./src/onboarding/OnboardingScreen";
import { hasCompletedOnboarding } from "./src/services/onboardingStorage";
import { appFontSources, font, radius, spacing, ThemeColors, type } from "./src/theme";
import { DEV_INITIAL_THEME_MODE } from "./src/devConfig";
import { ThemeProvider, useAppTheme } from "./src/ThemeContext";

export default function App() {
  return (
    <ThemeProvider initialMode={DEV_INITIAL_THEME_MODE}>
      <AppShell />
    </ThemeProvider>
  );
}

// Split out so it can call useAppTheme() — the provider above has to be the
// outermost component since context can't be read by the component that
// renders it.
function AppShell() {
  const { colors: themeColors, mode: themeMode } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [activeRouteName, setActiveRouteName] = useState<string | undefined>("HomeMain");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [fontsLoaded, fontError] = useFonts(appFontSources);
  const fontsReady = fontsLoaded && !fontError;
  const bootReady = fontsReady && onboardingChecked;
  // Owned here (not inside AppNavigator) so the Home avatar's "open Settings
  // > Tài khoản" shortcut below can imperatively navigate — GlobalChrome is
  // mounted above the whole navigator and has no navigation prop of its own.
  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const openAccountSettings = () => navigationRef.current?.navigate("Settings");
  // Single source of truth for E-STOP activation — GlobalChrome's button and
  // Phone Teleop's fullscreen overlay button (the only other place a user
  // can be actively driving the robot with no other E-STOP control on
  // screen) both call this same setter instead of each owning their own
  // "stopped" state.
  const activateEmergencyStop = () => setEmergencyStopped(true);

  useEffect(() => {
    // A previous Phone Teleop session may have left the OS in landscape after a
    // reload/background restart. The phone screen takes landscape ownership
    // again only while it is mounted.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    hasCompletedOnboarding().then((completed) => {
      if (!mounted) return;
      setShowOnboarding(!completed);
      setOnboardingChecked(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const requestResetEmergencyStop = () => {
    setResetConfirmVisible(true);
  };

  const confirmResetEmergencyStop = () => {
    setEmergencyStopped(false);
    setResetConfirmVisible(false);
  };

  const cancelResetEmergencyStop = () => {
    setResetConfirmVisible(false);
  };

  if (!bootReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.safe, { backgroundColor: themeColors.background }]}>
          <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
          <View style={[styles.loading, { backgroundColor: themeColors.background }]}>
            <Text style={[styles.loadingTitle, { color: themeColors.textPrimary }, font("display", false)]}>OmniArm</Text>
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }, font("body", false)]}>
              Đang nạp giao diện
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OnboardingScreen
          fontsReady={fontsReady}
          onComplete={() => setShowOnboarding(false)}
          reduceMotion={reduceMotion}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={["top", "left", "right", "bottom"]}
        style={[styles.safe, { backgroundColor: themeColors.background }]}
      >
        <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
        <GlobalChrome
          emergencyStopped={emergencyStopped}
          fontsReady={fontsReady}
          isHome={activeRouteName === "HomeMain"}
          onEmergencyStop={activateEmergencyStop}
          onOpenAccount={openAccountSettings}
          onResetEmergencyStop={requestResetEmergencyStop}
        />
        <View style={styles.content}>
          <AppNavigator
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            navigationRef={navigationRef}
            onActiveRouteChange={setActiveRouteName}
            onEmergencyStop={activateEmergencyStop}
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
    </SafeAreaProvider>
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
    loading: {
      alignItems: "center",
      backgroundColor: colors.background,
      flex: 1,
      gap: 8,
      justifyContent: "center"
    },
    loadingTitle: {
      ...type.title,
      color: colors.textPrimary
    },
    loadingText: {
      ...type.body,
      color: colors.textSecondary
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
