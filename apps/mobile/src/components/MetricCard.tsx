import { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

type Tone = "danger" | "cyan" | "green";

const toneColors: Record<Tone, string> = {
  danger: "#ff7378",
  cyan: "#5ecdf5",
  green: "#64e09f"
};

type Props = {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  delta: string;
};

export function MetricCard({ icon: Icon, tone, label, value, delta }: Props) {
  const color = toneColors[tone];

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Icon size={14} color={color} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.delta}>{delta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 175,
    minHeight: 94,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#313733",
    padding: 13,
    justifyContent: "space-between"
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  label: {
    color: "#adb6b1",
    fontSize: 11,
    fontWeight: "700"
  },
  value: {
    color: "#f6f8f6",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: 0
  },
  delta: {
    color: "#a5aea9",
    fontSize: 11
  }
});
