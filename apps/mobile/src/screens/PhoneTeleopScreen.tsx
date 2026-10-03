import { CircleAlert, Hand, Lock, ShieldAlert, Smartphone, TriangleAlert } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  AppState,
  GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkyButton, SkyCard, SkyText, StatusBadge } from "../components/ui";
import { corner } from "../design-system/radius";
import { layout, space } from "../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../design-system/tokens";
import { getLiveReadiness, READINESS_BADGE_LABEL } from "../data/robot";
import { useRobotSummary } from "../hooks/useRobotSummary";
import { darkColors, font } from "../theme";
import { isPhoneARNativeAvailable, PhoneARPose, PhoneARView } from "../../modules/expo-phone-ar";
import { gripperSlideVelocity } from "../services/gripperSlide";

type Props = {
  // Owned by App.tsx (the floating E-STOP sets it; Reset clears it). Read only here.
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
  onCalibrate: () => void;
  onConnect: () => void;
  // Fires the same App.tsx-owned E-STOP activation the floating E-STOP
  // button calls. Needed here specifically because the fullscreen motion
  // view below is a native Modal that covers the whole app, the floating E-STOP
  // entirely — without this, a user actively driving the robot in that
  // mode would have no E-STOP control on screen at all.
  onEmergencyStop: () => void;
};

type InputMode = "pad" | "motion";
type TrackingState = "ready" | "tracking" | "limited" | "lost";
type Transport = "disconnected" | "connecting" | "connected";

const PAD_HEIGHT = 220;
const PAD_FINE_ZONE = 92;
const GRIPPER_DEAD_ZONE = 0.1;
const POSE_INTERVAL_MS = 50;
// Phone motion input exists only in the native app: the browser's
// DeviceMotion is not a phone being held as a controller, and expo-sensors
// doesn't support setting its update rate on web.
const MOTION_INPUT_SUPPORTED = Platform.OS !== "web";
const CLIENT_PLATFORM = Platform.OS === "android" ? "android" : "ios";

// Phone Control. Two state layers, never merged:
//
//   ROBOT   — useRobotSummary() (live): may the robot move? Same source as Home,
//             Skill Detail, the Robot hub and Manual Control.
//   SESSION — this phone as a controller: control-server transport, motion
//             input (sensors), tracking. A connected server is NOT evidence
//             the robot is online.
//
// A pose leaves the app only while BOTH allow it AND the user is holding
// the control (dead-man hold). Losing either layer releases the hold and,
// when the socket is open, sends the existing `control_disabled` with a
// truthful reason. Nothing re-arms on its own: control resumes only on a
// new deliberate hold.
export function PhoneTeleopScreen({ emergencyStopped, fontsReady, onBack, onCalibrate, onConnect, onEmergencyStop }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const robot = useRobotSummary({ emergencyStopped });
  const [serverHost, setServerHost] = useState("192.168.1.100");
  // The direct-USB LeRobot worker accepts both Quest and phone clients on 8765.
  const [serverPort, setServerPort] = useState("8765");
  const [transport, setTransport] = useState<Transport>("disconnected");
  // The direct-USB worker intentionally serves plain LAN WebSocket. The Quest
  // page and phone therefore use the same ws://8765 endpoint.
  const [secureTransport, setSecureTransport] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [motionReading, setMotionReading] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const [motionPosition, setMotionPosition] = useState({ x: 0, y: 0, z: 0 });
  const [mode, setMode] = useState<InputMode>("motion");
  const [motionFullscreen, setMotionFullscreen] = useState(false);
  const [tracking, setTracking] = useState<TrackingState>("ready");
  const [controlHeld, setControlHeld] = useState(false);
  const [fineMode, setFineMode] = useState(false);
  const [gripperVelocity, setGripperVelocity] = useState(0);
  const slideOriginY = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(0);
  const controlHeldRef = useRef(false);
  const velocityRef = useRef({ x: 0, y: 0, z: 0 });
  const lastAccelerationTimestampRef = useRef<number | null>(null);
  const referenceMotionRef = useRef({ pitch: 0, roll: 0, yaw: 0 });
  const referencePositionRef = useRef({ x: 0, y: 0, z: 0 });
  const nativeQuaternionRef = useRef({ x: 0, y: 0, z: 0, w: 1 });
  const referenceNativeQuaternionRef = useRef({ x: 0, y: 0, z: 0, w: 1 });
  const sessionIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);


  const connected = transport === "connected";
  // Layer A — robot. The raw E-STOP flag wins without waiting for the
  // async summary.
  const robotReady = robot?.readiness === "ready" && !emergencyStopped;
  // Layer B — session.
  const sessionReady = connected && MOTION_INPUT_SUPPORTED && motionAvailable && tracking !== "lost";
  const canControl = robotReady && sessionReady;
  const active = canControl && controlHeld;

  // Why control is blocked, as the `control_disabled` reason (free text,
  // 1–128 chars in the server's protocol). null = nothing blocks it.
  const blockReason = emergencyStopped || robot?.readiness === "stopped"
    ? "emergency_stop"
    : robot?.readiness === "offline"
      ? "robot_offline"
      : robot?.readiness === "needs-calibration"
        ? "robot_needs_calibration"
        : tracking === "lost"
          ? "tracking_lost"
          : null;

  // Latest permission for the 50ms sender and the press handlers, read at
  // the moment of sending — never a value captured when a timer started.
  const canSendRef = useRef(false);
  const emergencyStoppedRef = useRef(emergencyStopped);
  canSendRef.current = canControl;
  emergencyStoppedRef.current = emergencyStopped;

  useEffect(() => {
    if (isPhoneARNativeAvailable) setMotionAvailable(true);
  }, []);

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      mode === "pad" ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT
    ).catch(() => undefined);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => undefined);
    };
  }, [mode]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setControlHeld(false);
        controlHeldRef.current = false;
        setGripperVelocity(0);
        socketRef.current?.send(JSON.stringify({ type: "control_disabled", protocolVersion: 1, reason: "app_background" }));
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Native only: no sensor calls at all on web (see MOTION_INPUT_SUPPORTED).
    if (isPhoneARNativeAvailable || !MOTION_INPUT_SUPPORTED) return undefined;
    let mounted = true;
    let subscription: { remove: () => void } | null = null;
    void DeviceMotion.requestPermissionsAsync().then(async (permission) => {
      if (!mounted || !permission.granted) return;
      const available = await DeviceMotion.isAvailableAsync();
      if (!mounted) return;
      setMotionAvailable(available);
      if (!available) return;
      DeviceMotion.setUpdateInterval(POSE_INTERVAL_MS);
      subscription = DeviceMotion.addListener((reading) => {
        const rotation = reading.rotation;
        if (!rotation) return;
        setMotionReading({ pitch: rotation.beta, roll: rotation.gamma, yaw: rotation.alpha });
        const acceleration = reading.acceleration;
        if (controlHeldRef.current && acceleration) {
          const previous = lastAccelerationTimestampRef.current;
          const dt = previous === null ? 0.05 : Math.max(0.01, Math.min(0.1, acceleration.timestamp - previous));
          lastAccelerationTimestampRef.current = acceleration.timestamp;
          const nextVelocity = {
            x: (velocityRef.current.x + acceleration.x * dt) * 0.82,
            y: (velocityRef.current.y + acceleration.y * dt) * 0.82,
            z: (velocityRef.current.z + acceleration.z * dt) * 0.82
          };
          velocityRef.current = nextVelocity;
          setMotionPosition((position) => ({
            x: clamp(position.x + nextVelocity.x * dt, -0.5, 0.5),
            y: clamp(position.y + nextVelocity.y * dt, -0.5, 0.5),
            z: clamp(position.z + nextVelocity.z * dt, -0.5, 0.5)
          }));
        }
      });
    }).catch(() => mounted && setMotionAvailable(false));
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  const handleNativePose = (pose: PhoneARPose) => {
    setMotionAvailable(pose.trackingState !== "lost");
    setMotionPosition(pose.position);
    setMotionReading({ pitch: 0, roll: 0, yaw: 0 });
    setTracking(pose.trackingState);
    nativeQuaternionRef.current = pose.quaternion;
  };

  // Any loss of permission — robot or session — releases the hold.
  useEffect(() => {
    if (canControl) return;
    setControlHeld(false);
    controlHeldRef.current = false;
    setGripperVelocity(0);
  }, [canControl]);

  // Tell the server whenever something starts blocking control (E-STOP,
  // robot readiness, tracking), instead of relying only on the server's
  // 250ms stale-pose release. Sent once per new reason.
  useEffect(() => {
    if (!blockReason) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "control_disabled", protocolVersion: 1, reason: blockReason }));
    }
  }, [blockReason]);

  useEffect(() => () => {
    socketRef.current?.close();
  }, []);

  const handleConnect = () => {
    if (transport !== "disconnected") {
      socketRef.current?.close();
      socketRef.current = null;
      setTransport("disconnected");
      setControlHeld(false);
      controlHeldRef.current = false;
      setTracking("ready");
      return;
    }

    if (!serverHost.trim() || !serverPort.trim()) return;
    const socket = new WebSocket(`${secureTransport ? "wss" : "ws"}://${serverHost.trim()}:${serverPort.trim()}/ws`);
    socketRef.current = socket;
    setTransport("connecting");
    socket.onopen = () => {
      setTransport("connected");
      setTracking(motionAvailable ? "tracking" : "limited");
      socket.send(JSON.stringify({ type: "hello", protocolVersion: 1, platform: CLIENT_PLATFORM, sessionId: sessionIdRef.current, arm: "right" }));
    };
    socket.onerror = () => {
      setControlHeld(false);
      controlHeldRef.current = false;
    };
    // No auto-reconnect: a dropped session ends control; reconnecting and
    // holding again are both deliberate user actions.
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      setTransport("disconnected");
      setControlHeld(false);
      controlHeldRef.current = false;
      setTracking("ready");
    };
  };

  // Live check straight from the shared robot link + E-STOP, at call time.
  const robotMayMoveNow = () => getLiveReadiness(emergencyStoppedRef.current) === "ready";

  const handleControlStart = () => {
    if (!canSendRef.current || !robotMayMoveNow()) return;
    setControlHeld(true);
    controlHeldRef.current = true;
    velocityRef.current = { x: 0, y: 0, z: 0 };
    lastAccelerationTimestampRef.current = null;
    referencePositionRef.current = isPhoneARNativeAvailable ? motionPosition : { x: 0, y: 0, z: 0 };
    referenceNativeQuaternionRef.current = nativeQuaternionRef.current;
    if (!isPhoneARNativeAvailable) setMotionPosition({ x: 0, y: 0, z: 0 });
    referenceMotionRef.current = motionReading;
  };

  const handleControlStop = () => {
    slideOriginY.current = null;
    setControlHeld(false);
    controlHeldRef.current = false;
    setGripperVelocity(0);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "control_disabled", protocolVersion: 1, reason: "hold_released" }));
    }
  };

  const openMotionFullscreen = () => {
    setMode("motion");
    setMotionFullscreen(true);
    handleControlStop();
  };

  const closeMotionFullscreen = () => {
    handleControlStop();
    setMotionFullscreen(false);
  };

  const handleSlideStart = (event: GestureResponderEvent) => {
    if (!canSendRef.current) return;
    slideOriginY.current = event.nativeEvent.pageY;
    setGripperVelocity(0);
    handleControlStart();
  };

  const handleSlideMove = (event: GestureResponderEvent) => {
    if (!controlHeldRef.current || slideOriginY.current === null) return;
    setGripperVelocity(gripperSlideVelocity(slideOriginY.current, event.nativeEvent.pageY));
  };

  const handlePadMove = (event: GestureResponderEvent) => {
    if (!active || mode !== "pad") return;
    const { locationY, locationX } = event.nativeEvent;
    setFineMode(locationX < PAD_FINE_ZONE);
    const normalized = 1 - Math.max(0, Math.min(PAD_HEIGHT, locationY)) / PAD_HEIGHT;
    setGripperVelocity(Math.abs(normalized - 0.5) < GRIPPER_DEAD_ZONE ? 0 : Math.max(-1, Math.min(1, (normalized - 0.5) * 2)));
  };

  // "Căn giữa": ends the current hold and tells the server to drop its
  // current target (`recenter`). The next hold takes the phone's pose at
  // that moment as the new neutral point.
  const recenter = () => {
    if (!connected || emergencyStopped) return;
    setControlHeld(false);
    controlHeldRef.current = false;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "recenter", protocolVersion: 1 }));
    }
  };

  // The only outbound motion path: 20Hz while held.
  useEffect(() => {
    if (!active || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return undefined;
    const timer = setInterval(() => {
      // Last-line gate, read now: live robot readiness (shared link, not the
      // last render), session, E-STOP, hold.
      if (!canSendRef.current || !controlHeldRef.current || emergencyStoppedRef.current || !robotMayMoveNow()) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const timestampNs = Date.now() * 1e6;
      socket.send(JSON.stringify({
        type: "phone_pose",
        protocolVersion: 1,
        platform: CLIENT_PLATFORM,
        sessionId: sessionIdRef.current,
        sequence: sequenceRef.current++,
        timestampNs,
        trackingState: tracking,
        enabled: true,
        fineMode,
        position: isPhoneARNativeAvailable ? subtractPosition(motionPosition, referencePositionRef.current) : motionPosition,
        quaternion: isPhoneARNativeAvailable
          ? relativeQuaternion(nativeQuaternionRef.current, referenceNativeQuaternionRef.current)
          : eulerToQuaternion(
              motionReading.pitch - referenceMotionRef.current.pitch,
              motionReading.roll - referenceMotionRef.current.roll,
              motionReading.yaw - referenceMotionRef.current.yaw
            ),
        gripperVelocity
      }));
    }, POSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, fineMode, gripperVelocity, motionPosition, motionReading, tracking]);

  const session = describeSession({ transport, tracking, motionAvailable, colors });
  const lockNote = !robotReady
    ? emergencyStopped || robot?.readiness === "stopped"
      ? "Tạm khóa vì E-STOP"
      : robot?.readiness === "offline"
        ? "Tạm khóa — robot chưa kết nối"
        : robot?.readiness === "needs-calibration"
          ? "Tạm khóa — robot cần hiệu chỉnh"
          : "Đang kiểm tra trạng thái robot…"
    : !MOTION_INPUT_SUPPORTED
      ? "Điều khiển bằng chuyển động cần ứng dụng SkyNex trên điện thoại."
      : !connected
        ? "Kết nối máy chủ điều khiển để bắt đầu"
        : !motionAvailable
          ? "Điện thoại chưa cho phép dùng cảm biến chuyển động"
          : tracking === "lost"
            ? "Mất theo dõi chuyển động — giữ điện thoại ổn định để theo dõi lại"
            : null;
  const holdLabel = active ? "Đang điều khiển · Thả để dừng" : "Giữ để điều khiển";

  return (
    <ScrollView
      accessibilityLabel="Điều khiển bằng điện thoại"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        onBack={onBack}
        subtitle="Giữ nút và di chuyển điện thoại, robot sẽ làm theo."
        title="Điều khiển bằng điện thoại"
      />

      {/* Two layers, two rows: the robot, then this phone. */}
      <SkyCard style={styles.group}>
        <View style={styles.stateRow}>
          <SkyText fontsReady={fontsReady} style={styles.stateKey} tone="secondary" variant="caption">
            Robot
          </SkyText>
          <View style={styles.stateValue}>
            {robot ? (
              <StatusBadge fontsReady={fontsReady} label={READINESS_BADGE_LABEL[robot.readiness]} status={robot.status} />
            ) : (
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                Đang kiểm tra…
              </SkyText>
            )}
            {robot && robot.readiness !== "ready" && !emergencyStopped && robot.readiness !== "stopped" && (
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                {robot.message}
              </SkyText>
            )}
          </View>
        </View>
        <View style={styles.divider} />
        <View accessibilityLabel={`Điện thoại: ${session.label}`} accessible style={styles.stateRow}>
          <SkyText fontsReady={fontsReady} style={styles.stateKey} tone="secondary" variant="caption">
            Điện thoại
          </SkyText>
          <View style={[styles.stateValue, styles.sessionValue]}>
            <session.icon color={session.color} size={15} />
            <SkyText fontsReady={fontsReady} style={styles.sessionText} variant="caption">
              {session.label}
            </SkyText>
          </View>
        </View>
      </SkyCard>

      {(emergencyStopped || robot?.readiness === "stopped") && robot ? (
        <View accessibilityRole="alert" style={styles.safety}>
          <ShieldAlert color={colors.statusDanger} size={18} />
          <View style={styles.safetyText}>
            <SkyText fontsReady={fontsReady} style={{ color: colors.statusDanger }} variant="sectionTitle">
              E-STOP đang bật
            </SkyText>
            <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
              {robot.message}
            </SkyText>
          </View>
        </View>
      ) : robot?.readiness === "offline" ? (
        <SkyButton accessibilityHint="Mở màn hình kết nối robot" fontsReady={fontsReady} onPress={onConnect}>
          Kết nối robot
        </SkyButton>
      ) : robot?.readiness === "needs-calibration" ? (
        <SkyButton accessibilityHint="Mở màn hình hiệu chỉnh" fontsReady={fontsReady} onPress={onCalibrate}>
          Hiệu chỉnh
        </SkyButton>
      ) : null}

      {/* Control area */}
      <View style={styles.section}>
        <View accessibilityRole="tablist" style={styles.segment}>
          {(
            [
              ["motion", "Chuyển động"],
              ["pad", "Bảng giữ"]
            ] as const
          ).map(([value, label]) => {
            const selected = mode === value;
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                key={value}
                onPress={() => {
                  handleControlStop();
                  setMotionFullscreen(false);
                  setMode(value);
                }}
                style={({ pressed }) => [styles.segmentItem, selected && styles.segmentItemSelected, pressed && styles.pressed]}
              >
                <SkyText
                  fontsReady={fontsReady}
                  style={selected ? { color: colors.textPrimary } : undefined}
                  tone={selected ? undefined : "secondary"}
                  variant="cardTitle"
                >
                  {label}
                </SkyText>
              </Pressable>
            );
          })}
        </View>

        {mode === "motion" ? (
          <>
            <MotionPreview
              cameraGranted={!!cameraPermission?.granted}
              colors={colors}
              fontsReady={fontsReady}
              onNativePose={handleNativePose}
              onRequestCamera={requestCameraPermission}
              sessionLabel={session.label}
              styles={styles}
            />
            <Pressable
              accessibilityHint={canControl ? "Giữ để robot làm theo điện thoại, thả để dừng" : lockNote ?? undefined}
              accessibilityLabel={holdLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canControl, selected: active }}
              aria-selected={active}
              disabled={!canControl}
              onPressIn={handleControlStart}
              onPressOut={handleControlStop}
              style={[styles.hold, active && styles.holdActive, !canControl && styles.holdDisabled]}
            >
              <Hand color={canControl ? colors.onAccent : colors.textSecondary} size={20} />
              <SkyText
                fontsReady={fontsReady}
                style={{ color: canControl ? colors.onAccent : colors.textSecondary }}
                variant="sectionTitle"
              >
                {holdLabel}
              </SkyText>
            </Pressable>
          </>
        ) : (
          <View
            accessibilityHint={canControl ? "Giữ để điều khiển. Kéo lên để mở kẹp, kéo xuống để gắp. Vùng bên trái để di chuyển chậm." : lockNote ?? undefined}
            accessibilityLabel={active ? "Bảng giữ, đang điều khiển" : "Bảng giữ"}
            accessible
            onResponderGrant={handleControlStart}
            onResponderMove={handlePadMove}
            onResponderRelease={handleControlStop}
            onResponderTerminate={handleControlStop}
            onStartShouldSetResponder={() => canSendRef.current}
            style={[styles.pad, active && styles.padActive, !canControl && styles.disabled]}
          >
            <View pointerEvents="none" style={styles.fineZone}>
              <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
                Chậm
              </SkyText>
            </View>
            <View pointerEvents="none" style={styles.padCenter}>
              <Hand color={active ? colors.accentInk : colors.textSecondary} size={30} />
              <SkyText fontsReady={fontsReady} style={styles.centered} variant="sectionTitle">
                {active ? "Đang điều khiển" : "Giữ để điều khiển"}
              </SkyText>
              <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
                {active ? (gripperVelocity > 0 ? "Đang mở kẹp" : gripperVelocity < 0 ? "Đang gắp" : "Thả tay để dừng") : "Kéo lên để mở, xuống để gắp"}
              </SkyText>
            </View>
            <View pointerEvents="none" style={styles.gripperTrack}>
              <View style={[styles.gripperThumb, { bottom: `${Math.max(5, Math.min(95, 50 + gripperVelocity / 2))}%` }]} />
            </View>
          </View>
        )}

        {lockNote && (
          <View accessibilityLiveRegion="polite" style={styles.lockNote}>
            <Lock color={colors.textSecondary} size={15} />
            <SkyText fontsReady={fontsReady} style={styles.lockText} tone="secondary" variant="caption">
              {lockNote}
            </SkyText>
          </View>
        )}

        <View style={styles.secondaryRow}>
          <SkyButton
            accessibilityHint="Dừng điều khiển. Lần giữ tiếp theo lấy vị trí điện thoại hiện tại làm điểm gốc."
            disabled={!connected || emergencyStopped}
            fontsReady={fontsReady}
            onPress={recenter}
            style={styles.secondaryButton}
            variant="secondary"
          >
            Căn giữa
          </SkyButton>
          {mode === "motion" && MOTION_INPUT_SUPPORTED && (
            <SkyButton
              accessibilityHint="Mở chế độ toàn màn hình: giữ màn hình để điều khiển, trượt lên để mở kẹp, xuống để gắp"
              fontsReady={fontsReady}
              onPress={openMotionFullscreen}
              style={styles.secondaryButton}
              variant="secondary"
            >
              Toàn màn hình
            </SkyButton>
          )}
        </View>
      </View>

      {/* The phone-control server — the PHONE's link, not the robot's. */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
            Máy chủ điều khiển
          </SkyText>
          <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
            Điện thoại và máy chủ cần cùng mạng Wi-Fi.
          </SkyText>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Địa chỉ máy chủ"
            autoCapitalize="none"
            editable={transport === "disconnected"}
            onChangeText={setServerHost}
            placeholder="Địa chỉ IP"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.hostInput, font("mono", fontsReady)]}
            value={serverHost}
          />
          <TextInput
            accessibilityLabel="Cổng"
            editable={transport === "disconnected"}
            keyboardType="number-pad"
            onChangeText={setServerPort}
            placeholder="Cổng"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.portInput, font("mono", fontsReady)]}
            value={serverPort}
          />
          <Pressable
            accessibilityLabel="Kết nối bảo mật"
            accessibilityRole="switch"
            accessibilityState={{ checked: secureTransport, disabled: transport !== "disconnected" }}
            aria-checked={secureTransport}
            disabled={transport !== "disconnected"}
            onPress={() => setSecureTransport((value) => !value)}
            style={[styles.input, styles.secureToggle, secureTransport && styles.secureToggleOn]}
          >
            <Text style={[styles.secureText, secureTransport && { color: colors.accentInk }, font("mono", fontsReady)]}>
              {secureTransport ? "WSS" : "WS"}
            </Text>
          </Pressable>
        </View>
        <SkyButton
          disabled={emergencyStopped && transport === "disconnected"}
          fontsReady={fontsReady}
          onPress={handleConnect}
          variant="secondary"
        >
          {transport === "connected" ? "Ngắt kết nối" : transport === "connecting" ? "Hủy kết nối" : "Kết nối máy chủ"}
        </SkyButton>
      </View>

      <SkyText fontsReady={fontsReady} tone="secondary" variant="caption">
        Thả tay, mất theo dõi, mất kết nối hoặc chuyển ứng dụng xuống nền đều dừng điều khiển ngay.
        {MOTION_INPUT_SUPPORTED && motionAvailable
          ? ` Nguồn chuyển động: ${isPhoneARNativeAvailable ? "ARKit" : "cảm biến điện thoại"}.`
          : ""}
      </SkyText>

      {/*
        Fullscreen motion view: a full-bleed live camera/AR viewfinder. Its
        backdrop and overlay text are pinned dark (darkColors) regardless of
        app theme — there is no page chrome to theme, only a live feed.
      */}
      <Modal animationType="slide" onRequestClose={closeMotionFullscreen} supportedOrientations={["portrait"]} visible={motionFullscreen}>
        <View style={styles.fullscreen}>
          {!cameraPermission?.granted ? (
            <View style={styles.fullscreenPermission}>
              <Text style={[styles.fullscreenText, font("display", fontsReady)]}>Cần quyền camera</Text>
              <SkyButton fontsReady={fontsReady} onPress={requestCameraPermission}>
                Cho phép camera
              </SkyButton>
            </View>
          ) : (
            <>
              <View
                onResponderGrant={handleSlideStart}
                onResponderMove={handleSlideMove}
                onResponderRelease={handleControlStop}
                onResponderTerminate={handleControlStop}
                onResponderTerminationRequest={() => false}
                onStartShouldSetResponder={() => canSendRef.current}
                style={styles.fullscreenHoldArea}
              >
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {isPhoneARNativeAvailable ? (
                    <PhoneARView onPose={(event) => handleNativePose(event.nativeEvent)} style={StyleSheet.absoluteFill} />
                  ) : (
                    <CameraView facing="back" style={StyleSheet.absoluteFill} />
                  )}
                </View>
                <View pointerEvents="none" style={styles.fullscreenOverlay}>
                  <Text style={[styles.fullscreenChip, font("display", fontsReady)]}>{session.label}</Text>
                  <Text style={[styles.fullscreenHint, font("display", fontsReady)]}>
                    {canControl ? (active ? "Đang điều khiển · Thả để dừng" : "Giữ màn hình để điều khiển") : lockNote}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Quay lại điều khiển"
                accessibilityRole="button"
                onPress={closeMotionFullscreen}
                style={styles.fullscreenBack}
              >
                <Text style={[styles.fullscreenText, font("display", fontsReady)]}>‹  Quay lại</Text>
              </Pressable>
              <View pointerEvents="none" style={styles.fullscreenGripper}>
                <Text style={[styles.fullscreenText, font("display", fontsReady)]}>
                  {gripperVelocity > 0 ? "Đang mở kẹp" : gripperVelocity < 0 ? "Đang gắp" : "Trượt lên để mở · xuống để gắp"}
                </Text>
              </View>
            </>
          )}

          {/*
            Always rendered and last, so it stacks on top: this modal is the
            one surface that covers the floating E-STOP, so it carries its own
            E-STOP entry point — the same App.tsx activation callback, no
            separate stopped state, no reset here.
          */}
          <Pressable
            accessibilityHint={emergencyStopped ? undefined : "Dừng chuyển động toàn hệ thống ngay lập tức"}
            accessibilityLabel={emergencyStopped ? "Hệ thống đang E-STOP" : "Kích hoạt E-STOP"}
            accessibilityRole="button"
            accessibilityState={{ disabled: emergencyStopped }}
            disabled={emergencyStopped}
            hitSlop={8}
            onPress={onEmergencyStop}
            style={({ pressed }) => [styles.fullscreenEstop, pressed && !emergencyStopped && styles.pressed]}
          >
            {emergencyStopped ? (
              <TriangleAlert color={colors.onDanger} size={16} />
            ) : (
              <ShieldAlert color={colors.onDanger} size={16} />
            )}
            <Text style={[styles.fullscreenEstopText, font("display", fontsReady)]}>
              {emergencyStopped ? "ĐÃ DỪNG" : "E-STOP"}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Session (phone) state in words. Green only for a working session — and
// it never stands in for the robot's own readiness above it.
function describeSession({
  colors,
  motionAvailable,
  tracking,
  transport
}: {
  colors: SkyNexColors;
  motionAvailable: boolean;
  tracking: TrackingState;
  transport: Transport;
}) {
  if (!MOTION_INPUT_SUPPORTED) {
    return { label: "Trình duyệt không có cảm biến chuyển động", icon: Smartphone, color: colors.statusOffline };
  }
  if (transport === "connecting") return { label: "Đang kết nối…", icon: Smartphone, color: colors.statusOffline };
  if (transport === "disconnected") return { label: "Chưa kết nối máy chủ điều khiển", icon: Smartphone, color: colors.statusOffline };
  if (!motionAvailable) return { label: "Đã kết nối · chưa có cảm biến chuyển động", icon: CircleAlert, color: colors.statusWarning };
  if (tracking === "lost") return { label: "Đã kết nối · mất theo dõi chuyển động", icon: TriangleAlert, color: colors.statusWarning };
  if (tracking === "limited") return { label: "Đã kết nối · theo dõi hạn chế", icon: TriangleAlert, color: colors.statusWarning };
  return { label: "Đã kết nối · đang theo dõi chuyển động", icon: Smartphone, color: colors.statusReady };
}

// The motion view: the live camera/AR feed the tracking uses, or an honest
// explanation when there is none. No crosshair, no numbers.
function MotionPreview({
  cameraGranted,
  colors,
  fontsReady,
  onNativePose,
  onRequestCamera,
  sessionLabel,
  styles
}: {
  cameraGranted: boolean;
  colors: SkyNexColors;
  fontsReady: boolean;
  onNativePose: (pose: PhoneARPose) => void;
  onRequestCamera: () => void;
  sessionLabel: string;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!MOTION_INPUT_SUPPORTED) {
    return (
      <View style={styles.previewEmpty}>
        <Smartphone color={colors.textSecondary} size={28} strokeWidth={1.5} />
        <SkyText fontsReady={fontsReady} style={styles.centered} variant="sectionTitle">
          Cần điện thoại để điều khiển bằng chuyển động
        </SkyText>
        <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
          Mở SkyNex trên điện thoại. Trên trình duyệt chỉ xem được bố cục và kết nối.
        </SkyText>
      </View>
    );
  }

  if (!cameraGranted) {
    return (
      <View style={styles.previewEmpty}>
        <SkyText fontsReady={fontsReady} style={styles.centered} variant="sectionTitle">
          Cần quyền camera
        </SkyText>
        <SkyText fontsReady={fontsReady} style={styles.centered} tone="secondary" variant="caption">
          Camera giúp theo dõi chuyển động của điện thoại.
        </SkyText>
        <SkyButton fontsReady={fontsReady} onPress={onRequestCamera} variant="secondary">
          Cho phép camera
        </SkyButton>
      </View>
    );
  }

  return (
    // Live feed — pinned dark regardless of theme, like a camera viewfinder.
    <View accessibilityLabel={`Xem trước camera. ${sessionLabel}`} accessible style={styles.preview}>
      {isPhoneARNativeAvailable ? (
        <PhoneARView onPose={(event) => onNativePose(event.nativeEvent)} style={StyleSheet.absoluteFill} />
      ) : (
        <CameraView facing="back" style={StyleSheet.absoluteFill} />
      )}
      <Text style={[styles.previewChip, font("display", fontsReady)]}>{sessionLabel}</Text>
    </View>
  );
}

function eulerToQuaternion(pitch: number, roll: number, yaw: number) {
  const cy = Math.cos(yaw / 2); const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2); const sp = Math.sin(pitch / 2);
  const cr = Math.cos(roll / 2); const sr = Math.sin(roll / 2);
  return { x: sr * cp * cy - cr * sp * sy, y: cr * sp * cy + sr * cp * sy, z: cr * cp * sy - sr * sp * cy, w: cr * cp * cy + sr * sp * sy };
}

function subtractPosition(value: { x: number; y: number; z: number }, reference: { x: number; y: number; z: number }) {
  return { x: clamp(value.x - reference.x, -0.5, 0.5), y: clamp(value.y - reference.y, -0.5, 0.5), z: clamp(value.z - reference.z, -0.5, 0.5) };
}

function relativeQuaternion(current: { x: number; y: number; z: number; w: number }, reference: { x: number; y: number; z: number; w: number }) {
  const inverse = { x: -reference.x, y: -reference.y, z: -reference.z, w: reference.w };
  return {
    x: current.w * inverse.x + current.x * inverse.w + current.y * inverse.z - current.z * inverse.y,
    y: current.w * inverse.y - current.x * inverse.z + current.y * inverse.w + current.z * inverse.x,
    z: current.w * inverse.z + current.x * inverse.y - current.y * inverse.x + current.z * inverse.w,
    w: current.w * inverse.w - current.x * inverse.x - current.y * inverse.y - current.z * inverse.z
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const PREVIEW_HEIGHT = 168;
// Scrim behind text on the live feed: darkColors.background at ~60%.
const FEED_SCRIM = `${darkColors.background}99`;

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.background, flex: 1 },
    content: {
      gap: layout.sectionGap,
      paddingBottom: space.xxxl,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg
    },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.52 },
    centered: { textAlign: "center" },
    group: { borderRadius: corner.productCard, overflow: "hidden", padding: 0 },
    stateRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space.md,
      minHeight: 56,
      paddingHorizontal: layout.productCardPadding,
      paddingVertical: space.md
    },
    stateKey: { paddingTop: 4, width: 72 },
    stateValue: { flex: 1, gap: space.xs },
    sessionValue: { alignItems: "center", flexDirection: "row", paddingTop: 2 },
    sessionText: { flexShrink: 1 },
    divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginLeft: layout.productCardPadding },
    safety: { alignItems: "flex-start", flexDirection: "row", gap: space.sm },
    safetyText: { flex: 1, gap: space.xxs },
    section: { gap: space.md },
    sectionHeader: { gap: space.xxs },
    segment: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.pill,
      flexDirection: "row",
      gap: space.xxs,
      padding: space.xxs
    },
    segmentItem: { alignItems: "center", borderRadius: corner.pill, flex: 1, justifyContent: "center", minHeight: 44 },
    segmentItemSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    preview: {
      backgroundColor: darkColors.surfaceSecondary,
      borderRadius: corner.productCard,
      height: PREVIEW_HEIGHT,
      overflow: "hidden"
    },
    previewChip: {
      alignSelf: "flex-start",
      backgroundColor: FEED_SCRIM,
      borderRadius: corner.pill,
      color: darkColors.textPrimary,
      fontSize: 12,
      left: space.sm,
      overflow: "hidden",
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      position: "absolute",
      top: space.sm
    },
    previewEmpty: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderRadius: corner.productCard,
      gap: space.xs,
      justifyContent: "center",
      minHeight: PREVIEW_HEIGHT,
      padding: layout.productCardPadding
    },
    hold: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: corner.pill,
      flexDirection: "row",
      gap: space.sm,
      justifyContent: "center",
      minHeight: 60,
      paddingHorizontal: space.lg
    },
    // Held: the selected interactive state — label and icon change too,
    // so it is never carried by colour alone.
    holdActive: { borderColor: colors.onAccent, borderWidth: 2, transform: [{ scale: 0.98 }] },
    // Unavailable: neutral, never a faded orange — orange means "you can".
    holdDisabled: { backgroundColor: colors.surfaceRaised },
    pad: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.productCard,
      borderWidth: 1,
      height: PAD_HEIGHT,
      overflow: "hidden"
    },
    padActive: { borderColor: colors.accentInk, borderWidth: 2 },
    fineZone: {
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
      bottom: 0,
      left: 0,
      paddingLeft: space.sm,
      paddingTop: space.sm,
      position: "absolute",
      top: 0,
      width: PAD_FINE_ZONE
    },
    padCenter: {
      alignItems: "center",
      bottom: 0,
      gap: space.xs,
      justifyContent: "center",
      left: PAD_FINE_ZONE,
      paddingHorizontal: space.sm,
      position: "absolute",
      right: 48,
      top: 0
    },
    gripperTrack: {
      backgroundColor: colors.border,
      borderRadius: corner.pill,
      bottom: space.md,
      position: "absolute",
      right: 22,
      top: space.md,
      width: 4
    },
    gripperThumb: {
      backgroundColor: colors.accentInk,
      borderRadius: corner.pill,
      height: 16,
      position: "absolute",
      right: -6,
      width: 16
    },
    lockNote: { alignItems: "center", flexDirection: "row", gap: space.xs },
    lockText: { flexShrink: 1 },
    secondaryRow: { flexDirection: "row", gap: space.sm },
    secondaryButton: { flex: 1 },
    inputRow: { flexDirection: "row", gap: space.xs },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: corner.card,
      borderWidth: 1,
      color: colors.textPrimary,
      minHeight: 48,
      paddingHorizontal: space.sm
    },
    // react-native-web: a flex item's default min-width is its content, so
    // without minWidth:0 the host field pushes its siblings off the row.
    hostInput: { flex: 1, minWidth: 0 },
    portInput: { width: 72 },
    secureToggle: { alignItems: "center", justifyContent: "center", minWidth: 56 },
    secureToggleOn: { borderColor: colors.accentInk },
    secureText: { color: colors.textSecondary, fontSize: 12 },
    fullscreen: { backgroundColor: darkColors.background, flex: 1 },
    fullscreenHoldArea: { flex: 1 },
    fullscreenOverlay: { alignItems: "center", bottom: 0, gap: space.sm, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
    fullscreenChip: {
      backgroundColor: FEED_SCRIM,
      borderRadius: corner.pill,
      color: darkColors.textPrimary,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs
    },
    fullscreenHint: {
      backgroundColor: FEED_SCRIM,
      borderRadius: corner.card,
      color: darkColors.textPrimary,
      fontSize: 14,
      overflow: "hidden",
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      textAlign: "center"
    },
    fullscreenPermission: { alignItems: "center", flex: 1, gap: space.md, justifyContent: "center" },
    fullscreenText: { color: darkColors.textPrimary, fontSize: 14 },
    fullscreenBack: {
      backgroundColor: FEED_SCRIM,
      borderRadius: corner.pill,
      justifyContent: "center",
      left: space.md,
      minHeight: 44,
      paddingHorizontal: space.md,
      position: "absolute",
      top: space.xl
    },
    fullscreenGripper: {
      alignItems: "center",
      backgroundColor: FEED_SCRIM,
      borderRadius: corner.pill,
      bottom: space.xl,
      justifyContent: "center",
      left: space.lg,
      minHeight: 52,
      position: "absolute",
      right: space.lg
    },
    // Same danger/onDanger pairing as the floating E-STOP.
    fullscreenEstop: {
      alignItems: "center",
      backgroundColor: colors.statusDanger,
      borderRadius: corner.card,
      flexDirection: "row",
      gap: space.xxs,
      minHeight: 44,
      paddingHorizontal: space.sm,
      position: "absolute",
      right: space.md,
      top: space.xl
    },
    fullscreenEstopText: { color: colors.onDanger, fontSize: 13, fontWeight: "700" }
  });
}
