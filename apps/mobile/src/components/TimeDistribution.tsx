import { StyleSheet, Text, View } from "react-native";

export function TimeDistribution() {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Time Distribution</Text>
      <View style={styles.bar}>
        <View style={[styles.segment, styles.down, { flex: 1.1 }]}>
          <Text style={styles.segmentText}>Down</Text>
        </View>
        <View style={[styles.segment, styles.idle, { flex: 2.1 }]}>
          <Text style={styles.segmentText}>Idle</Text>
        </View>
        <View style={[styles.segment, styles.running, { flex: 3.7 }]}>
          <Text style={styles.segmentText}>Running</Text>
        </View>
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>0</Text>
        <Text style={styles.axisText}>20</Text>
        <Text style={styles.axisText}>40</Text>
        <Text style={styles.axisText}>60</Text>
        <Text style={styles.axisText}>80</Text>
        <Text style={styles.axisText}>99</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 116,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#313733",
    padding: 14
  },
  title: {
    color: "#edf1ef",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 18
  },
  bar: {
    height: 22,
    borderRadius: 5,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#2b302c"
  },
  segment: {
    alignItems: "center",
    justifyContent: "center"
  },
  down: {
    backgroundColor: "#b44951"
  },
  idle: {
    backgroundColor: "#b28a3c"
  },
  running: {
    backgroundColor: "#4ca777"
  },
  segmentText: {
    color: "#f5faf7",
    fontSize: 9,
    fontWeight: "800"
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9
  },
  axisText: {
    color: "#87908b",
    fontSize: 10
  }
});
