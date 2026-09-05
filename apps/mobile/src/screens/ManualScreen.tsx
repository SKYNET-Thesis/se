import { CheckCircle2, Hand, LockKeyhole, Radio, RotateCcw, ShieldAlert, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ManualControls } from "../components/ManualControls";

export function ManualScreen() {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [manualEnabled, setManualEnabled] = useState(false);
  const [emergencyStopped, setEmergencyStopped] = useState(false);

  const enableManual = () => {
    setManualEnabled(true);
    setConfirmVisible(false);
  };

  const emergencyStop = () => {
    setEmergencyStopped(true);
    setManualEnabled(false);
  };

  const resetEmergencyStop = () => {
    setEmergencyStopped(false);
    setResetVisible(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>DIRECT CONTROL</Text>
            <Text style={styles.title}>Manual mode</Text>
            <Text style={styles.subtitle}>SO-101 · Lab station 01</Text>
          </View>
          <View style={[styles.modePill, manualEnabled && styles.modePillEnabled, emergencyStopped && styles.modePillStopped]}>
            {emergencyStopped ? (
              <ShieldAlert size={15} color="#ff9b9f" />
            ) : manualEnabled ? (
              <Hand size={15} color="#20265f" />
            ) : (
              <LockKeyhole size={15} color="#aab3ae" />
            )}
            <Text style={[styles.modeText, manualEnabled && styles.modeTextEnabled, emergencyStopped && styles.modeTextStopped]}>
              {emergencyStopped ? "Stopped" : manualEnabled ? "Enabled" : "Locked"}
            </Text>
          </View>
        </View>

        <View style={styles.readinessCard}>
          <View style={styles.readinessRow}>
            <CheckCircle2 size={17} color="#65dca1" />
            <Text style={styles.readinessLabel}>Robot connection</Text>
            <Text style={styles.readinessValue}>Ready</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.readinessRow}>
            <Radio size={17} color="#65dca1" />
            <Text style={styles.readinessLabel}>Telemetry freshness</Text>
            <Text style={styles.readinessValue}>18 ms</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.readinessRow}>
            <ShieldAlert size={17} color={emergencyStopped ? "#ff7d82" : "#65dca1"} />
            <Text style={styles.readinessLabel}>Safety circuit</Text>
            <Text style={[styles.readinessValue, emergencyStopped && styles.dangerText]}>
              {emergencyStopped ? "E-Stop" : "Closed"}
            </Text>
          </View>
        </View>

        {!manualEnabled && !emergencyStopped && (
          <Pressable onPress={() => setConfirmVisible(true)} style={({ pressed }) => [styles.enableButton, pressed && styles.pressed]}>
            <Hand size={20} color="#20265f" />
            <Text style={styles.enableText}>Enable Manual Mode</Text>
          </Pressable>
        )}

        {emergencyStopped && (
          <Pressable onPress={() => setResetVisible(true)} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
            <RotateCcw size={19} color="#ffd0d2" />
            <Text style={styles.resetText}>Reset E-Stop</Text>
          </Pressable>
        )}

        <ManualControls
          enabled={manualEnabled}
          emergencyStopped={emergencyStopped}
          onEmergencyStop={emergencyStop}
        />
      </ScrollView>

      <ConfirmationModal
        visible={confirmVisible}
        title="Enable Manual Mode?"
        body="Direct jog commands will be sent to the robot. Keep the work area clear and release any jog button to stop motion."
        confirmLabel="Enable control"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={enableManual}
      />
      <ConfirmationModal
        visible={resetVisible}
        title="Reset emergency stop?"
        body="Verify that the work area is clear and the physical emergency stop has been released."
        confirmLabel="Reset E-Stop"
        danger
        onCancel={() => setResetVisible(false)}
        onConfirm={resetEmergencyStop}
      />
    </>
  );
}

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmationModal({ visible, title, body, confirmLabel, danger, onCancel, onConfirm }: ConfirmationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, danger && styles.modalIconDanger]}>
              {danger ? <ShieldAlert size={22} color="#ff8589" /> : <Hand size={22} color="#66e0ff" />}
            </View>
            <Pressable accessibilityLabel="Close" onPress={onCancel} style={styles.closeButton}>
              <X size={19} color="#aeb7b2" />
            </Pressable>
          </View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.confirmButton, danger && styles.confirmButtonDanger]}>
              <Text style={[styles.confirmText, danger && styles.confirmTextDanger]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 30,
    gap: 14
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  eyebrow: {
    color: "#f4bd4f",
    fontSize: 10,
    fontWeight: "900"
  },
  title: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 2
  },
  subtitle: {
    color: "#b5b9de",
    fontSize: 12,
    marginTop: 3
  },
  modePill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)"
  },
  modePillEnabled: {
    backgroundColor: "#66e0ff"
  },
  modePillStopped: {
    backgroundColor: "#3a1f21"
  },
  modeText: {
    color: "#aab3ae",
    fontSize: 11,
    fontWeight: "900"
  },
  modeTextEnabled: {
    color: "#20265f"
  },
  modeTextStopped: {
    color: "#ffb3b6"
  },
  readinessCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    paddingHorizontal: 13
  },
  readinessRow: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  readinessLabel: {
    flex: 1,
    color: "#aab3ae",
    fontSize: 12,
    fontWeight: "700"
  },
  readinessValue: {
    color: "#aef0d0",
    fontSize: 11,
    fontWeight: "900"
  },
  dangerText: {
    color: "#ff9b9f"
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  enableButton: {
    height: 52,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#66e0ff"
  },
  enableText: {
    color: "#20265f",
    fontSize: 13,
    fontWeight: "900"
  },
  resetButton: {
    height: 52,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#4a2326",
    borderWidth: 1,
    borderColor: "#75383d"
  },
  resetText: {
    color: "#ffd0d2",
    fontSize: 13,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }]
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#090a09cc"
  },
  modalCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    padding: 18
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  modalIcon: {
    width: 42,
    height: 42,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#32688a"
  },
  modalIconDanger: {
    backgroundColor: "#3a1f21"
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  modalTitle: {
    color: "#f2f5f3",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 16
  },
  modalBody: {
    color: "#a2aca6",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8
  },
  modalActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 20
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  cancelText: {
    color: "#c3cbc7",
    fontSize: 12,
    fontWeight: "800"
  },
  confirmButton: {
    flex: 1.3,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#66e0ff"
  },
  confirmButtonDanger: {
    backgroundColor: "#ef5b61"
  },
  confirmText: {
    color: "#20265f",
    fontSize: 12,
    fontWeight: "900"
  },
  confirmTextDanger: {
    color: "#250709"
  }
});
