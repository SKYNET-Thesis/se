import { StyleSheet, View } from "react-native";
import { matrix } from "../data/mockTelemetry";

const colors: Record<string, string> = {
  ok: "#55db94",
  warn: "#e7b443",
  err: "#ef5b61",
  idle: "#50605a"
};

export function StatusMatrix() {
  return (
    <View style={styles.grid}>
      {matrix.map((state, index) => (
        <View key={`${state}-${index}`} style={[styles.dot, { backgroundColor: colors[state] }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 10
  }
});
