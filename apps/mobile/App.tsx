import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ShieldAlert, X } from "lucide-react-native";
import { GlobalChrome } from "./src/components/GlobalChrome";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { appFontSources, colors, font, radius, spacing, type } from "./src/theme";

export default function App() {
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fontsLoaded, fontError] = useFonts(appFontSources);
  const fontsReady = fontsLoaded && !fontError;

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

  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safe}>
          <View style={styles.loading}>
            <Text style={[styles.loadingTitle, font("display", false)]}>OmniArm</Text>
            <Text style={[styles.loadingText, font("body", false)]}>Đang nạp giao diện</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safe}>
        <StatusBar style="light" />
        <GlobalChrome
          emergencyStopped={emergencyStopped}
          fontsReady={fontsReady}
          onEmergencyStop={() => setEmergencyStopped(true)}
          onResetEmergencyStop={requestResetEmergencyStop}
        />
        <View style={styles.content}>
          <AppNavigator
            emergencyStopped={emergencyStopped}
            fontsReady={fontsReady}
            reduceMotion={reduceMotion}
          />
        </View>
      </SafeAreaView>

      <ResetConfirmModal
        fontsReady={fontsReady}
        onCancel={cancelResetEmergencyStop}
        onConfirm={confirmResetEmergencyStop}
        visible={resetConfirmVisible}
      />
    </SafeAreaProvider>
  );
}

function ResetConfirmModal({
  fontsReady,
  onCancel,
  onConfirm,
  visible
}: {
  fontsReady: boolean;
  onCancel: () => void;
  onConfirm: () => void;
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
              <X color={colors.textHi} size={18} />
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    flex: 1
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    gap: 8,
    justifyContent: "center"
  },
  loadingTitle: {
    ...type.title,
    color: colors.textHi
  },
  loadingText: {
    ...type.body,
    color: colors.textLo
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: colors.bg,
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
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  modalTitle: {
    ...type.title,
    color: colors.textHi
  },
  modalText: {
    ...type.body,
    color: colors.textLo
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  modalSecondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
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
    color: colors.textHi
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
    color: colors.textHi
  },
  pressed: {
    opacity: 0.78
  }
});
