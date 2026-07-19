import { Camera, Expand, Radio, RefreshCw, Video, Wifi } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { StatusMatrix } from "../components/StatusMatrix";

const cameras = ["X9", "X10", "Wrist"] as const;

export function CameraScreen() {
  const [selectedCamera, setSelectedCamera] = useState<(typeof cameras)[number]>("X9");

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>LIVE VIEW</Text>
          <Text style={styles.title}>Camera feeds</Text>
          <Text style={styles.subtitle}>Robot cell · 1080p · 30 fps</Text>
        </View>
        <View style={styles.onlinePill}>
          <Wifi size={15} color="#7ee4b8" />
          <Text style={styles.onlineText}>Online</Text>
        </View>
      </View>

      <View style={styles.segmented}>
        {cameras.map((camera) => {
          const active = camera === selectedCamera;
          return (
            <Pressable
              key={camera}
              onPress={() => setSelectedCamera(camera)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{camera}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.feedCard}>
        <View style={styles.feedHeader}>
          <View style={styles.feedTitleRow}>
            <Radio size={16} color="#7ee4b8" />
            <Text style={styles.feedTitle}>Camera {selectedCamera}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.feedPreview}>
          <View style={styles.previewGrid}>
            {Array.from({ length: 5 }).map((_, index) => <View key={`h-${index}`} style={styles.gridLineHorizontal} />)}
          </View>
          <Video size={68} color="#52605a" strokeWidth={1.25} />
          <Text style={styles.demoLabel}>DEMO STREAM · {selectedCamera}</Text>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 240">
            <Line x1="180" y1="86" x2="180" y2="106" stroke="#7ee4b8" strokeWidth="1.5" />
            <Line x1="180" y1="134" x2="180" y2="154" stroke="#7ee4b8" strokeWidth="1.5" />
            <Line x1="146" y1="120" x2="166" y2="120" stroke="#7ee4b8" strokeWidth="1.5" />
            <Line x1="194" y1="120" x2="214" y2="120" stroke="#7ee4b8" strokeWidth="1.5" />
            <Circle cx="180" cy="120" r="14" stroke="#7ee4b8" strokeWidth="1.5" />
          </Svg>
          <View style={styles.timestamp}>
            <Text style={styles.timestampText}>23:53:42</Text>
          </View>
        </View>

        <View style={styles.feedActions}>
          <Pressable accessibilityLabel="Capture frame" style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Camera size={18} color="#dce2df" />
          </Pressable>
          <Pressable accessibilityLabel="Refresh feed" style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <RefreshCw size={18} color="#dce2df" />
          </Pressable>
          <Pressable accessibilityLabel="Full screen" style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Expand size={18} color="#dce2df" />
          </Pressable>
          <View style={styles.streamInfo}>
            <Text style={styles.streamInfoValue}>8.2 Mbps</Text>
            <Text style={styles.streamInfoLabel}>H.264</Text>
          </View>
        </View>
      </View>

      <View style={styles.healthCard}>
        <Text style={styles.healthTitle}>Feed health</Text>
        <Text style={styles.healthCaption}>Recent frame delivery across camera channels</Text>
        <View style={styles.matrixWrap}>
          <StatusMatrix />
        </View>
      </View>
    </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  eyebrow: {
    color: "#7ee4b8",
    fontSize: 10,
    fontWeight: "900"
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
  onlinePill: {
    minHeight: 33,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#183027"
  },
  onlineText: {
    color: "#bdf5d8",
    fontSize: 11,
    fontWeight: "900"
  },
  segmented: {
    height: 42,
    flexDirection: "row",
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#343b37"
  },
  segment: {
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: "#334039"
  },
  segmentText: {
    color: "#7f8984",
    fontSize: 11,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: "#dff7eb"
  },
  feedCard: {
    borderRadius: 8,
    padding: 12,
    gap: 11,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#343b37"
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  feedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  feedTitle: {
    color: "#edf1ef",
    fontSize: 14,
    fontWeight: "900"
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#ef5b61"
  },
  liveText: {
    color: "#ff9b9f",
    fontSize: 9,
    fontWeight: "900"
  },
  feedPreview: {
    width: "100%",
    aspectRatio: 1.5,
    minHeight: 220,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111514",
    borderWidth: 1,
    borderColor: "#35403a"
  },
  previewGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-evenly"
  },
  gridLineHorizontal: {
    height: 1,
    backgroundColor: "#1c2521"
  },
  demoLabel: {
    color: "#64716b",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 10
  },
  timestamp: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: "#090b0acc"
  },
  timestampText: {
    color: "#cbd2ce",
    fontSize: 9,
    fontWeight: "800"
  },
  feedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  actionButton: {
    width: 42,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2b302d",
    borderWidth: 1,
    borderColor: "#3c443f"
  },
  streamInfo: {
    flex: 1,
    alignItems: "flex-end"
  },
  streamInfoValue: {
    color: "#dce2df",
    fontSize: 11,
    fontWeight: "900"
  },
  streamInfoLabel: {
    color: "#77817b",
    fontSize: 9,
    marginTop: 2
  },
  healthCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#202321",
    borderWidth: 1,
    borderColor: "#343b37"
  },
  healthTitle: {
    color: "#edf1ef",
    fontSize: 14,
    fontWeight: "900"
  },
  healthCaption: {
    color: "#8e9892",
    fontSize: 10,
    marginTop: 3
  },
  matrixWrap: {
    marginTop: 13
  },
  pressed: {
    opacity: 0.68
  }
});
