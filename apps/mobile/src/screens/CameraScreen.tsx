import { Expand, Hand, RefreshCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { ScreenHeader } from "../components/ScreenHeader";
import { useAppTheme } from "../ThemeContext";
import { darkColors, font, radius, spacing, ThemeColors, type } from "../theme";

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

// Built from the live theme (not a module constant) so it follows
// Light/Dark; "ready" uses accentStrong since this color paints bare
// text/dot/border directly on a surface, where plain accent reads almost
// invisibly on Light.
function buildStatusColor(colors: ThemeColors): Record<StreamStatus, string> {
  return {
    ready: colors.accentStrong,
    caution: colors.caution,
    danger: colors.danger
  };
}

export function CameraScreen({ fontsReady, onBack, onOpenManual }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColor = useMemo(() => buildStatusColor(colors), [colors]);
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
        colors={colors}
        fontsReady={fontsReady}
        onOpenManual={onOpenManual}
        onRefresh={() => setRevision((value) => value + 1)}
        revision={revision}
        statusColor={statusColor}
        stream={selected}
        styles={styles}
      />

      <View style={styles.thumbShell}>
        <View style={styles.thumbRow}>
          {otherStreams.map((stream) => (
            <ThumbStreamCard
              fontsReady={fontsReady}
              key={stream.id}
              onPress={() => setSelectedId(stream.id)}
              statusColor={statusColor}
              stream={stream}
              styles={styles}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function HeroStreamCard({
  colors,
  fontsReady,
  onOpenManual,
  onRefresh,
  revision,
  statusColor,
  stream,
  styles
}: {
  colors: ThemeColors;
  fontsReady: boolean;
  onOpenManual: () => void;
  onRefresh: () => void;
  revision: number;
  statusColor: Record<StreamStatus, string>;
  stream: StreamInfo;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroHeader}>
        <Text style={[styles.heroLabel, font("display", fontsReady)]}>{stream.label}</Text>
        <StatusPill fontsReady={fontsReady} status={stream.status} statusColor={statusColor} styles={styles} />
      </View>

      {/*
        The viewport itself simulates a camera sensor feed, not app chrome —
        it stays dark in both Light and Dark app themes (same as a real
        camera preview would), so it's pinned to the dark palette's
        background literal rather than the live theme token. Everything
        else on this screen (card, actions, thumbnails, page background)
        follows the active theme normally.
      */}
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
          <RefreshCw color={colors.textPrimary} size={18} />
        </Pressable>

        <Pressable
          accessibilityLabel="Phóng to preview"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Expand color={colors.textPrimary} size={18} />
        </Pressable>

        <Pressable
          accessibilityLabel="Mở điều khiển thủ công"
          onPress={onOpenManual}
          style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}
        >
          <Hand color={colors.accentForeground} size={17} />
          <Text style={[styles.manualButtonText, font("display", fontsReady)]}>Manual controls</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ThumbStreamCard({
  fontsReady,
  onPress,
  statusColor,
  stream,
  styles
}: {
  fontsReady: boolean;
  onPress: () => void;
  statusColor: Record<StreamStatus, string>;
  stream: StreamInfo;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityLabel={`Xem camera ${stream.label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.thumbCard, pressed && styles.pressed]}
    >
      <View style={[styles.thumbDot, { backgroundColor: statusColor[stream.status] }]} />
      <View style={styles.thumbCopy}>
        <Text style={[styles.thumbLabel, font("display", fontsReady)]}>{stream.label}</Text>
        <Text style={[styles.thumbStatus, { color: statusColor[stream.status] }, font("body", fontsReady)]}>
          {STATUS_LABEL[stream.status]}
        </Text>
      </View>
    </Pressable>
  );
}

function StatusPill({
  fontsReady,
  status,
  statusColor,
  styles
}: {
  fontsReady: boolean;
  status: StreamStatus;
  statusColor: Record<StreamStatus, string>;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.statusPill, { borderColor: statusColor[status] }]}>
      <View style={[styles.statusDot, { backgroundColor: statusColor[status] }]} />
      <Text style={[styles.statusText, { color: statusColor[status] }, font("display", fontsReady)]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
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
      color: colors.textPrimary
    },
    statusPill: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
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
    // Intentionally dark-only: this simulates a camera sensor feed, not
    // page chrome — see the comment at its usage site in HeroStreamCard.
    viewport: {
      alignItems: "center",
      aspectRatio: 0.95,
      backgroundColor: darkColors.background,
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
      backgroundColor: darkColors.border,
      height: 1
    },
    viewportLabel: {
      ...type.small,
      color: darkColors.textSecondary,
      marginTop: spacing.sm
    },
    viewportTag: {
      backgroundColor: darkColors.surface,
      borderRadius: radius.status,
      bottom: spacing.sm,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
      position: "absolute",
      right: spacing.sm
    },
    viewportTagText: {
      ...type.small,
      color: darkColors.textSecondary
    },
    heroActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    iconButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
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
      color: colors.accentForeground
    },
    thumbShell: {
      backgroundColor: colors.surfaceSecondary,
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
      color: colors.textPrimary
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
}
