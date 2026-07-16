import { StatusBar } from "expo-status-bar";
import { Activity, Gauge, Radio, Settings2, ShieldAlert, Wifi } from "lucide-react-native";
import { SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ArmModelViewer } from "./src/components/ArmModelViewer";
import { LineChartCard } from "./src/components/LineChartCard";
import { ManualControls } from "./src/components/ManualControls";
import { MetricCard } from "./src/components/MetricCard";
import { StatusMatrix } from "./src/components/StatusMatrix";
import { TimeDistribution } from "./src/components/TimeDistribution";
import { torqueSeries, speedSeries } from "./src/data/mockTelemetry";

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>OMNIARM SE</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Realtime robotic arm dashboard</Text>
          </View>

          <View style={styles.headerPills}>
            <View style={styles.robotSelect}>
              <Settings2 size={15} color="#d8dedb" />
              <Text style={styles.robotText}>Stäubli TX2-140</Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard icon={ShieldAlert} tone="danger" label="Emergencies" value="894" delta="0.3% up from last session" />
          <MetricCard icon={Activity} tone="cyan" label="Health Score" value="944" delta="72.09% up from last session" />
          <MetricCard icon={Gauge} tone="green" label="Avg. Motor Speed" value="1,843" delta="11.04% up from last session" />
        </View>

        <View style={[styles.contentGrid, isWide && styles.contentGridWide]}>
          <View style={styles.leftColumn}>
            <View style={styles.armPanel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>Robotic Arm Status</Text>
                  <Text style={styles.panelCaption}>Manual-ready, monitored joints</Text>
                </View>
                <View style={styles.attentionMode}>
                  <ShieldAlert size={15} color="#f4bd4f" />
                  <Text style={styles.attentionModeText}>Attention</Text>
                </View>
              </View>

              <View style={styles.modelWrap}>
                <ArmModelViewer />
              </View>
            </View>

            <ManualControls />
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.cameraCard}>
              <View style={styles.panelHeader}>
                <View style={styles.inlineTitle}>
                  <Radio size={15} color="#7ee4b8" />
                  <Text style={styles.panelTitle}>Camera X9</Text>
                </View>
                <Wifi size={16} color="#d8dedb" />
              </View>
              <View style={styles.cameraPreview}>
                <ArmModelViewer compact />
              </View>
              <StatusMatrix />
            </View>

            <LineChartCard title="Torque" color="#a997ff" data={torqueSeries} />
            <LineChartCard title="Speed" color="#61d49d" data={speedSeries} />
            <TimeDistribution />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#111211"
  },
  page: {
    padding: 18,
    gap: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start"
  },
  eyebrow: {
    color: "#7ee4b8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0
  },
  title: {
    color: "#f4f6f4",
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: 0
  },
  subtitle: {
    color: "#9ca4a0",
    marginTop: 3,
    fontSize: 13
  },
  headerPills: {
    alignItems: "flex-end",
    gap: 8
  },
  robotSelect: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#323834",
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  robotText: {
    color: "#d8dedb",
    fontSize: 12,
    fontWeight: "700"
  },
  livePill: {
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#323834",
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#5cff9d"
  },
  liveText: {
    color: "#d8dedb",
    fontWeight: "800",
    fontSize: 12
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  contentGrid: {
    gap: 14
  },
  contentGridWide: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  leftColumn: {
    flex: 1.15,
    gap: 14
  },
  rightColumn: {
    flex: 1,
    gap: 14
  },
  armPanel: {
    minHeight: 520,
    borderRadius: 8,
    backgroundColor: "#1b1d1c",
    borderWidth: 1,
    borderColor: "#303531",
    padding: 14
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center"
  },
  panelTitle: {
    color: "#edf1ef",
    fontSize: 14,
    fontWeight: "800"
  },
  panelCaption: {
    color: "#8b948f",
    fontSize: 12,
    marginTop: 2
  },
  attentionMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#33270f",
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 31
  },
  attentionModeText: {
    color: "#f7d98d",
    fontWeight: "800",
    fontSize: 12
  },
  modelWrap: {
    flex: 1,
    minHeight: 440,
    marginTop: 14,
    overflow: "hidden"
  },
  cameraCard: {
    borderRadius: 8,
    backgroundColor: "#1f2220",
    borderWidth: 1,
    borderColor: "#313733",
    padding: 14,
    gap: 12
  },
  inlineTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  cameraPreview: {
    height: 155,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#171918",
    borderWidth: 1,
    borderColor: "#323834"
  }
});
