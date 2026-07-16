import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Hand, Pause, RotateCcw, RotateCw, Square } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const buttons = [
  { label: "Up", icon: ChevronUp },
  { label: "Left", icon: ChevronLeft },
  { label: "Right", icon: ChevronRight },
  { label: "Down", icon: ChevronDown }
];

export function ManualControls() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Manual Mode</Text>
          <Text style={styles.caption}>Jog arm axes and gripper for demo control</Text>
        </View>
        <View style={styles.modePill}>
          <Hand size={14} color="#111211" />
          <Text style={styles.modeText}>Manual</Text>
        </View>
      </View>

      <View style={styles.controlRow}>
        <View style={styles.dpad}>
          {buttons.map(({ label, icon: Icon }) => (
            <Pressable key={label} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Icon size={22} color="#edf1ef" />
            </Pressable>
          ))}
        </View>

        <View style={styles.actionGrid}>
          <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <RotateCcw size={20} color="#7ee4b8" />
            <Text style={styles.actionText}>Base -</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <RotateCw size={20} color="#7ee4b8" />
            <Text style={styles.actionText}>Base +</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Pause size={20} color="#e7b443" />
            <Text style={styles.actionText}>Hold</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}>
            <Square size={19} color="#250709" />
            <Text style={styles.stopText}>E-Stop</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#313733",
    padding: 14,
    gap: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center"
  },
  title: {
    color: "#edf1ef",
    fontSize: 15,
    fontWeight: "800"
  },
  caption: {
    color: "#8b948f",
    fontSize: 12,
    marginTop: 3
  },
  modePill: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#7ee4b8",
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  modeText: {
    color: "#111211",
    fontSize: 12,
    fontWeight: "900"
  },
  controlRow: {
    flexDirection: "row",
    gap: 14
  },
  dpad: {
    width: 126,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  iconButton: {
    width: 56,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#2a2f2c",
    borderWidth: 1,
    borderColor: "#3b433e",
    alignItems: "center",
    justifyContent: "center"
  },
  actionGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: 92,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#2a2f2c",
    borderWidth: 1,
    borderColor: "#3b433e",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  stopButton: {
    flexGrow: 1,
    flexBasis: 92,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#ef5b61",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  actionText: {
    color: "#edf1ef",
    fontSize: 12,
    fontWeight: "800"
  },
  stopText: {
    color: "#250709",
    fontSize: 12,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }]
  }
});
