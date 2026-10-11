import { CameraOff, Hand } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { darkColors } from "../theme";

type Props = {
  fontsReady: boolean;
  onBack: () => void;
  onOpenManual: () => void;
};

// Vision V2 — "see what the robot sees". Camera-first: the frame is the
// page. The app has no robot camera source yet (no stream, client or
// provider), so the frame shows an honest "no picture yet" state: no
// simulated feed, no invented camera list, no live/refresh/fullscreen
// controls that would do nothing. When a robot camera source exists, its
// picture replaces the empty state inside the same frame.
//
// Camera availability is its own fact, never derived from robot control
// readiness: an offline or E-STOPped robot doesn't hide (or explain) the
// camera, and nothing here moves the robot.
export function CameraScreen({ fontsReady, onBack, onOpenManual }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      accessibilityLabel="Vision"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader fontsReady={fontsReady} onBack={onBack} subtitle="Xem những gì robot đang thấy." title="Vision" />

      {/*
        The frame stands for a camera picture, not page chrome: it stays dark
        in Light and Dark (as a real preview would), so it uses the dark
        palette rather than the live theme. Everything around it follows the
        active theme.
      */}
      <View
        accessibilityLabel="Khung hình camera của robot. Chưa có hình ảnh."
        accessible
        style={styles.frame}
      >
        <View style={styles.frameSource}>
          <SkyText fontsReady={fontsReady} style={styles.frameSourceText} variant="caption">
            Góc nhìn robot
          </SkyText>
        </View>
        <View style={styles.emptyIcon}>
          <CameraOff color={darkColors.textSecondary} size={28} strokeWidth={1.75} />
        </View>
        <SkyText fontsReady={fontsReady} style={styles.emptyTitle} variant="sectionTitle">
          Chưa có hình ảnh
        </SkyText>
        <SkyText fontsReady={fontsReady} style={styles.emptyText} variant="caption">
          Khi camera của robot được kết nối, hình ảnh trực tiếp sẽ hiển thị tại đây.
        </SkyText>
      </View>

      <SkyCard style={styles.card}>
        <View style={styles.statusRow}>
          <SkyText fontsReady={fontsReady} style={styles.flex} variant="cardTitle">
            Camera robot
          </SkyText>
          <StatusBadge accessibilityLiveRegion="polite" fontsReady={fontsReady} label="Chưa kết nối" status="offline" />
        </View>
        <SkyText fontsReady={fontsReady} tone="secondary">
          SkyNex chưa nhận được nguồn hình ảnh từ camera của robot.
        </SkyText>
      </SkyCard>

      <SkyButton
        accessibilityHint="Robot chỉ di chuyển khi bạn bật điều khiển."
        accessibilityLabel="Mở điều khiển thủ công"
        fontsReady={fontsReady}
        onPress={onOpenManual}
        variant="secondary"
      >
        <View style={styles.buttonContent}>
          <Hand color={colors.textPrimary} size={18} />
          <SkyText fontsReady={fontsReady} numberOfLines={1} variant="sectionTitle">
            Mở điều khiển thủ công
          </SkyText>
        </View>
      </SkyButton>
    </ScrollView>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1
    },
    content: {
      gap: layout.sectionGap,
      paddingBottom: space.xxxl + layout.floatingEStopClearance,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    flex: {
      flex: 1
    },
    // 4:3, the usual robot-camera shape: about 234pt tall at 360, 294pt at
    // 440 — the dominant surface at every size.
    frame: {
      alignItems: "center",
      aspectRatio: 4 / 3,
      backgroundColor: darkColors.background,
      borderRadius: corner.productCard,
      gap: space.xs,
      justifyContent: "center",
      overflow: "hidden",
      paddingHorizontal: space.xl,
      width: "100%"
    },
    frameSource: {
      backgroundColor: darkColors.surface,
      borderRadius: corner.pill,
      left: space.md,
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      position: "absolute",
      top: space.md
    },
    frameSourceText: {
      color: darkColors.textSecondary
    },
    emptyIcon: {
      alignItems: "center",
      backgroundColor: darkColors.surface,
      borderRadius: corner.pill,
      height: 56,
      justifyContent: "center",
      marginBottom: space.xs,
      width: 56
    },
    emptyTitle: {
      color: darkColors.textPrimary,
      textAlign: "center"
    },
    emptyText: {
      color: darkColors.textSecondary,
      maxWidth: 280,
      textAlign: "center"
    },
    card: {
      borderRadius: corner.productCard,
      gap: space.sm,
      padding: layout.productCardPadding
    },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm
    },
    buttonContent: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.xs
    }
  });
}
