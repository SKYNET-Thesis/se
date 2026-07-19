import { Activity, Bot, ChevronRight, CircleGauge, Gauge, Radio, ShieldAlert } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { LineChartCard } from "../components/LineChartCard";
import { MetricCard } from "../components/MetricCard";
import { speedSeries } from "../data/mockTelemetry";

type Props = {
  onOpenDebug: () => void;
};

export function DashboardScreen({ onOpenDebug }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>OMNIARM SE</Text>
          <Text style={styles.title}>System overview</Text>
          <Text style={styles.subtitle}>SO-101 · Lab station 01</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <MetricCard icon={Activity} tone="green" label="Health Score" value="94%" delta="Stable for 2h 14m" />
        <MetricCard icon={Gauge} tone="cyan" label="Motor Speed" value="1,843" delta="rpm average" />
        <MetricCard icon={ShieldAlert} tone="danger" label="Active Errors" value="6" delta="3 components affected" />
      </View>

      <Pressable onPress={onOpenDebug} style={({ pressed }) => [styles.robotCard, pressed && styles.pressed]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Robotic Arm Status</Text>
            <Text style={styles.cardCaption}>Three monitored joints require attention</Text>
          </View>
          <View style={styles.openButton}>
            <ChevronRight size={20} color="#dbe2de" />
          </View>
        </View>

        <View style={styles.previewRow}>
          <View style={styles.robotPreview}>
            <Bot size={82} color="#d8dedb" strokeWidth={1.35} />
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 150 130">
              <Line x1="51" y1="74" x2="25" y2="32" stroke="#e9ad37" strokeWidth="2" />
              <Line x1="78" y1="52" x2="123" y2="28" stroke="#e9ad37" strokeWidth="2" />
              <Line x1="96" y1="76" x2="127" y2="103" stroke="#ef5b61" strokeWidth="2" />
              <Circle cx="51" cy="74" r="6" fill="#111211" stroke="#e9ad37" strokeWidth="3" />
              <Circle cx="78" cy="52" r="6" fill="#111211" stroke="#e9ad37" strokeWidth="3" />
              <Circle cx="96" cy="76" r="6" fill="#111211" stroke="#ef5b61" strokeWidth="3" />
            </Svg>
          </View>

          <View style={styles.issueSummary}>
            <View style={styles.issueRow}>
              <View style={[styles.issueDot, styles.warning]} />
              <Text style={styles.issueCount}>15</Text>
              <Text style={styles.issueLabel}>Warnings</Text>
            </View>
            <View style={styles.issueRow}>
              <View style={[styles.issueDot, styles.error]} />
              <Text style={styles.issueCount}>6</Text>
              <Text style={styles.issueLabel}>Errors</Text>
            </View>
            <View style={styles.debugPill}>
              <CircleGauge size={15} color="#7ee4b8" />
              <Text style={styles.debugText}>Open 3D Debug</Text>
            </View>
          </View>
        </View>
      </Pressable>

      <View style={styles.connectionCard}>
        <View style={styles.connectionIcon}>
          <Radio size={20} color="#7ee4b8" />
        </View>
        <View style={styles.connectionCopy}>
          <Text style={styles.connectionTitle}>Robot connected</Text>
          <Text style={styles.connectionCaption}>12 ms latency · telemetry updated now</Text>
        </View>
        <View style={styles.connectedDot} />
      </View>

      <LineChartCard title="Motor speed · last 24 samples" color="#61d49d" data={speedSeries} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 28,
    gap: 14
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  eyebrow: {
    color: "#7ee4b8",
    fontSize: 11,
    fontWeight: "800"
  },
  title: {
    color: "#f4f6f4",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 2
  },
  subtitle: {
    color: "#8f9994",
    fontSize: 12,
    marginTop: 3
  },
  livePill: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#1e2421",
    borderWidth: 1,
    borderColor: "#334039"
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#5cff9d"
  },
  liveText: {
    color: "#d8dedb",
    fontSize: 12,
    fontWeight: "800"
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  robotCard: {
    borderRadius: 8,
    backgroundColor: "#1d201e",
    borderWidth: 1,
    borderColor: "#343b37",
    padding: 14,
    gap: 14
  },
  pressed: {
    opacity: 0.78
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  cardTitle: {
    color: "#edf1ef",
    fontSize: 15,
    fontWeight: "800"
  },
  cardCaption: {
    color: "#8b948f",
    fontSize: 11,
    marginTop: 3
  },
  openButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#282d2a"
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  robotPreview: {
    width: 150,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151716",
    borderRadius: 8,
    overflow: "hidden"
  },
  issueSummary: {
    flex: 1,
    minWidth: 0,
    gap: 10
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 8
  },
  warning: {
    backgroundColor: "#e9ad37"
  },
  error: {
    backgroundColor: "#ef5b61"
  },
  issueCount: {
    width: 24,
    color: "#f4f6f4",
    fontSize: 16,
    fontWeight: "900"
  },
  issueLabel: {
    color: "#a7b0ab",
    fontSize: 12,
    fontWeight: "700"
  },
  debugPill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#183027"
  },
  debugText: {
    color: "#bdf5d8",
    fontSize: 11,
    fontWeight: "800"
  },
  connectionCard: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#313733"
  },
  connectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183027"
  },
  connectionCopy: {
    flex: 1
  },
  connectionTitle: {
    color: "#edf1ef",
    fontSize: 13,
    fontWeight: "800"
  },
  connectionCaption: {
    color: "#8d9691",
    fontSize: 10,
    marginTop: 3
  },
  connectedDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    backgroundColor: "#5cff9d"
  }
});
