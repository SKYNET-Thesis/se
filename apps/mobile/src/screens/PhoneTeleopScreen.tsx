import { Camera, CircleAlert, CircleCheck, Hand, Radio, RotateCcw, ShieldAlert, Wifi, WifiOff } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  AppState,
  GestureResponderEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, font, radius, spacing, type } from "../theme";
import { isPhoneARNativeAvailable, PhoneARPose, PhoneARView } from "../../modules/expo-phone-ar";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
};

type InputMode = "pad" | "motion";
type TrackingState = "ready" | "tracking" | "limited" | "lost";

const PAD_HEIGHT = 220;
const GRIPPER_DEAD_ZONE = 0.1;

export function PhoneTeleopScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  const [serverHost, setServerHost] = useState("192.168.1.100");
  const [serverPort, setServerPort] = useState("4443");
  const [connected, setConnected] = useState(false);
  const [secureTransport, setSecureTransport] = useState(true);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [nativeTracking, setNativeTracking] = useState<TrackingState>("ready");
  const [motionReading, setMotionReading] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const [motionPosition, setMotionPosition] = useState({ x: 0, y: 0, z: 0 });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [mode, setMode] = useState<InputMode>("motion");
  const [motionFullscreen, setMotionFullscreen] = useState(false);
  const [tracking, setTracking] = useState<TrackingState>("ready");
  const [controlHeld, setControlHeld] = useState(false);
  const [fineMode, setFineMode] = useState(false);
  const [gripperVelocity, setGripperVelocity] = useState(0);
  const [speed, setSpeed] = useState(50);
  const [referenceLatched, setReferenceLatched] = useState(false);
  const trackingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const canControl = connected && !emergencyStopped && tracking !== "lost";
  const active = canControl && controlHeld;
  const trackingLabel = { ready: "Sẵn sàng", tracking: "Đang tracking", limited: "Tracking giới hạn", lost: "Mất tracking" }[tracking];
  const trackingColor = tracking === "tracking" ? colors.accent : tracking === "limited" ? colors.caution : tracking === "lost" ? colors.danger : colors.textLo;

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
    if (isPhoneARNativeAvailable) return undefined;
    let mounted = true;
    let subscription: { remove: () => void } | null = null;
    void DeviceMotion.requestPermissionsAsync().then(async (permission) => {
      if (!mounted || !permission.granted) return;
      const available = await DeviceMotion.isAvailableAsync();
      if (!mounted) return;
      setMotionAvailable(available);
      if (!available) return;
      DeviceMotion.setUpdateInterval(50);
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
    setNativeTracking(pose.trackingState);
    setMotionAvailable(pose.trackingState !== "lost");
    setMotionPosition(pose.position);
    setMotionReading({ pitch: 0, roll: 0, yaw: 0 });
    setTracking(pose.trackingState);
    nativeQuaternionRef.current = pose.quaternion;
  };

  useEffect(() => {
    if (emergencyStopped || !connected || tracking === "lost") {
      setControlHeld(false);
      controlHeldRef.current = false;
      setReferenceLatched(false);
    }
  }, [connected, emergencyStopped, tracking]);

  useEffect(() => () => {
    if (trackingTimer.current) clearTimeout(trackingTimer.current);
    socketRef.current?.close();
  }, []);

  const handleConnect = () => {
    if (connected) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      setControlHeld(false);
      setReferenceLatched(false);
      setTracking("ready");
      return;
    }

    if (!serverHost.trim() || !serverPort.trim()) return;
    const socket = new WebSocket(`${secureTransport ? "wss" : "ws"}://${serverHost.trim()}:${serverPort.trim()}/ws`);
    socketRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      setTracking(motionAvailable ? "tracking" : "limited");
      socket.send(JSON.stringify({ type: "hello", protocolVersion: 1, platform: "ios", sessionId: sessionIdRef.current, arm: "right" }));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type?: string; timestampNs?: number };
        if (message.type === "pong" && message.timestampNs) setLatencyMs(Math.max(0, Math.round((Date.now() * 1e6 - message.timestampNs) / 1e6)));
      } catch {
        // Ignore malformed status messages; the server remains the protocol authority.
      }
    };
    socket.onerror = () => {
      setTracking("lost");
      setControlHeld(false);
    };
    socket.onclose = () => {
      socketRef.current = null;
      setConnected(false);
      setControlHeld(false);
      setReferenceLatched(false);
      setTracking("ready");
    };
  };

  const handleControlStart = () => {
    if (!canControl) return;
    setControlHeld(true);
    controlHeldRef.current = true;
    velocityRef.current = { x: 0, y: 0, z: 0 };
    lastAccelerationTimestampRef.current = null;
    referencePositionRef.current = isPhoneARNativeAvailable ? motionPosition : { x: 0, y: 0, z: 0 };
    referenceNativeQuaternionRef.current = nativeQuaternionRef.current;
    if (!isPhoneARNativeAvailable) setMotionPosition({ x: 0, y: 0, z: 0 });
    referenceMotionRef.current = motionReading;
    setReferenceLatched(true);
  };

  const handleControlStop = () => {
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

  const handlePadMove = (event: GestureResponderEvent) => {
    if (!active || mode !== "pad") return;
    const { locationY, locationX } = event.nativeEvent;
    setFineMode(locationX < 92);
    const normalized = 1 - Math.max(0, Math.min(PAD_HEIGHT, locationY)) / PAD_HEIGHT;
    setGripperVelocity(Math.abs(normalized - 0.5) < GRIPPER_DEAD_ZONE ? 0 : Math.max(-1, Math.min(1, (normalized - 0.5) * 2)));
  };

  const recenter = () => {
    if (!connected || emergencyStopped) return;
    setReferenceLatched(false);
    setControlHeld(false);
    controlHeldRef.current = false;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "recenter", protocolVersion: 1 }));
    }
  };

  useEffect(() => {
    if (!active || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return undefined;
    const timer = setInterval(() => {
      const timestampNs = Date.now() * 1e6;
      socketRef.current?.send(JSON.stringify({
        type: "phone_pose",
        protocolVersion: 1,
        platform: "ios",
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
    }, 50);
    return () => clearInterval(timer);
  }, [active, fineMode, gripperVelocity, motionPosition, motionReading, tracking]);

  const statusText = useMemo(() => {
    if (emergencyStopped) return "E-STOP đang bật — mọi lệnh đã bị khóa";
    if (!connected) return "Kết nối điện thoại với server để bắt đầu";
    if (!controlHeld) return "Giữ nút điều khiển để robot chuyển động";
    return mode === "pad" ? "CONTROL ACTIVE · Pad đang được giữ" : "CONTROL ACTIVE · Đang dùng pose điện thoại";
  }, [connected, controlHeld, emergencyStopped, mode]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <ScreenHeader
        fontsReady={fontsReady}
        meta="PHONE"
        onBack={onBack}
        subtitle="Điều khiển SO-101 bằng pad hoặc chuyển động điện thoại"
        title="Phone Teleop"
      />

      <View style={styles.connectionCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Kết nối</Text>
            <Text style={[styles.caption, font("body", fontsReady)]}>Cùng Wi-Fi nội bộ · WebSocket</Text>
          </View>
          <View style={[styles.statusPill, connected ? styles.statusPillOk : styles.statusPillMuted]}>
            {connected ? <Wifi color={colors.accent} size={14} /> : <WifiOff color={colors.textLo} size={14} />}
            <Text style={[styles.statusPillText, font("mono", fontsReady)]}>{connected ? "CONNECTED" : "OFFLINE"}</Text>
          </View>
        </View>
        <View style={styles.inputRow}>
          <TextInput autoCapitalize="none" editable={!connected} onChangeText={setServerHost} placeholder="Server IP / hostname" placeholderTextColor={colors.textLo} style={[styles.input, styles.hostInput, font("mono", fontsReady)]} value={serverHost} />
          <TextInput editable={!connected} keyboardType="number-pad" onChangeText={setServerPort} placeholder="Port" placeholderTextColor={colors.textLo} style={[styles.input, styles.portInput, font("mono", fontsReady)]} value={serverPort} />
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: secureTransport, disabled: connected }} disabled={connected} onPress={() => setSecureTransport((value) => !value)} style={[styles.transportButton, secureTransport && styles.transportButtonActive]}><Text style={[styles.transportText, font("mono", fontsReady)]}>{secureTransport ? "WSS" : "WS"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={emergencyStopped} onPress={handleConnect} style={({ pressed }) => [styles.connectButton, connected && styles.disconnectButton, emergencyStopped && styles.disabled, pressed && styles.pressed]}>
            <Text style={[styles.connectText, font("display", fontsReady)]}>{connected ? "Ngắt" : "Kết nối"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stateCard}>
        <View style={styles.stateMain}>
          <View style={[styles.stateDot, { backgroundColor: trackingColor }]} />
          <View style={styles.stateCopy}>
            <Text style={[styles.stateTitle, font("display", fontsReady)]}>{statusText}</Text>
            <Text style={[styles.caption, font("body", fontsReady)]}>Robot: <Text style={styles.accentText}>CONNECTED SERVER</Text> · Độ trễ {latencyMs === null ? "—" : `${latencyMs} ms`}</Text>
          </View>
        </View>
        <View style={styles.stateMetrics}>
          <Metric label="TRACKING" value={trackingLabel} color={trackingColor} fontsReady={fontsReady} />
          <Metric label="REFERENCE" value={referenceLatched ? "LATCHED" : "RECENTER"} color={referenceLatched ? colors.accent : colors.caution} fontsReady={fontsReady} />
        </View>
      </View>

      <View style={styles.modeRow}>
        <ModeButton active={mode === "pad"} icon={<Hand color={mode === "pad" ? colors.accentText : colors.textLo} size={18} />} label="Control pad" onPress={() => { closeMotionFullscreen(); setMode("pad"); }} fontsReady={fontsReady} />
        <ModeButton active={mode === "motion"} icon={<Camera color={mode === "motion" ? colors.accentText : colors.textLo} size={18} />} label="Motion + camera" onPress={openMotionFullscreen} fontsReady={fontsReady} />
      </View>

      {mode === "pad" ? (
        <View style={styles.controlCard}>
          <View style={styles.controlHeader}>
            <View>
              <Text style={[styles.sectionTitle, font("display", fontsReady)]}>Control pad</Text>
              <Text style={[styles.caption, font("body", fontsReady)]}>Giữ để di chuyển · Kéo dọc để gắp</Text>
            </View>
            <Text style={[styles.fineHint, font("mono", fontsReady)]}>{fineMode ? "FINE" : "NORMAL"}</Text>
          </View>
          <View onResponderGrant={handleControlStart} onResponderMove={handlePadMove} onResponderRelease={handleControlStop} onResponderTerminate={handleControlStop} style={[styles.pad, !canControl && styles.padDisabled, active && styles.padActive]}>
            <View pointerEvents="none" style={styles.fineZone}><Text style={[styles.zoneText, font("mono", fontsReady)]}>FINE</Text></View>
            <View pointerEvents="none" style={styles.padCenter}><Hand color={active ? colors.accent : colors.textLo} size={34} /><Text style={[styles.padAction, font("display", fontsReady)]}>{active ? "CONTROL ACTIVE" : canControl ? "GIỮ ĐỂ ĐIỀU KHIỂN" : "KẾT NỐI ĐỂ BẮT ĐẦU"}</Text><Text style={[styles.padSubtext, font("body", fontsReady)]}>{active ? (gripperVelocity > 0 ? "Gripper mở" : gripperVelocity < 0 ? "Gripper đóng" : "Đang giữ mục tiêu") : "Thả tay để dừng mục tiêu"}</Text></View>
            <View pointerEvents="none" style={styles.gripperTrack}><View style={[styles.gripperThumb, { bottom: `${Math.max(5, Math.min(95, 50 + gripperVelocity / 2))}%` }]} /><Text style={[styles.gripperLabel, styles.gripperTop, font("mono", fontsReady)]}>OPEN</Text><Text style={[styles.gripperLabel, styles.gripperBottom, font("mono", fontsReady)]}>CLOSE</Text></View>
          </View>
          <View style={styles.padFooter}><Text style={[styles.caption, font("body", fontsReady)]}>Bên trái: fine mode · vùng giữa: dead zone</Text><Text style={[styles.valueText, font("monoStrong", fontsReady)]}>GRIP {gripperVelocity > 0 ? "+" : ""}{Math.round(gripperVelocity * 100)}</Text></View>
        </View>
      ) : (
        <View style={styles.controlCard}>
          <View style={styles.controlHeader}><View><Text style={[styles.sectionTitle, font("display", fontsReady)]}>Motion + camera</Text><Text style={[styles.caption, font("body", fontsReady)]}>Di chuyển điện thoại để điều khiển pose</Text></View><Radio color={trackingColor} size={20} /></View>
          {!cameraPermission?.granted ? <View style={styles.cameraPermission}><Camera color={colors.textLo} size={30} /><Text style={[styles.cameraTitle, font("display", fontsReady)]}>Cần quyền camera</Text><Text style={[styles.caption, font("body", fontsReady)]}>Camera được dùng để tracking và quan sát.</Text><Pressable onPress={requestCameraPermission} style={styles.permissionButton}><Text style={[styles.connectText, font("display", fontsReady)]}>Cho phép camera</Text></Pressable></View> : <View style={styles.cameraMock}>{isPhoneARNativeAvailable ? <PhoneARView onPose={(event) => handleNativePose(event.nativeEvent)} style={StyleSheet.absoluteFill} /> : <CameraView facing="back" style={StyleSheet.absoluteFill} />}<View style={styles.cameraOverlay}><Text style={[styles.cameraTitle, font("display", fontsReady)]}>{isPhoneARNativeAvailable ? "ARKit 6DOF" : "LIVE CAMERA"}</Text><Text style={[styles.caption, font("body", fontsReady)]}>{isPhoneARNativeAvailable ? nativeTracking.toUpperCase() : motionAvailable ? `P ${motionReading.pitch.toFixed(1)}° · R ${motionReading.roll.toFixed(1)}°` : "Motion sensor unavailable"}</Text><View style={styles.crosshair}><View style={styles.crosshairHorizontal} /><View style={styles.crosshairVertical} /></View></View></View>}
          <Pressable accessibilityRole="button" disabled={!canControl} onPressIn={handleControlStart} onPressOut={handleControlStop} style={({ pressed }) => [styles.holdButton, active && styles.holdButtonActive, !canControl && styles.disabled, pressed && styles.pressed]}><Text style={[styles.holdButtonText, font("display", fontsReady)]}>{active ? "ĐANG ĐIỀU KHIỂN · THẢ ĐỂ DỪNG" : "GIỮ ĐỂ ĐIỀU KHIỂN"}</Text></Pressable>
          <Pressable accessibilityLabel="Kẹp hoặc nhả gripper" accessibilityRole="button" disabled={!canControl} onPress={() => setGripperVelocity((value) => value === 0 ? -1 : 1)} style={({ pressed }) => [styles.gripperButton, !canControl && styles.disabled, pressed && styles.pressed]}><Hand color={colors.accent} size={18} /><Text style={[styles.gripperButtonText, font("display", fontsReady)]}>{gripperVelocity < 0 ? "Mở gripper" : "Kẹp gripper"}</Text></Pressable>
        </View>
      )}

      <View style={styles.actionsRow}>
        <Pressable accessibilityRole="button" disabled={!connected || emergencyStopped} onPress={recenter} style={({ pressed }) => [styles.secondaryButton, (!connected || emergencyStopped) && styles.disabled, pressed && styles.pressed]}><RotateCcw color={colors.textHi} size={17} /><Text style={[styles.secondaryText, font("display", fontsReady)]}>Recenter</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={handleControlStop} style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}><ShieldAlert color={colors.textHi} size={17} /><Text style={[styles.secondaryText, font("display", fontsReady)]}>Dừng motion</Text></Pressable>
      </View>

      <View style={styles.speedCard}><View style={styles.cardTitleRow}><Text style={[styles.sectionTitle, font("display", fontsReady)]}>Tốc độ chuyển động</Text><Text style={[styles.speedValue, font("monoStrong", fontsReady)]}>{speed}%</Text></View><View style={styles.speedTrack}>{[25, 50, 75].map((point) => <Pressable key={point} accessibilityRole="button" onPress={() => setSpeed(point)} style={[styles.speedPoint, { left: `${point}%` }, speed >= point && styles.speedPointActive]} />)}<View style={[styles.speedFill, { width: `${speed}%` }]} /></View><View style={styles.speedLabels}><Text style={[styles.caption, font("mono", fontsReady)]}>SLOW</Text><Text style={[styles.caption, font("mono", fontsReady)]}>NORMAL</Text><Text style={[styles.caption, font("mono", fontsReady)]}>FAST</Text></View></View>

      <View style={styles.notice}><CircleAlert color={colors.caution} size={17} /><Text style={[styles.noticeText, font("body", fontsReady)]}>{motionAvailable ? `${isPhoneARNativeAvailable ? "Pose đang lấy từ ARKit 6DoF." : "Pose đang lấy từ Device Motion (fallback)."} Thả pad, mất tracking, mất WebSocket hoặc đưa app xuống nền sẽ tự động khóa lệnh.` : "iPhone chưa cấp quyền hoặc không có tracking; không thể bật điều khiển pose."}</Text></View>

      <Modal animationType="slide" onRequestClose={closeMotionFullscreen} supportedOrientations={["portrait"]} visible={motionFullscreen}>
        <View style={styles.motionFullscreen}>
          {!cameraPermission?.granted ? (
            <View style={styles.fullscreenPermission}>
              <Camera color={colors.textHi} size={34} />
              <Text style={[styles.cameraTitle, font("display", fontsReady)]}>Cần quyền camera</Text>
              <Pressable onPress={requestCameraPermission} style={styles.permissionButton}>
                <Text style={[styles.connectText, font("display", fontsReady)]}>Cho phép camera</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable onPressIn={handleControlStart} onPressOut={handleControlStop} style={styles.fullscreenHoldArea}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>{isPhoneARNativeAvailable ? <PhoneARView onPose={(event) => handleNativePose(event.nativeEvent)} style={StyleSheet.absoluteFill} /> : <CameraView facing="back" style={StyleSheet.absoluteFill} />}</View>
                <View pointerEvents="none" style={styles.fullscreenOverlay}>
                  <Text style={[styles.fullscreenTracking, font("mono", fontsReady)]}>{isPhoneARNativeAvailable ? `ARKit · ${nativeTracking.toUpperCase()}` : `DEVICE MOTION · ${tracking.toUpperCase()}`}</Text>
                  <View style={styles.crosshair}><View style={styles.crosshairHorizontal} /><View style={styles.crosshairVertical} /></View>
                  <Text style={[styles.fullscreenHint, font("display", fontsReady)]}>{active ? "ĐANG ĐIỀU KHIỂN · THẢ ĐỂ DỪNG" : "GIỮ MÀN HÌNH ĐỂ ĐIỀU KHIỂN"}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityLabel="Quay lại trang điều khiển" onPress={closeMotionFullscreen} style={styles.fullscreenBack}>
                <Text style={[styles.fullscreenBackText, font("display", fontsReady)]}>‹  Điều khiển</Text>
              </Pressable>
              <Pressable accessibilityLabel="Kẹp hoặc nhả gripper" onPress={() => setGripperVelocity((value) => value === 0 ? -1 : 1)} style={({ pressed }) => [styles.fullscreenGripper, pressed && styles.pressed]}>
                <Hand color={colors.accentText} size={20} />
                <Text style={[styles.fullscreenGripperText, font("display", fontsReady)]}>{gripperVelocity < 0 ? "Mở gripper" : "Kẹp gripper"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </ScrollView>
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

function Metric({ label, value, color, fontsReady }: { label: string; value: string; color: string; fontsReady: boolean }) {
  return <View><Text style={[styles.metricLabel, font("mono", fontsReady)]}>{label}</Text><Text style={[styles.metricValue, font("display", fontsReady), { color }]}>{value}</Text></View>;
}

function ModeButton({ active, icon, label, onPress, fontsReady }: { active: boolean; icon: ReactNode; label: string; onPress: () => void; fontsReady: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.modeButton, active && styles.modeButtonActive, pressed && styles.pressed]}>{icon}<Text style={[styles.modeText, font("display", fontsReady), active && styles.modeTextActive]}>{label}</Text>{active && <CircleCheck color={colors.accentText} size={15} />}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  connectionCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  cardTitleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.textHi, fontSize: 17, lineHeight: 22 },
  caption: { color: colors.textLo, fontSize: 12, lineHeight: 18 },
  statusPill: { alignItems: "center", borderRadius: radius.round, flexDirection: "row", gap: spacing.xxs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusPillOk: { backgroundColor: "#263516" }, statusPillMuted: { backgroundColor: colors.surface2 },
  statusPillText: { color: colors.textLo, fontSize: 10 }, inputRow: { flexDirection: "row", gap: spacing.xs },
  input: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, color: colors.textHi, minHeight: 46, paddingHorizontal: spacing.sm }, hostInput: { flex: 1 }, portInput: { width: 92 }, transportButton: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, justifyContent: "center", minWidth: 48 }, transportButtonActive: { borderColor: colors.accent }, transportText: { color: colors.textLo, fontSize: 10 },
  connectButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.button, justifyContent: "center", minWidth: 82, paddingHorizontal: spacing.sm }, disconnectButton: { backgroundColor: colors.surface2, borderColor: colors.danger, borderWidth: 1 }, connectText: { color: colors.accentText, fontSize: 13 },
  stateCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, padding: spacing.md }, stateMain: { alignItems: "center", flexDirection: "row", gap: spacing.sm }, stateDot: { borderRadius: radius.round, height: 10, width: 10 }, stateCopy: { flex: 1 }, stateTitle: { color: colors.textHi, fontSize: 14, lineHeight: 20 }, accentText: { color: colors.accent }, stateMetrics: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.xxxl, paddingTop: spacing.sm }, metricLabel: { color: colors.textLo, fontSize: 10 }, metricValue: { fontSize: 12, lineHeight: 18 },
  modeRow: { flexDirection: "row", gap: spacing.sm }, modeButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.xs }, modeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent }, modeText: { color: colors.textLo, fontSize: 12 }, modeTextActive: { color: colors.accentText },
  controlCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, padding: spacing.md }, controlHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, fineHint: { color: colors.accent, fontSize: 11 }, pad: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, height: PAD_HEIGHT, overflow: "hidden" }, padDisabled: { opacity: 0.52 }, padActive: { borderColor: colors.accent }, fineZone: { backgroundColor: "#252b1d", bottom: 0, left: 0, position: "absolute", top: 0, width: 92 }, zoneText: { color: colors.accent, fontSize: 10, left: spacing.sm, position: "absolute", top: spacing.sm }, padCenter: { alignItems: "center", bottom: 0, justifyContent: "center", left: 92, position: "absolute", right: 55, top: 0 }, padAction: { color: colors.textHi, fontSize: 12, marginTop: spacing.sm, textAlign: "center" }, padSubtext: { color: colors.textLo, fontSize: 11, marginTop: spacing.xs, textAlign: "center" }, gripperTrack: { backgroundColor: colors.border, borderRadius: radius.round, bottom: spacing.md, position: "absolute", right: 21, top: spacing.md, width: 4 }, gripperThumb: { backgroundColor: colors.accent, borderColor: colors.accentText, borderRadius: radius.round, borderWidth: 2, height: 16, position: "absolute", right: -6, width: 16 }, gripperLabel: { color: colors.textLo, fontSize: 8, position: "absolute", right: 10 }, gripperTop: { top: -3 }, gripperBottom: { bottom: -3 }, padFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, valueText: { color: colors.accent, fontSize: 11 },
  cameraMock: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, height: 220, overflow: "hidden" }, cameraPermission: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, gap: spacing.xs, height: 220, justifyContent: "center" }, permissionButton: { backgroundColor: colors.accent, borderRadius: radius.button, marginTop: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, cameraOverlay: { alignItems: "center", backgroundColor: "#0005", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 }, cameraTitle: { color: colors.textHi, fontSize: 14, marginTop: spacing.sm }, crosshair: { height: 64, position: "absolute", width: 64 }, crosshairHorizontal: { backgroundColor: colors.accent, height: 1, left: 0, position: "absolute", right: 0, top: 32 }, crosshairVertical: { backgroundColor: colors.accent, bottom: 0, position: "absolute", right: 32, top: 0, width: 1 }, holdButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.button, justifyContent: "center", minHeight: 52 }, holdButtonActive: { backgroundColor: colors.caution }, holdButtonText: { color: colors.accentText, fontSize: 12 }, gripperButton: { alignItems: "center", borderColor: colors.accent, borderRadius: radius.button, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 }, gripperButtonText: { color: colors.textHi, fontSize: 12 }, motionFullscreen: { backgroundColor: "#000", flex: 1 }, fullscreenHoldArea: { flex: 1 }, fullscreenOverlay: { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 }, fullscreenTracking: { backgroundColor: "#0008", color: colors.textHi, fontSize: 11, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, fullscreenHint: { backgroundColor: "#0009", bottom: 112, color: colors.textHi, fontSize: 13, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: "absolute" }, fullscreenPermission: { alignItems: "center", flex: 1, gap: spacing.xs, justifyContent: "center" }, fullscreenBack: { backgroundColor: "#111c", borderColor: colors.textHi, borderRadius: radius.button, borderWidth: 1, left: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: "absolute", top: spacing.xl }, fullscreenBackText: { color: colors.textHi, fontSize: 13 }, fullscreenGripper: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.button, bottom: spacing.xl, flexDirection: "row", gap: spacing.xs, justifyContent: "center", left: spacing.lg, minHeight: 54, paddingHorizontal: spacing.md, position: "absolute", right: spacing.lg }, fullscreenGripperText: { color: colors.accentText, fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: spacing.sm }, secondaryButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 }, stopButton: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.button, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 }, secondaryText: { color: colors.textHi, fontSize: 12 }, speedCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, speedValue: { color: colors.accent, fontSize: 14 }, speedTrack: { backgroundColor: colors.border, height: 6, position: "relative" }, speedFill: { backgroundColor: colors.accent, height: 6, left: 0, position: "absolute", top: 0 }, speedPoint: { backgroundColor: colors.textLo, borderRadius: radius.round, height: 14, marginLeft: -7, marginTop: -4, position: "absolute", width: 14, zIndex: 2 }, speedPointActive: { backgroundColor: colors.accent }, speedLabels: { flexDirection: "row", justifyContent: "space-between" }, notice: { alignItems: "flex-start", backgroundColor: "#2e2819", borderColor: colors.caution, borderRadius: radius.button, borderWidth: 1, flexDirection: "row", gap: spacing.xs, padding: spacing.sm }, noticeText: { color: colors.textHi, flex: 1, fontSize: 12 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.78 }
});
