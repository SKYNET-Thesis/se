import { AlertTriangle, ChevronDown, ChevronUp, CircleAlert, Info, Radio, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ArmModelViewer } from "../components/ArmModelViewer";
import { robotFaults } from "../data/mockTelemetry";

export function DebugScreen() {
  const { height } = useWindowDimensions();
  const collapsedHeight = 166;
  const expandedHeight = Math.min(430, height * 0.56);
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const [expanded, setExpanded] = useState(false);
  const [selectedFault, setSelectedFault] = useState<number | null>(null);

  useEffect(() => {
    Animated.timing(sheetHeight, {
      toValue: expanded ? expandedHeight : collapsedHeight,
      duration: 240,
      useNativeDriver: false
    }).start();
  }, [collapsedHeight, expanded, expandedHeight, sheetHeight]);

  const selectFault = (index: number) => {
    setSelectedFault(index);
    setExpanded(false);
  };

  const selected = selectedFault === null ? null : robotFaults[selectedFault];
  const visibleFaults = expanded
    ? robotFaults.map((fault, index) => ({ fault, index }))
    : selectedFault === null
      ? []
      : [{ fault: robotFaults[selectedFault], index: selectedFault }];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>3D DEBUG</Text>
          <Text style={styles.title}>SO-101 arm</Text>
        </View>
        <View style={styles.onlinePill}>
          <Radio size={14} color="#66e0ff" />
          <Text style={styles.onlineText}>12 ms</Text>
        </View>
      </View>

      <View style={styles.viewer}>
        <ArmModelViewer
          selectedFault={selectedFault}
          onFaultSelect={selectFault}
          showFaults
        />

        <View style={styles.telemetryStrip}>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>MODE</Text>
            <Text style={styles.telemetryValue}>Monitor</Text>
          </View>
          <View style={styles.telemetryDivider} />
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>PAYLOAD</Text>
            <Text style={styles.telemetryValue}>0.82 kg</Text>
          </View>
          <View style={styles.telemetryDivider} />
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>FORCE</Text>
            <Text style={styles.telemetryValue}>23 N</Text>
          </View>
        </View>
      </View>

      {selected !== null && (
        <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.sheetHandleArea}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpanded((value) => !value)}
              style={styles.sheetToggle}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Diagnostics</Text>
                  <Text style={styles.sheetCaption}>15 warnings | 6 errors</Text>
                </View>
                {expanded ? <ChevronDown size={21} color="#abb4af" /> : <ChevronUp size={21} color="#abb4af" />}
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel="Close diagnostics"
              hitSlop={8}
              onPress={() => {
                setSelectedFault(null);
                setExpanded(false);
              }}
              style={styles.closeButton}
            >
              <X size={19} color="#abb4af" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.issueList} showsVerticalScrollIndicator={false}>
            {visibleFaults.map(({ fault, index }) => {
              const active = selectedFault === index;
              const danger = fault.severity === "error";
              const Icon = danger ? CircleAlert : AlertTriangle;
              return (
                <Pressable
                  key={fault.node}
                  onPress={() => setSelectedFault(index)}
                  style={({ pressed }) => [styles.issue, active && styles.issueActive, pressed && styles.pressed]}
                >
                  <View style={[styles.issueIcon, danger ? styles.issueIconDanger : styles.issueIconWarning]}>
                    <Icon size={17} color={danger ? "#ff7d82" : "#f4bd4f"} />
                  </View>
                  <View style={styles.issueCopy}>
                    <Text style={styles.issueTitle}>{fault.title}</Text>
                    <Text numberOfLines={1} style={styles.issueSummary}>{fault.summary}</Text>
                  </View>
                  <Text style={[styles.issueValue, danger && styles.issueValueDanger]}>{fault.value}</Text>
                </Pressable>
              );
            })}

            {expanded && (
              <View style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <Info size={16} color="#66e0ff" />
                  <Text style={styles.detailTitle}>{selected.component}</Text>
                </View>
                <Text style={styles.detailText}>{selected.detail}</Text>
                <View style={styles.detailMeta}>
                  <Text style={styles.metaText}>Node: {selected.node}</Text>
                  <Text style={styles.metaText}>Detected: {selected.detected}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent"
  },
  header: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#292e2b"
  },
  eyebrow: {
    color: "#66e0ff",
    fontSize: 10,
    fontWeight: "900"
  },
  title: {
    color: "#f3f6f4",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 1
  },
  onlinePill: {
    minHeight: 31,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#32688a"
  },
  onlineText: {
    color: "#bdf5d8",
    fontSize: 11,
    fontWeight: "800"
  },
  viewer: {
    flex: 1,
    minHeight: 300,
    backgroundColor: "#202851"
  },
  telemetryStrip: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 56,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#343b72e8",
    borderWidth: 1,
    borderColor: "#39413c"
  },
  telemetryItem: {
    flex: 1,
    minWidth: 0
  },
  telemetryLabel: {
    color: "#78837d",
    fontSize: 8,
    fontWeight: "900"
  },
  telemetryValue: {
    color: "#f5f5ff",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3
  },
  telemetryDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 8,
    backgroundColor: "#3a413d"
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.16)",
    overflow: "hidden"
  },
  sheetHandleArea: {
    position: "relative",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  sheetToggle: {
    paddingRight: 42
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    alignSelf: "center",
    backgroundColor: "#59635d",
    marginBottom: 8
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  closeButton: {
    position: "absolute",
    right: 12,
    top: 18,
    width: 34,
    height: 34,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)"
  },
  sheetTitle: {
    color: "#f0f3f1",
    fontSize: 15,
    fontWeight: "900"
  },
  sheetCaption: {
    color: "#8e9892",
    fontSize: 10,
    marginTop: 2
  },
  issueList: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    gap: 8
  },
  issue: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 9,
    borderRadius: 18,
    backgroundColor: "#444c85",
    borderWidth: 1,
    borderColor: "transparent"
  },
  issueActive: {
    borderColor: "#6c8176",
    backgroundColor: "#444c85"
  },
  issueIcon: {
    width: 34,
    height: 34,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  issueIconWarning: {
    backgroundColor: "#392d15"
  },
  issueIconDanger: {
    backgroundColor: "#3a1f21"
  },
  issueCopy: {
    flex: 1,
    minWidth: 0
  },
  issueTitle: {
    color: "#f5f5ff",
    fontSize: 12,
    fontWeight: "800"
  },
  issueSummary: {
    color: "#b5b9de",
    fontSize: 10,
    marginTop: 3
  },
  issueValue: {
    color: "#f4bd4f",
    fontSize: 11,
    fontWeight: "900"
  },
  issueValueDanger: {
    color: "#ff7d82"
  },
  detailCard: {
    marginTop: 2,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#202851",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)"
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  detailTitle: {
    color: "#f5f5ff",
    fontSize: 12,
    fontWeight: "900"
  },
  detailText: {
    color: "#a7b0ab",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8
  },
  detailMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10
  },
  metaText: {
    color: "#717b75",
    fontSize: 9,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.72
  }
});
