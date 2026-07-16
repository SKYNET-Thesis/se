import { Asset } from "expo-asset";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl/build/GLView.types";
import { Renderer } from "expo-three";
import { RotateCcw } from "lucide-react-native";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle, Line, Polygon } from "react-native-svg";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const modelAsset = require("../../assets/models/arm.glb");

type Props = {
  compact?: boolean;
  showFaults?: boolean;
};

type Point = { x: number; y: number };

const faultInfo = [
  { label: "2 Warnings", detail: "Shoulder motor temperature is above the warning threshold.", color: "#e9ad37" },
  { label: "13 Warnings", detail: "Elbow joint torque is fluctuating outside the target range.", color: "#e9ad37" },
  { label: "6 Errors", detail: "Gripper position feedback is currently unavailable.", color: "#ef5b61" }
];

function distanceBetweenTouches(event: GestureResponderEvent) {
  const [first, second] = event.nativeEvent.touches;
  if (!first || !second) return 0;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function arrowHead(start: Point, end: Point) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 8;
  const spread = 0.55;
  const left = {
    x: end.x - size * Math.cos(angle - spread),
    y: end.y - size * Math.sin(angle - spread)
  };
  const right = {
    x: end.x - size * Math.cos(angle + spread),
    y: end.y - size * Math.sin(angle + spread)
  };
  return `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

export function ArmModelViewer({ compact = false, showFaults = !compact }: Props) {
  const frameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const anchorRefs = useRef<THREE.Vector3[]>([]);
  const layoutRef = useRef({ width: 0, height: 0 });
  const rotationRef = useRef({ x: -0.08, y: -0.45 });
  const gestureStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(compact ? 3.3 : 4.4);
  const pinchRef = useRef({ distance: 0, zoom: zoomRef.current });
  const [failed, setFailed] = useState(false);
  const [faultPoints, setFaultPoints] = useState<Point[]>([]);
  const [activeFault, setActiveFault] = useState<number | null>(null);

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
    rotationRef.current = { x: -0.08, y: -0.45 };
    zoomRef.current = compact ? 3.3 : 4.4;
    if (groupRef.current) {
      groupRef.current.rotation.set(rotationRef.current.x, rotationRef.current.y, 0);
    }
    if (cameraRef.current) cameraRef.current.position.z = zoomRef.current;
    projectFaults();
  }, [compact, projectFaults]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponder: (event, gesture) =>
          event.nativeEvent.touches.length === 2 ||
          (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
        onPanResponderGrant: (event) => {
          gestureStartRef.current = { ...rotationRef.current };
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
              zoomRef.current = Math.max(2.4, Math.min(6.2, nextZoom));
              camera.position.z = zoomRef.current;
            }
          } else if (group) {
            rotationRef.current = {
              x: Math.max(-0.65, Math.min(0.65, gestureStartRef.current.x + gesture.dy * 0.006)),
              y: gestureStartRef.current.y + gesture.dx * 0.009
            };
            group.rotation.set(rotationRef.current.x, rotationRef.current.y, 0);
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
        const renderer = new Renderer({ gl });
        renderer.setSize(width, height);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(compact ? "#141716" : "#1b1d1c");

        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0.85, 1.1, zoomRef.current);
        cameraRef.current = camera;

        const group = new THREE.Group();
        group.rotation.set(rotationRef.current.x, rotationRef.current.y, 0);
        groupRef.current = group;
        scene.add(group);

        const ambient = new THREE.AmbientLight(0xffffff, 1.25);
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(4, 5, 5);
        const rim = new THREE.DirectionalLight(0x65e0ff, 1.1);
        rim.position.set(-4, 2, -2);
        scene.add(ambient, key, rim);

        const floor = new THREE.Mesh(
          new THREE.CircleGeometry(compact ? 1.0 : 1.55, 48),
          new THREE.MeshStandardMaterial({ color: 0x2b302c, roughness: 0.82, metalness: 0.12 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.72;
        scene.add(floor);

        const asset = Asset.fromModule(modelAsset);
        await asset.downloadAsync();

        await new Promise<void>((resolve, reject) => {
          const loader = new GLTFLoader();
          loader.load(
            asset.localUri ?? asset.uri,
            (gltf: { scene: THREE.Object3D }) => {
              const model = gltf.scene;
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const scale = (compact ? 1.3 : 2.15) / Math.max(size.x, size.y, size.z);

              model.position.copy(center).multiplyScalar(-scale);
              model.scale.setScalar(scale);
              group.add(model);

              group.updateWorldMatrix(true, true);
              anchorRefs.current = ["shoulder_lift", "elbow_flex", "gripper_link"].map((name) => {
                const component = model.getObjectByName(name);
                if (!component) return new THREE.Vector3();
                return group.worldToLocal(component.getWorldPosition(new THREE.Vector3()));
              });

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
    [compact, projectFaults]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  if (failed) {
    return (
      <View style={styles.fallback}>
        <View style={styles.base} />
        <View style={styles.armOne} />
        <View style={styles.armTwo} />
        <View style={styles.jointLarge} />
        <Text style={styles.fallbackText}>3D model offline</Text>
      </View>
    );
  }

  const labelCenters = [
    { x: layoutRef.current.width * 0.2, y: layoutRef.current.height * 0.16 },
    { x: layoutRef.current.width * 0.79, y: layoutRef.current.height * 0.38 },
    { x: layoutRef.current.width * 0.8, y: layoutRef.current.height * 0.64 }
  ];

  return (
    <View style={styles.viewer} onLayout={onLayout} {...panResponder.panHandlers}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />

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

      {showFaults && faultPoints.length === faultInfo.length && (
        <>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            {faultInfo.map((fault, index) => (
              <Fragment key={fault.label}>
                <Line
                  x1={labelCenters[index].x}
                  y1={labelCenters[index].y}
                  x2={faultPoints[index].x}
                  y2={faultPoints[index].y}
                  stroke={fault.color}
                  strokeWidth={activeFault === index ? 3 : 2}
                />
                <Polygon
                  points={arrowHead(labelCenters[index], faultPoints[index])}
                  fill={fault.color}
                />
                <Circle cx={faultPoints[index].x} cy={faultPoints[index].y} r={5} fill={fault.color} />
                <Circle cx={faultPoints[index].x} cy={faultPoints[index].y} r={9} stroke={fault.color} strokeWidth={2} />
              </Fragment>
            ))}
          </Svg>

          {faultInfo.map((fault, index) => (
            <Pressable
              key={fault.label}
              accessibilityRole="button"
              accessibilityLabel={`${fault.label}. ${fault.detail}`}
              onPress={() => setActiveFault(activeFault === index ? null : index)}
              style={[
                styles.faultBadge,
                index === 0 && styles.faultTop,
                index === 1 && styles.faultMiddle,
                index === 2 && styles.faultBottom,
                { backgroundColor: fault.color },
                activeFault === index && styles.faultBadgeActive
              ]}
            >
              <Text style={styles.faultBadgeText}>{fault.label}</Text>
            </Pressable>
          ))}

          {activeFault !== null && (
            <View style={styles.faultDetail}>
              <View style={[styles.faultDetailDot, { backgroundColor: faultInfo[activeFault].color }]} />
              <Text numberOfLines={2} style={styles.faultDetailText}>
                {faultInfo[activeFault].detail}
              </Text>
            </View>
          )}
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
    ...StyleSheet.absoluteFillObject
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
  faultBadge: {
    position: "absolute",
    minHeight: 34,
    minWidth: 98,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent"
  },
  faultBadgeActive: {
    borderColor: "#ffffff"
  },
  faultTop: {
    top: "11%",
    left: "4%"
  },
  faultMiddle: {
    top: "33%",
    right: "4%"
  },
  faultBottom: {
    top: "59%",
    right: "3%"
  },
  faultBadgeText: {
    color: "#211607",
    fontSize: 12,
    fontWeight: "900"
  },
  faultDetail: {
    position: "absolute",
    left: 10,
    right: 48,
    bottom: 10,
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#252927ee",
    borderWidth: 1,
    borderColor: "#414843"
  },
  faultDetailDot: {
    width: 8,
    height: 8,
    borderRadius: 8
  },
  faultDetailText: {
    flex: 1,
    color: "#edf1ef",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700"
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
