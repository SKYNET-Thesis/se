import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, RotateCcw, RotateCw, Square } from "lucide-react-native";
import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  enabled: boolean;
  emergencyStopped: boolean;
  onEmergencyStop: () => void;
};

const jogButtons = [
  { label: "Joint up", icon: ChevronUp },
  { label: "Joint left", icon: ChevronLeft },
  { label: "Joint right", icon: ChevronRight },
  { label: "Joint down", icon: ChevronDown }
];

export function ManualControls({ enabled, emergencyStopped, onEmergencyStop }: Props) {
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const controlsDisabled = !enabled || emergencyStopped;

  const startCommand = (command: string) => {
    if (!controlsDisabled) setActiveCommand(command);
  };

  const stopCommand = () => setActiveCommand(null);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Jog controls</Text>
          <Text style={styles.caption}>{controlsDisabled ? "Controls locked" : "Release any control to stop motion"}</Text>
        </View>
        <View style={[styles.commandPill, activeCommand && styles.commandPillActive]}>
          <View style={[styles.commandDot, activeCommand && styles.commandDotActive]} />
          <Text style={[styles.commandText, activeCommand && styles.commandTextActive]}>
            {activeCommand ?? "Idle"}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.dpad}>
          {jogButtons.map(({ label, icon: Icon }) => (
            <Pressable
              key={label}
              accessibilityLabel={label}
              disabled={controlsDisabled}
              onPressIn={() => startCommand(label)}
              onPressOut={stopCommand}
              style={({ pressed }) => [
                styles.iconButton,
                controlsDisabled && styles.disabledControl,
                pressed && styles.pressed
              ]}
            >
              <Icon size={23} color="#edf1ef" />
            </Pressable>
          ))}
        </View>

        <View style={styles.actionGrid}>
          <HoldButton
            label="Base -"
            disabled={controlsDisabled}
            icon={<RotateCcw size={20} color="#7ee4b8" />}
            onStart={startCommand}
            onStop={stopCommand}
          />
          <HoldButton
            label="Base +"
            disabled={controlsDisabled}
            icon={<RotateCw size={20} color="#7ee4b8" />}
            onStart={startCommand}
            onStop={stopCommand}
          />
          <HoldButton
            label="Hold"
            disabled={controlsDisabled}
            icon={<Pause size={20} color="#e7b443" />}
            onStart={startCommand}
            onStop={stopCommand}
          />
          <Pressable
            accessibilityLabel="Emergency stop"
            onPress={() => {
              stopCommand();
              onEmergencyStop();
            }}
            style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          >
            <Square size={19} color="#250709" />
            <Text style={styles.stopText}>E-Stop</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type HoldButtonProps = {
  label: string;
  disabled: boolean;
  icon: ReactNode;
  onStart: (label: string) => void;
  onStop: () => void;
};

function HoldButton({ label, disabled, icon, onStart, onStop }: HoldButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => onStart(label)}
      onPressOut={onStop}
      style={({ pressed }) => [styles.actionButton, disabled && styles.disabledControl, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#343b37",
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
    fontSize: 11,
    marginTop: 3
  },
  commandPill: {
    minHeight: 31,
    maxWidth: 112,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#292d2b"
  },
  commandPillActive: {
    backgroundColor: "#183027"
  },
  commandDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#69736d"
  },
  commandDotActive: {
    backgroundColor: "#5cff9d"
  },
  commandText: {
    flexShrink: 1,
    color: "#a5aea9",
    fontSize: 10,
    fontWeight: "900"
  },
  commandTextActive: {
    color: "#bdf5d8"
  },
  controls: {
    flexDirection: "row",
    gap: 12
  },
  disabledControl: {
    opacity: 0.35
  },
  dpad: {
    width: 126,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  iconButton: {
    width: 56,
    height: 52,
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
    height: 52,
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
    height: 52,
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
    opacity: 0.7,
    transform: [{ scale: 0.98 }]
  }
});
