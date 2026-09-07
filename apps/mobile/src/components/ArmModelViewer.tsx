import { Asset } from "expo-asset";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl/build/GLView.types";
import { RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { colors } from "../theme";

const modelAsset = require("../../assets/models/arm.glb");

type Props = {
  accentColor?: string;
  backgroundColor?: string;
  compact?: boolean;
  floorColor?: string;
  reduceMotion?: boolean;
  showFaults?: boolean;
  softFloor?: boolean;
  selectedFault?: number | null;
  onFaultSelect?: (index: number) => void;
};

type Point = { x: number; y: number };

const faultColors = ["#e9ad37", "#e9ad37", "#ef5b61"];

// Margin above the exact "sphere touches frame edge" distance (radius / sin(fov/2)).
// 1.2 leaves the model filling ~80% of the frame height at any rotation, since the
// fit is derived from the model's bounding SPHERE (rotation-invariant), not its
// axis-aligned box, so it never clips edges as the user spins it.
const CAMERA_FIT_MARGIN = 1.2;

// Yaw-only camera presets for the diagnostic fault callouts — no pitch
// component, so focusing a fault never tilts the base off its plane.
const FOCUS_YAW_ANGLES = [-0.3, 0.18, -0.76];

function fitCameraToBoundingSphere(camera: THREE.PerspectiveCamera, boundingRadius: number) {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const fitDistance = (boundingRadius / Math.sin(verticalFov / 2)) * CAMERA_FIT_MARGIN;

  camera.position.x = 0;
  camera.position.y = 0;
  camera.position.z = fitDistance;
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(fitDistance * 0.01, 0.001);
  camera.far = fitDistance * 12;
  camera.updateProjectionMatrix();

  return fitDistance;
}

function addFloor(
  scene: THREE.Scene,
  {
    boundingRadius,
    compact,
    floorColor,
    floorY,
    softFloor
  }: {
    boundingRadius: number;
    compact: boolean;
    floorColor: string;
    floorY: number;
    softFloor: boolean;
  }
) {
  if (softFloor) {
    const shadowColor = new THREE.Color(floorColor);
    const floorLayers = [
      { radius: boundingRadius * (compact ? 0.74 : 0.92), opacity: 0.1 },
      { radius: boundingRadius * (compact ? 0.52 : 0.68), opacity: 0.16 }
    ];

    floorLayers.forEach(({ radius, opacity }, index) => {
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 64),
        new THREE.MeshBasicMaterial({
          color: shadowColor.clone(),
          depthWrite: false,
          opacity,
          transparent: true
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY + boundingRadius * 0.001 * index;
      scene.add(floor);
    });
    return;
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(boundingRadius * (compact ? 0.85 : 1.05), 48),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(floorColor),
      roughness: 0.82,
      metalness: 0.12
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  scene.add(floor);
}

function createRenderer(gl: ExpoWebGLRenderingContext) {
  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as HTMLCanvasElement;

  return new THREE.WebGLRenderer({
    canvas,
    context: gl as unknown as WebGLRenderingContext
  });
}

function ensureReactNativeUserAgent() {
  if (typeof navigator === "undefined" || navigator.userAgent) return;

  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "OmniArm React Native"
  });
}

function distanceBetweenTouches(event: GestureResponderEvent) {
  const [first, second] = event.nativeEvent.touches;
  if (!first || !second) return 0;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

export function ArmModelViewer({
  accentColor = colors.accent,
  backgroundColor = colors.surface,
  compact = false,
  floorColor = colors.surface2,
  reduceMotion = false,
  showFaults = !compact,
  softFloor = false,
  selectedFault = null,
  onFaultSelect
}: Props) {
  const frameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const anchorRefs = useRef<THREE.Vector3[]>([]);
  const layoutRef = useRef({ width: 0, height: 0 });
  // Yaw only (radians around the vertical axis) — pitch/roll are permanently
  // locked so the robot's base plane never tilts, matching a turntable.
  const rotationRef = useRef(-0.45);
  const gestureStartRef = useRef(0);
  // Placeholder distance/radius until the model loads and the real bounding
  // sphere is known; onContextCreate overwrites this with the fitted values.
  const fitRef = useRef({ distance: compact ? 3.8 : 5.1, radius: 1 });
  const zoomRef = useRef(fitRef.current.distance);
  const pinchRef = useRef({ distance: 0, zoom: zoomRef.current });
  const pulse = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);
  const [faultPoints, setFaultPoints] = useState<Point[]>([]);

  const projectFaults = useCallback(() => {
    const camera = cameraRef.current;
    const group = groupRef.current;
    const { width, height } = layoutRef.current;
    if (!camera || !group || !width || !height || anchorRefs.current.length === 0) return;

    group.updateWorldMatrix(true, true);
    camera.updateMatrixWorld(true);
    setFaultPoints(
      anchorRefs.current.map((anchor) => {
        const projected = anchor.clone().applyMatrix4(group.matrixWorld).project(camera);
        return {
          x: ((projected.x + 1) / 2) * width,
          y: ((1 - projected.y) / 2) * height
        };
      })
    );
  }, []);

  const resetView = useCallback(() => {
    rotationRef.current = -0.45;
    zoomRef.current = fitRef.current.distance;
    if (groupRef.current) {
      groupRef.current.rotation.set(0, rotationRef.current, 0);
    }
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, zoomRef.current);
      cameraRef.current.lookAt(0, 0, 0);
    }
    projectFaults();
  }, [projectFaults]);

  useEffect(() => {
    if (selectedFault === null || !groupRef.current || !cameraRef.current) return;
    const yaw = FOCUS_YAW_ANGLES[selectedFault] ?? FOCUS_YAW_ANGLES[0];
    rotationRef.current = yaw;
    groupRef.current.rotation.set(0, yaw, 0);
    zoomRef.current = fitRef.current.distance * 0.92;
    cameraRef.current.position.z = zoomRef.current;
    projectFaults();
  }, [projectFaults, selectedFault]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponder: (event, gesture) =>
          event.nativeEvent.touches.length === 2 ||
          (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          event.nativeEvent.touches.length === 2 ||
          (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
        onPanResponderGrant: (event) => {
          gestureStartRef.current = rotationRef.current;
          pinchRef.current = {
            distance: distanceBetweenTouches(event),
            zoom: zoomRef.current
          };
        },
        onPanResponderMove: (event, gesture) => {
          const group = groupRef.current;
          const camera = cameraRef.current;
          if (event.nativeEvent.touches.length >= 2 && camera) {
            const distance = distanceBetweenTouches(event);
            if (pinchRef.current.distance > 0 && distance > 0) {
              const nextZoom = pinchRef.current.zoom * (pinchRef.current.distance / distance);
              const minZoom = fitRef.current.distance * 0.55;
              const maxZoom = fitRef.current.distance * 1.8;
              zoomRef.current = Math.max(minZoom, Math.min(maxZoom, nextZoom));
              camera.position.z = zoomRef.current;
            }
          } else if (group) {
            // Yaw only — horizontal drag spins the base like a turntable;
            // vertical drag is intentionally ignored so pitch stays locked.
            rotationRef.current = gestureStartRef.current + gesture.dx * 0.009;
            group.rotation.set(0, rotationRef.current, 0);
          }
          projectFaults();
        },
        onPanResponderRelease: projectFaults,
        onPanResponderTerminate: projectFaults,
        onPanResponderTerminationRequest: () => true
      }),
    [projectFaults]
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutRef.current = event.nativeEvent.layout;
      projectFaults();
    },
    [projectFaults]
  );

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
        const renderer = createRenderer(gl);
        renderer.setSize(width, height);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(backgroundColor);

        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 0, zoomRef.current);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const group = new THREE.Group();
        group.rotation.set(0, rotationRef.current, 0);
        groupRef.current = group;
        scene.add(group);

        const ambient = new THREE.AmbientLight(0xffffff, 1.25);
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(4, 5, 5);
        const rim = new THREE.DirectionalLight(0x65e0ff, 1.1);
        rim.position.set(-4, 2, -2);
        scene.add(ambient, key, rim);

        const asset = Asset.fromModule(modelAsset);
        await asset.downloadAsync();
        ensureReactNativeUserAgent();

        await new Promise<void>((resolve, reject) => {
          const loader = new GLTFLoader();
          loader.load(
            asset.localUri ?? asset.uri,
            (gltf: { scene: THREE.Object3D }) => {
              const model = gltf.scene;
              model.updateMatrixWorld(true);

              // Bounding SPHERE (not just the axis-aligned box) so the fit is
              // rotation-invariant: the model never clips the frame edges no
              // matter how the user spins it with the two-finger gesture.
              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              const sphere = box.getBoundingSphere(new THREE.Sphere());
              const boundingRadius = Math.max(sphere.radius, 0.001);

              // Pivot at the model's BASE (not its geometric center): the
              // model is offset so its floor-contact point sits at the
              // group's local origin, and the group is shifted down by that
              // same amount in world space so the bounding-sphere center —
              // what the camera fit below still targets — lands exactly
              // where it always did. Yaw rotates around a vertical line
              // through that base point, so the feet never drift.
              model.position.set(-center.x, -box.min.y, -center.z);
              group.position.set(0, box.min.y - center.y, 0);
              group.add(model);

              const fitDistance = fitCameraToBoundingSphere(camera, boundingRadius);
              fitRef.current = { distance: fitDistance, radius: boundingRadius };
              zoomRef.current = fitDistance;

              const floorY = box.min.y - center.y - boundingRadius * 0.02;
              addFloor(scene, { boundingRadius, compact, floorColor, floorY, softFloor });

              group.updateWorldMatrix(true, true);
              anchorRefs.current = ["shoulder_lift", "elbow_flex", "gripper_link"].map((name) => {
                const component = model.getObjectByName(name);
                if (!component) return new THREE.Vector3();
                return group.worldToLocal(component.getWorldPosition(new THREE.Vector3()));
              });

              if (selectedFault !== null) {
                const yaw = FOCUS_YAW_ANGLES[selectedFault] ?? FOCUS_YAW_ANGLES[0];
                rotationRef.current = yaw;
                group.rotation.set(0, yaw, 0);
                zoomRef.current = fitDistance * 0.92;
                camera.position.z = zoomRef.current;
              }

              projectFaults();
              resolve();
            },
            undefined,
            reject
          );
        });

        const render = () => {
          frameRef.current = requestAnimationFrame(render);
          renderer.render(scene, camera);
          gl.endFrameEXP();
        };

        render();
      } catch (error) {
        console.warn("Failed to load arm.glb", error);
        setFailed(true);
      }
    },
    [backgroundColor, compact, floorColor, projectFaults, selectedFault, softFloor]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  useEffect(() => {
    if (reduceMotion || !showFaults) return undefined;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 760, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion, showFaults]);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <View style={styles.base} />
        <View style={styles.armOne} />
        <View style={styles.armTwo} />
        <View style={styles.jointLarge} />
        <Text style={styles.fallbackText}>Mô hình 3D tạm ngắt</Text>
      </View>
    );
  }

  return (
    <View style={styles.viewer} onLayout={onLayout} {...panResponder.panHandlers}>
      <GLView pointerEvents="none" style={styles.gl} onContextCreate={onContextCreate} />

      {!compact && (
        <Pressable
          accessibilityLabel="Reset 3D view"
          hitSlop={8}
          onPress={resetView}
          style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}
        >
          <RotateCcw size={17} color="#d8dedb" />
        </Pressable>
      )}

      {showFaults && faultPoints.length === faultColors.length && (
        <>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            {faultPoints.map((point, index) => (
              <Circle
                key={`${faultColors[index]}-${index}`}
                cx={point.x}
                cy={point.y}
                r={selectedFault === index ? 14 : 8}
                fill={backgroundColor}
                fillOpacity={0.86}
                stroke={selectedFault === index ? accentColor : faultColors[index]}
                strokeWidth={selectedFault === index ? 4 : 2.5}
              />
            ))}
          </Svg>

          {faultPoints.map((point, index) => (
            <Animated.View
              key={`fault-pulse-${index}`}
              pointerEvents="none"
              style={[
                styles.faultPulse,
                {
                  left: point.x - 15,
                  top: point.y - 15,
                  borderColor: faultColors[index],
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0.12] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.65] }) }]
                }
              ]}
            />
          ))}

          {faultPoints.map((point, index) => (
            <Pressable
              key={`fault-target-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Open diagnostic ${index + 1}`}
              onPress={() => onFaultSelect?.(index)}
              style={[styles.faultTarget, { left: point.x - 22, top: point.y - 22 }]}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    minHeight: 140,
    overflow: "hidden"
  },
  gl: {
    ...StyleSheet.absoluteFill
  },
  resetButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#252927",
    borderWidth: 1,
    borderColor: "#3a413d"
  },
  resetButtonPressed: {
    backgroundColor: "#343a36"
  },
  faultTarget: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 44
  },
  faultPulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 30,
    borderWidth: 3
  },
  fallback: {
    flex: 1,
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1b1d1c"
  },
  base: {
    width: 96,
    height: 24,
    borderRadius: 48,
    backgroundColor: "#3c4240",
    transform: [{ translateY: 78 }]
  },
  armOne: {
    width: 42,
    height: 150,
    borderRadius: 20,
    backgroundColor: "#6b7270",
    transform: [{ rotate: "27deg" }]
  },
  armTwo: {
    width: 34,
    height: 108,
    borderRadius: 18,
    backgroundColor: "#858d8a",
    transform: [{ translateX: 48 }, { translateY: -128 }, { rotate: "-42deg" }]
  },
  jointLarge: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 52,
    backgroundColor: "#4f5754",
    borderWidth: 8,
    borderColor: "#8b9591"
  },
  fallbackText: {
    color: "#9ea8a3",
    fontSize: 12,
    marginTop: 8
  }
});
