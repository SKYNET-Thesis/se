import { Expand, Hand, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";

type StreamId = "top" | "wrist" | "side";
type StreamStatus = "ready" | "caution" | "danger";

type StreamInfo = {
  id: StreamId;
  label: string;
  status: StreamStatus;
};

type Props = {
  fontsReady: boolean;
  onBack: () => void;
  onOpenManual: () => void;
};

// theme.ts tops out at radius.card (16) — the Home "rich card" language uses
// a deliberately larger, softer corner for top-level panels, with nested
// content one size down. Scoped to this screen only.
const CARD_RADIUS_OUTER = 24;
const CARD_RADIUS_INNER = 18;

const STREAMS: StreamInfo[] = [
  { id: "top", label: "Top", status: "ready" },
  { id: "wrist", label: "Wrist", status: "caution" },
  { id: "side", label: "Side", status: "danger" }
];

const STATUS_LABEL: Record<StreamStatus, string> = {
  ready: "Đang phát",
  caution: "Đang tải",
  danger: "Mất tín hiệu"
};

const STATUS_COLOR: Record<StreamStatus, string> = {
  ready: colors.accent,
  caution: colors.caution,
  danger: colors.danger
};

export function CameraScreen({ fontsReady, onBack, onOpenManual }: Props) {
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<StreamId>("top");

  const selected = STREAMS.find((stream) => stream.id === selectedId) ?? STREAMS[0];
  const otherStreams = STREAMS.filter((stream) => stream.id !== selectedId);

  return (
    <ScrollView
      accessibilityLabel="Màn hình camera OmniArm"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        meta="MOCK"
        onBack={onBack}
        subtitle="3 góc quan sát: top, wrist, side"
        title="Camera"
      />

      <HeroStreamCard
        fontsReady={fontsReady}
        onOpenManual={onOpenManual}
        onRefresh={() => setRevision((value) => value + 1)}
        revision={revision}
        stream={selected}
      />

      <View style={styles.thumbShell}>
        <View style={styles.thumbRow}>
          {otherStreams.map((stream) => (
            <ThumbStreamCard
              fontsReady={fontsReady}
              key={stream.id}
              onPress={() => setSelectedId(stream.id)}
              stream={stream}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function HeroStreamCard({
  fontsReady,
  onOpenManual,
  onRefresh,
  revision,
  stream
}: {
  fontsReady: boolean;
  onOpenManual: () => void;
  onRefresh: () => void;
  revision: number;
  stream: StreamInfo;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroHeader}>
        <Text style={[styles.heroLabel, font("display", fontsReady)]}>{stream.label}</Text>
        <StatusPill fontsReady={fontsReady} status={stream.status} />
      </View>

      <View style={styles.viewport}>
        <View style={styles.viewportGrid}>
          {Array.from({ length: 5 }).map((_, index) => (
            <View key={`grid-${index}`} style={styles.viewportGridLine} />
          ))}
        </View>

        <Svg height="230" viewBox="0 0 200 230" width="200">
          <Line stroke="#7597b2" strokeWidth="2" x1="20" x2="185" y1="204" y2="204" />
          <Line stroke="#a6c8df" strokeWidth="24" x1="95" x2="95" y1="200" y2="151" />
          <Line stroke="#d4e7ef" strokeWidth="20" x1="95" x2="140" y1="151" y2="91" />
          <Line stroke="#9fbed4" strokeWidth="18" x1="140" x2="87" y1="91" y2="46" />
          <Line stroke="#d4e7ef" strokeWidth="12" x1="87" x2="52" y1="46" y2="70" />
          <Line stroke="#78acc9" strokeWidth="6" x1="52" x2="34" y1="70" y2="69" />
          <Line stroke="#78acc9" strokeWidth="6" x1="52" x2="48" y1="70" y2="89" />
          {[
            [95, 151],
            [140, 91],
            [87, 46]
          ].map(([x, y]) => (
            <Circle cx={x} cy={y} fill="#253d63" key={y} r="12" stroke="#71d5f4" strokeWidth="4" />
          ))}
        </Svg>

        <Text style={[styles.viewportLabel, font("mono", fontsReady)]}>MOCK PREVIEW · {stream.label}</Text>

        <View style={styles.viewportTag}>
          <Text style={[styles.viewportTagText, font("mono", fontsReady)]}>Preview {revision + 1}</Text>
        </View>
      </View>

      <View style={styles.heroActions}>
        <Pressable
          accessibilityLabel="Làm mới preview"
          onPress={onRefresh}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <RefreshCw color={colors.textHi} size={18} />
        </Pressable>

        <Pressable
          accessibilityLabel="Phóng to preview"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Expand color={colors.textHi} size={18} />
        </Pressable>

        <Pressable
          accessibilityLabel="Mở điều khiển thủ công"
          onPress={onOpenManual}
          style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}
        >
          <Hand color={colors.accentText} size={17} />
          <Text style={[styles.manualButtonText, font("display", fontsReady)]}>Manual controls</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ThumbStreamCard({
  fontsReady,
  onPress,
  stream
}: {
  fontsReady: boolean;
  onPress: () => void;
  stream: StreamInfo;
}) {
  return (
    <Pressable
      accessibilityLabel={`Xem camera ${stream.label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.thumbCard, pressed && styles.pressed]}
    >
      <View style={[styles.thumbDot, { backgroundColor: STATUS_COLOR[stream.status] }]} />
      <View style={styles.thumbCopy}>
        <Text style={[styles.thumbLabel, font("display", fontsReady)]}>{stream.label}</Text>
        <Text style={[styles.thumbStatus, { color: STATUS_COLOR[stream.status] }, font("body", fontsReady)]}>
          {STATUS_LABEL[stream.status]}
        </Text>
      </View>
    </Pressable>
  );
}

function StatusPill({ fontsReady, status }: { fontsReady: boolean; status: StreamStatus }) {
  return (
    <View style={[styles.statusPill, { borderColor: STATUS_COLOR[status] }]}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={[styles.statusText, { color: STATUS_COLOR[status] }, font("display", fontsReady)]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  content: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: CARD_RADIUS_OUTER,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  heroHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  heroLabel: {
    ...type.title,
    color: colors.textHi
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm
  },
  statusDot: {
    borderRadius: radius.status,
    height: 8,
    width: 8
  },
  statusText: {
    ...type.label
  },
  viewport: {
    alignItems: "center",
    aspectRatio: 0.95,
    backgroundColor: colors.bg,
    borderRadius: CARD_RADIUS_INNER,
    justifyContent: "center",
    minHeight: 220,
    overflow: "hidden",
    width: "100%"
  },
  viewportGrid: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-evenly"
  },
  viewportGridLine: {
    backgroundColor: colors.border,
    height: 1
  },
  viewportLabel: {
    ...type.small,
    color: colors.textLo,
    marginTop: spacing.sm
  },
  viewportTag: {
    backgroundColor: colors.surface,
    borderRadius: radius.status,
    bottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    position: "absolute",
    right: spacing.sm
  },
  viewportTagText: {
    ...type.small,
    color: colors.textLo
  },
  heroActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  manualButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.round,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  manualButtonText: {
    ...type.label,
    color: colors.accentText
  },
  thumbShell: {
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS_OUTER,
    padding: spacing.sm
  },
  thumbRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  thumbCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS_INNER,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.sm
  },
  thumbDot: {
    borderRadius: radius.round,
    height: 8,
    width: 8
  },
  thumbCopy: {
    flex: 1,
    minWidth: 0
  },
  thumbLabel: {
    ...type.label,
    color: colors.textHi
  },
  thumbStatus: {
    ...type.small,
    marginTop: 2
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  }
});
