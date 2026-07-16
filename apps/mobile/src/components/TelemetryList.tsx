import { Cog } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { joints } from "../data/mockTelemetry";

export function TelemetryList() {
  return (
    <View style={styles.wrap}>
      {joints.map((joint) => (
        <View key={joint.label} style={styles.item}>
          <View style={styles.jointLabel}>
            <Cog size={14} color="#d9dfdc" />
            <Text style={styles.label}>{joint.label}</Text>
          </View>
          <Text style={styles.temp}>{joint.temp}</Text>
          <Text style={styles.rpm}>{joint.rpm}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 112,
    justifyContent: "space-around"
  },
  item: {
    gap: 4
  },
  jointLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  label: {
    color: "#9da6a1",
    fontSize: 10,
    fontWeight: "700"
  },
  temp: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  rpm: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  }
});
