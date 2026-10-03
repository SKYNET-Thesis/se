import { RotateCcw, Square } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { corner } from "../design-system/radius";
import { space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import {
  DEFAULT_ESTOP_POSITION,
  EStopPosition,
  getStoredEStopPosition,
  setStoredEStopPosition
} from "../services/estopPositionStorage";
import { darkColors, font } from "../theme";

type Props = {
  // Owned by App.tsx. This control only displays it and asks for changes —
  // it never holds or resets a stopped state of its own.
  emergencyStopped: boolean;
  onEmergencyStop: () => void;
  // Opens the EXISTING Reset confirmation (MainShell). Never resets directly.
  onRequestReset: () => void;
  fontsReady: boolean;
  reduceMotion: boolean;
  // Safe drag region, measured by the shell — not one phone's numbers.
  topInset: number;
  // Everything reserved at the bottom: safe-area inset + measured tab bar.
  bottomReserved: number;
};

// A circular hardware-style state button: neutral bezel → danger ring →
// raised neutral core → stop-square. Same physical size in every state.
const BUTTON = 58;
const BEZEL = 4;
const RING = BUTTON - BEZEL * 2; // 50
const RING_WIDTH = 6;
const CORE = RING - RING_WIDTH * 2; // 38
// Room kept below the button for the small "ĐÃ DỪNG" chip, so it can never
// slide under the tab bar. Reserved in every state so stopping never moves
// the button.
const CAPTION_SPACE = 22;
const EDGE_MARGIN = 14;
// Movement beyond this is a drag; anything under it is still a tap, so a
// natural finger jitter can never cancel (or fake) an activation.
const DRAG_THRESHOLD = 10;
const RESET_WIDTH = 84;
const RESET_GAP = space.xs;
// A press arriving this soon after a drag ended belongs to that drag (web
// fires a DOM click on release even though the drag cancelled the press).
const POST_DRAG_PRESS_GUARD_MS = 400;

type Point = { x: number; y: number };

// The global E-STOP, presented like iOS AssistiveTouch: a compact red
// control the user can drag anywhere inside the safe region; on release it
// snaps to the nearer side edge and the position is remembered.
//
// Tap vs drag: the stop itself is a plain Pressable (immediate on release,
// keyboard and screen-reader activatable). The wrapper only claims the
// gesture once the finger has moved more than DRAG_THRESHOLD; claiming it
// terminates the Pressable, so a drag can never activate E-STOP. While
// stopped, the control is inert to taps (it never resets) but still drags;
// Reset is a separate, neutral action beside it.
export function FloatingEStop({
  bottomReserved,
  emergencyStopped,
  fontsReady,
  onEmergencyStop,
  onRequestReset,
  reduceMotion,
  topInset
}: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState<EStopPosition>(DEFAULT_ESTOP_POSITION);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const draggingRef = useRef(false);
  const lastDragEndRef = useRef(0);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const placedRef = useRef(false);

  const groupWidth = BUTTON + (emergencyStopped ? RESET_GAP + RESET_WIDTH : 0);

  // Everything the gesture callbacks need, read fresh on every event.
  const layoutRef = useRef({ area, groupWidth, topInset, bottomReserved, reduceMotion });
  layoutRef.current = { area, groupWidth, topInset, bottomReserved, reduceMotion };

  useEffect(() => {
    let mounted = true;
    getStoredEStopPosition().then((stored) => {
      if (mounted) setPosition(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Place (or re-place) the control whenever its position, the safe region
  // or its own width changes — e.g. rotation, tab bar, Reset appearing.
  useEffect(() => {
    if (draggingRef.current || area.width === 0) return;
    const target = toPoint(position, layoutRef.current);
    if (!placedRef.current || reduceMotion) {
      pan.setValue(target);
      placedRef.current = true;
      return;
    }
    Animated.spring(pan, { bounciness: 0, speed: 18, toValue: target, useNativeDriver: false }).start();
  }, [area, bottomReserved, groupWidth, pan, position, reduceMotion, topInset]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD,
        onMoveShouldSetPanResponder: (_, g) => Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD,
        // Once dragging, nothing underneath (a ScrollView) may take it over.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          draggingRef.current = true;
          pan.stopAnimation((value) => {
            dragStartRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const bounds = getBounds(layoutRef.current);
          pan.setValue({
            x: clamp(dragStartRef.current.x + g.dx, bounds.minX, bounds.maxX),
            y: clamp(dragStartRef.current.y + g.dy, bounds.minY, bounds.maxY)
          });
        },
        onPanResponderRelease: (_, g) => finishDrag(g.dx, g.dy),
        onPanResponderTerminate: (_, g) => finishDrag(g.dx, g.dy)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Snap to the nearer side; keep the height as a fraction of the range.
  function finishDrag(dx: number, dy: number) {
    const layout = layoutRef.current;
    const bounds = getBounds(layout);
    const x = clamp(dragStartRef.current.x + dx, bounds.minX, bounds.maxX);
    const y = clamp(dragStartRef.current.y + dy, bounds.minY, bounds.maxY);
    const center = x + layout.groupWidth / 2;
    const next: EStopPosition = {
      side: center < layout.area.width / 2 ? "left" : "right",
      yRatio: bounds.maxY > bounds.minY ? (y - bounds.minY) / (bounds.maxY - bounds.minY) : 0
    };
    draggingRef.current = false;
    lastDragEndRef.current = Date.now();
    setPosition(next);
    void setStoredEStopPosition(next);
  }

  // Tap = activate. A drag never activates: the gesture claim cancels the
  // press on native, and this guard drops the release click web still
  // delivers. A deliberate tap after a drag works normally.
  const pressBelongsToDrag = () =>
    draggingRef.current || Date.now() - lastDragEndRef.current < POST_DRAG_PRESS_GUARD_MS;

  // While stopped a tap does nothing (it never resets). The Pressable stays
  // enabled so the control can still be dragged — a disabled one swallows
  // the gesture on web.
  const handleStopPress = () => {
    if (emergencyStopped || pressBelongsToDrag()) return;
    onEmergencyStop();
  };

  const handleResetPress = () => {
    if (pressBelongsToDrag()) return;
    onRequestReset();
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const dockedRight = position.side === "right";

  const resetButton = emergencyStopped ? (
    <Pressable
      accessibilityHint="Xác nhận trước khi bỏ trạng thái dừng khẩn cấp"
      accessibilityLabel="Reset E-STOP"
      accessibilityRole="button"
      onPress={handleResetPress}
      style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
    >
      <RotateCcw color={colors.textPrimary} size={15} />
      <Text style={[styles.resetText, font("display", fontsReady)]}>Reset</Text>
    </Pressable>
  ) : null;

  const stop = (
    <View style={styles.stopSlot}>
      <Pressable
        accessibilityHint={emergencyStopped ? "Dùng nút Reset bên cạnh để bỏ dừng khẩn cấp" : "Nhấn để dừng robot ngay lập tức"}
        accessibilityLabel={emergencyStopped ? "E-STOP, Đã dừng khẩn cấp" : "E-STOP"}
        accessibilityRole="button"
        accessibilityState={{ disabled: emergencyStopped }}
        aria-disabled={emergencyStopped}
        hitSlop={4}
        onPress={handleStopPress}
        style={({ pressed }) => [
          styles.bezel,
          emergencyStopped && styles.bezelStopped,
          pressed && styles.bezelPressed
        ]}
      >
        {({ pressed }) => (
          <View style={styles.ring}>
            <View style={[styles.core, pressed && styles.corePressed, emergencyStopped && styles.coreStopped]}>
              <Square
                color={emergencyStopped ? SAFETY_WHITE : colors.statusDanger}
                fill={emergencyStopped ? SAFETY_WHITE : colors.statusDanger}
                size={18}
                strokeWidth={2}
              />
            </View>
          </View>
        )}
      </Pressable>
      {emergencyStopped && (
        // State in words, not colour alone — small, under the button.
        <View pointerEvents="none" style={styles.caption}>
          <Text numberOfLines={1} style={[styles.captionText, font("display", fontsReady)]}>
            ĐÃ DỪNG
          </Text>
        </View>
      )}
    </View>
  );

  const resetInward = dockedRight;

  return (
    <View onLayout={onLayout} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {area.width > 0 && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.group, { width: groupWidth, transform: pan.getTranslateTransform() }]}
        >
          {resetInward && resetButton}
          {stop}
          {!resetInward && resetButton}
        </Animated.View>
      )}
    </View>
  );
}

function getBounds({
  area,
  bottomReserved,
  groupWidth,
  topInset
}: {
  area: { width: number; height: number };
  bottomReserved: number;
  groupWidth: number;
  topInset: number;
}) {
  const minX = EDGE_MARGIN;
  const maxX = Math.max(minX, area.width - EDGE_MARGIN - groupWidth);
  const minY = topInset + EDGE_MARGIN;
  const maxY = Math.max(minY, area.height - bottomReserved - EDGE_MARGIN - BUTTON - CAPTION_SPACE);
  return { minX, maxX, minY, maxY };
}

function toPoint(position: EStopPosition, layout: Parameters<typeof getBounds>[0]): Point {
  const bounds = getBounds(layout);
  return {
    x: position.side === "left" ? bounds.minX : bounds.maxX,
    y: bounds.minY + clamp(position.yRatio, 0, 1) * (bounds.maxY - bounds.minY)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// The stop-square and stopped ring stay white in both themes (a graphic,
// ≥3:1 on either red). Text on red keeps the contrast-correct onDanger.
const SAFETY_WHITE = darkColors.textPrimary;

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    group: {
      alignItems: "center",
      flexDirection: "row",
      gap: RESET_GAP,
      left: 0,
      position: "absolute",
      top: 0,
      // Web: no text selection while dragging.
      userSelect: "none"
    },
    // Neutral bezel plate with soft depth, like the reference's outer disc.
    bezel: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.pill,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 6,
      height: BUTTON,
      justifyContent: "center",
      shadowColor: darkColors.background,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 7,
      width: BUTTON
    },
    bezelStopped: {
      borderColor: colors.statusDanger,
      borderWidth: 2
    },
    // Pressed: a slight press-in, the ring edge firms up. No glow, no bounce.
    bezelPressed: {
      borderColor: colors.statusDanger,
      borderWidth: 1.5,
      transform: [{ scale: 0.97 }]
    },
    // The danger ring — the control's identity in every state.
    ring: {
      alignItems: "center",
      backgroundColor: colors.statusDanger,
      borderRadius: corner.pill,
      height: RING,
      justifyContent: "center",
      width: RING
    },
    // Raised neutral core: theme surface, a hairline rim and a small lift.
    core: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: corner.pill,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 2,
      height: CORE,
      justifyContent: "center",
      shadowColor: darkColors.background,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      width: CORE
    },
    corePressed: {
      backgroundColor: colors.surfaceRaised,
      elevation: 0,
      shadowOpacity: 0
    },
    // Stopped: the core fills red with a white rim and a white stop-square —
    // unmistakably different from the neutral idle core.
    coreStopped: {
      backgroundColor: colors.statusDanger,
      borderColor: SAFETY_WHITE,
      borderWidth: 2
    },
    stopSlot: {
      height: BUTTON,
      width: BUTTON
    },
    caption: {
      alignItems: "center",
      left: -16,
      position: "absolute",
      right: -16,
      top: BUTTON + 4
    },
    // A tiny chip so the words stay legible over any content or photo.
    captionText: {
      backgroundColor: colors.surface,
      borderColor: colors.statusDanger,
      borderRadius: corner.pill,
      borderWidth: 1,
      color: colors.statusDanger,
      fontSize: 10,
      lineHeight: 14,
      overflow: "hidden",
      paddingHorizontal: 6
    },
    reset: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderEmphasis,
      borderRadius: corner.pill,
      borderWidth: 1,
      elevation: 4,
      flexDirection: "row",
      gap: space.xxs,
      height: 40,
      justifyContent: "center",
      shadowColor: darkColors.background,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
      width: RESET_WIDTH
    },
    resetText: {
      color: colors.textPrimary,
      fontSize: 14
    },
    pressed: {
      opacity: 0.78
    }
  });
}
