import { ArrowLeft, CircleCheck, TriangleAlert, Hand, Expand, Radio, RefreshCw, Video, Wifi } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
const cameras = ["X9", "X10", "Wrist"] as const;
export function CameraScreen({ onBack, onOpenManual }: {
    onBack: () => void;
    onOpenManual: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [revision, setRevision] = useState(0);
    const [selectedCamera, setSelectedCamera] = useState<(typeof cameras)[number]>("X9");
    return (<ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityLabel="Back to robots" onPress={onBack} style={styles.actionButton}><ArrowLeft color="white" size={20}/></Pressable>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ROBOT VISION</Text>
          <Text style={styles.title}>Live Robot Camera</Text>
          <Text style={styles.subtitle}>SO-101 · Precision arm</Text>
        </View>
        <View style={styles.onlinePill}>
          <Wifi size={15} color="#68dbff"/>
          <Text style={styles.onlineText}>Demo</Text>
        </View>
      </View>

      <View style={styles.segmented}>
        {cameras.map((camera) => {
            const active = camera === selectedCamera;
            return (<Pressable key={camera} onPress={() => setSelectedCamera(camera)} style={[styles.segment, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{camera}</Text>
            </Pressable>);
        })}
      </View>

      <View style={styles.feedCard}>
        <View style={styles.feedHeader}>
          <View style={styles.feedTitleRow}>
            <Radio size={16} color="#68dbff"/>
            <Text style={styles.feedTitle}>Camera {selectedCamera}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot}/>
            <Text style={styles.liveText}>DEMO</Text>
          </View>
        </View>

        <View style={[styles.feedPreview, expanded && { aspectRatio: 0.7 }]}>
          <View style={styles.previewGrid}>
            {Array.from({ length: 5 }).map((_, index) => <View key={`h-${index}`} style={styles.gridLineHorizontal}/>)}
          </View>
          <Svg width="200" height="230" viewBox="0 0 200 230"><Line x1="20" y1="204" x2="185" y2="204" stroke="#7597b2" strokeWidth="2"/><Line x1="95" y1="200" x2="95" y2="151" stroke="#a6c8df" strokeWidth="24"/><Line x1="95" y1="151" x2="140" y2="91" stroke="#d4e7ef" strokeWidth="20"/><Line x1="140" y1="91" x2="87" y2="46" stroke="#9fbed4" strokeWidth="18"/><Line x1="87" y1="46" x2="52" y2="70" stroke="#d4e7ef" strokeWidth="12"/><Line x1="52" y1="70" x2="34" y2="69" stroke="#78acc9" strokeWidth="6"/><Line x1="52" y1="70" x2="48" y2="89" stroke="#78acc9" strokeWidth="6"/>{[[95, 151], [140, 91], [87, 46]].map(([x, y]) => <Circle key={y} cx={x} cy={y} r="12" fill="#253d63" stroke="#71d5f4" strokeWidth="4"/>)}</Svg>
          <Text style={styles.demoLabel}>DEMO PREVIEW · {selectedCamera}</Text>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 240">
            <Line x1="180" y1="86" x2="180" y2="106" stroke="#68dbff" strokeWidth="1.5"/>
            <Line x1="180" y1="134" x2="180" y2="154" stroke="#68dbff" strokeWidth="1.5"/>
            <Line x1="146" y1="120" x2="166" y2="120" stroke="#68dbff" strokeWidth="1.5"/>
            <Line x1="194" y1="120" x2="214" y2="120" stroke="#68dbff" strokeWidth="1.5"/>
            <Circle cx="180" cy="120" r="14" stroke="#68dbff" strokeWidth="1.5"/>
          </Svg>
          <View style={styles.timestamp}>
            <Text style={styles.timestampText}>Preview {revision + 1}</Text>
          </View>
        </View>

        <View style={styles.feedActions}>
          <Pressable accessibilityLabel="Open manual controls" onPress={onOpenManual} style={[styles.actionButton, { width: "auto", paddingHorizontal: 16, flexDirection: "row", gap: 7, backgroundColor: "#68d9ff" }]}><Hand size={17} color="#203560"/><Text style={{ color: "#203560", fontSize: 12, fontWeight: "600" }}>Manual controls</Text></Pressable>
          <Pressable accessibilityLabel="Refresh preview" onPress={() => setRevision(v => v + 1)} style={styles.actionButton}><RefreshCw size={18} color="#dce2df"/></Pressable>
          <Pressable accessibilityLabel="Expand preview" onPress={() => setExpanded(!expanded)} style={styles.actionButton}><Expand size={18} color="#dce2df"/></Pressable>
          <View style={styles.streamInfo}>
            <Text style={styles.streamInfoValue}>Demo</Text>
            <Text style={styles.streamInfoLabel}>Local</Text>
          </View>
        </View>
      </View>

      <Text style={{ color: "white", fontSize: 17, fontWeight: "600", marginTop: 6 }}>AI Insights</Text>
      <View style={[styles.healthCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}><CircleCheck color="#65deff" size={24}/><View style={{ flex: 1 }}><Text style={styles.healthTitle}>Task progress: 78% complete</Text><Text style={styles.healthCaption}>Sample insight · Assembly Line A</Text></View></View>
      <View style={[styles.healthCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}><TriangleAlert color="#ffd062" size={24}/><View style={{ flex: 1 }}><Text style={styles.healthTitle}>Component bin at 15% capacity</Text><Text style={styles.healthCaption}>Sample insight · Refill suggested</Text></View></View>
    </ScrollView>);
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
        color: "#68dbff",
        fontSize: 10,
        fontWeight: "900"
    },
    title: {
        color: "#ffffff",
        fontSize: 27,
        fontWeight: "800",
        marginTop: 2
    },
    subtitle: {
        color: "#c0c5e8",
        fontSize: 12,
        marginTop: 3
    },
    onlinePill: {
        minHeight: 33,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 10,
        borderRadius: 22,
        backgroundColor: "#398a9222"
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
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)"
    },
    segment: {
        flex: 1,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center"
    },
    segmentActive: {
        backgroundColor: "#65d7ff"
    },
    segmentText: {
        color: "#c7cced",
        fontSize: 11,
        fontWeight: "800"
    },
    segmentTextActive: {
        color: "#203560"
    },
    feedCard: {
        borderRadius: 22,
        padding: 12,
        gap: 11,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)"
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
        color: "#f5f6ff",
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
        aspectRatio: 0.95,
        minHeight: 220,
        borderRadius: 22,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#172b47",
        borderWidth: 1,
        borderColor: "#6985aa55"
    },
    previewGrid: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "space-evenly"
    },
    gridLineHorizontal: {
        height: 1,
        backgroundColor: "#7897b51a"
    },
    demoLabel: {
        color: "#a9bdda",
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
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.15)",
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
        borderRadius: 22,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)"
    },
    healthTitle: {
        color: "#f5f6ff",
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
