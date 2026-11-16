import { useEffect, useRef, useState } from 'react';
import type { JointState } from './twinTelemetry';
import { SO101_JOINTS, SO101_NAMES, SO101_URDF, resolveSo101Mesh, toUrdfRadians } from './so101Model';
import { ARM_METADATA, type ArmIdentity, type CameraPreset, type ViewLayoutMode } from './types';
import { Camera, Compass, Grid, RefreshCw, Rotate3D } from 'lucide-react';

export interface So101DigitalTwinViewerProps {
  // Single-arm backward-compatible props
  frame?: JointState | null;
  fresh?: boolean;
  calibrated?: boolean;

  // Multi-arm workspace props
  frames?: Record<ArmIdentity, JointState | null>;
  activeArmId?: ArmIdentity;
  activePairId?: 'left_pair' | 'right_pair' | 'all_arms';
  layoutMode?: ViewLayoutMode;
  onSelectArm?: (armId: ArmIdentity) => void;
  className?: string;
}

interface RobotInstance {
  armId: string;
  robot: import('urdf-loader').URDFRobot;
  baseGroup: import('three').Group;
  baseRingMesh: import('three').Mesh;
  currentTargets: Record<string, number>;
}

// 3D Tabletop coordinate placement (meters, Z-up convention)
const ARM_POSITIONS: Record<ViewLayoutMode, Record<ArmIdentity, { x: number; y: number; z: number; yaw: number }>> = {
  single: {
    leader_left: { x: 0, y: 0, z: 0, yaw: 0 },
    follower_left: { x: 0, y: 0, z: 0, yaw: 0 },
    leader_right: { x: 0, y: 0, z: 0, yaw: 0 },
    follower_right: { x: 0, y: 0, z: 0, yaw: 0 },
  },
  pair: {
    leader_left: { x: -0.22, y: 0, z: 0, yaw: 0 },
    follower_left: { x: 0.22, y: 0, z: 0, yaw: 0 },
    leader_right: { x: -0.22, y: 0, z: 0, yaw: 0 },
    follower_right: { x: 0.22, y: 0, z: 0, yaw: 0 },
  },
  quad: {
    leader_left: { x: -0.25, y: -0.18, z: 0, yaw: 0 },
    follower_left: { x: -0.25, y: 0.18, z: 0, yaw: Math.PI },
    leader_right: { x: 0.25, y: -0.18, z: 0, yaw: 0 },
    follower_right: { x: 0.25, y: 0.18, z: 0, yaw: Math.PI },
  },
};

export function So101DigitalTwinViewer({
  frame,
  fresh = true,
  calibrated = true,
  frames,
  activeArmId = 'follower_left',
  activePairId = 'left_pair',
  layoutMode = 'single',
  onSelectArm,
  className = '',
}: So101DigitalTwinViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const isMultiArm = Boolean(frames);

  const resetCameraRef = useRef<(() => void) | null>(null);
  const setCameraPresetRef = useRef<((preset: CameraPreset) => void) | null>(null);
  const resetPoseRef = useRef<(() => void) | null>(null);
  const updateArmTargetsRef = useRef<((f: Record<string, JointState | null>) => void) | null>(null);
  const updateVisibilityRef = useRef<(() => void) | null>(null);

  // Keep latest input in ref
  const latestProps = useRef({
    frame,
    fresh,
    calibrated,
    frames,
    activeArmId,
    activePairId,
    layoutMode,
    isMultiArm,
  });

  useEffect(() => {
    latestProps.current = {
      frame,
      fresh,
      calibrated,
      frames,
      activeArmId,
      activePairId,
      layoutMode,
      isMultiArm,
    };

    if (frames) {
      updateArmTargetsRef.current?.(frames);
    } else if (frame) {
      updateArmTargetsRef.current?.({ single: frame });
    }
    updateVisibilityRef.current?.();
  }, [frame, fresh, calibrated, frames, activeArmId, activePairId, layoutMode, isMultiArm]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void Promise.all([
      import('three'),
      import('urdf-loader'),
      import('three/examples/jsm/loaders/STLLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ])
      .then(([THREE, { default: URDFLoader }, { STLLoader }, { OrbitControls }]) => {
        if (disposed) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1e22);

        const camera = new THREE.PerspectiveCamera(42, 1, 0.005, 100);
        camera.up.set(0, 0, 1);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 0.15;
        controls.maxDistance = 4.0;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x667078, 2.1));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
        keyLight.position.set(0.4, -0.5, 1.2);
        scene.add(keyLight);

        // Workbench table & grid
        const gridGroup = new THREE.Group();
        const grid = new THREE.GridHelper(1.4, 28, 0x0284c7, 0x475569);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = -0.006;
        gridGroup.add(grid);

        const tablePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9, metalness: 0.1 })
        );
        tablePlane.position.z = -0.007;
        gridGroup.add(tablePlane);
        scene.add(gridGroup);

        const axesHelper = new THREE.AxesHelper(0.12);
        axesHelper.position.set(-0.6, -0.45, 0.01);
        scene.add(axesHelper);

        const manager = new THREE.LoadingManager();
        const loader = new URDFLoader(manager);
        loader.packages = { so_arm_description: '/assets/so101' };
        loader.parseCollision = false;

        const meshCache = new Map<string, import('three').BufferGeometry>();
        const meshErrors: string[] = [];

        loader.loadMeshCb = (path, loadingManager, material, done) => {
          let url: string;
          try {
            url = resolveSo101Mesh(path);
          } catch (reason) {
            const message = String(reason);
            meshErrors.push(message);
            done(null as never, new Error(message));
            return;
          }

          const cached = meshCache.get(url);
          if (cached) {
            const displayMaterial =
              material.name === '3d_printed'
                ? new THREE.MeshStandardMaterial({ color: 0xf2f2ed, roughness: 0.84 })
                : new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.6, metalness: 0.15 });
            done(new THREE.Mesh(cached, displayMaterial));
            return;
          }

          new STLLoader(loadingManager).load(
            url,
            (geometry) => {
              if (disposed) {
                geometry.dispose();
                return;
              }
              meshCache.set(url, geometry);
              const displayMaterial =
                material.name === '3d_printed'
                  ? new THREE.MeshStandardMaterial({ color: 0xf2f2ed, roughness: 0.84 })
                  : new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.6, metalness: 0.15 });
              done(new THREE.Mesh(geometry, displayMaterial));
            },
            undefined,
            (reason) => {
              meshErrors.push(url);
              done(null as never, reason as Error);
            }
          );
        };

        const robotInstances = new Map<string, RobotInstance>();

        const fitCamera = () => {
          const { layoutMode, isMultiArm, activeArmId } = latestProps.current;
          let center = new THREE.Vector3(0, 0, 0.12);
          const dist = isMultiArm ? (layoutMode === 'quad' ? 1.4 : layoutMode === 'pair' ? 1.0 : 0.7) : 0.65;

          if (isMultiArm && layoutMode === 'single') {
            const pos = ARM_POSITIONS.single[activeArmId];
            center.set(pos.x, pos.y, 0.12);
          }

          camera.position.set(center.x + dist * 0.8, center.y - dist * 1.1, center.z + dist * 0.7);
          controls.target.copy(center);
          controls.update();
        };

        const setCameraPreset = (preset: CameraPreset) => {
          const { layoutMode, isMultiArm, activeArmId } = latestProps.current;
          let center = new THREE.Vector3(0, 0, 0.12);
          const dist = isMultiArm ? (layoutMode === 'quad' ? 1.4 : layoutMode === 'pair' ? 1.0 : 0.7) : 0.65;

          if (isMultiArm && layoutMode === 'single') {
            const pos = ARM_POSITIONS.single[activeArmId];
            center.set(pos.x, pos.y, 0.12);
          }

          switch (preset) {
            case 'isometric':
              camera.position.set(center.x + dist * 0.8, center.y - dist * 1.1, center.z + dist * 0.7);
              break;
            case 'top':
              camera.position.set(center.x, center.y, center.z + dist * 1.4);
              break;
            case 'front':
              camera.position.set(center.x, center.y - dist * 1.3, center.z + dist * 0.2);
              break;
            case 'side':
              camera.position.set(center.x + dist * 1.3, center.y, center.z + dist * 0.3);
              break;
          }
          controls.target.copy(center);
          controls.update();
        };

        resetCameraRef.current = fitCamera;
        setCameraPresetRef.current = setCameraPreset;

        const updateVisibility = () => {
          const { layoutMode, activeArmId, activePairId, isMultiArm } = latestProps.current;

          if (!isMultiArm) {
            const inst = robotInstances.get('single');
            if (inst) inst.baseGroup.visible = true;
            return;
          }

          const positions = ARM_POSITIONS[layoutMode];
          robotInstances.forEach((inst, id) => {
            if (id === 'single') {
              inst.baseGroup.visible = false;
              return;
            }

            const armId = id as ArmIdentity;
            let isVisible = false;
            if (layoutMode === 'single') {
              isVisible = armId === activeArmId;
            } else if (layoutMode === 'pair') {
              if (activePairId === 'left_pair') {
                isVisible = armId === 'leader_left' || armId === 'follower_left';
              } else if (activePairId === 'right_pair') {
                isVisible = armId === 'leader_right' || armId === 'follower_right';
              } else {
                isVisible = true;
              }
            } else {
              isVisible = true;
            }

            inst.baseGroup.visible = isVisible;
            if (isVisible) {
              const cfg = positions[armId];
              inst.baseGroup.position.set(cfg.x, cfg.y, cfg.z);
              inst.baseGroup.rotation.z = cfg.yaw;

              const isActive = armId === activeArmId;
              const ringMat = inst.baseRingMesh.material as import('three').MeshBasicMaterial;
              ringMat.opacity = isActive ? 1.0 : 0.45;
              inst.baseRingMesh.scale.setScalar(isActive ? 1.1 : 1.0);
            }
          });
        };
        updateVisibilityRef.current = updateVisibility;

        const updateArmTargets = (incomingFrames: Record<string, JointState | null>) => {
          robotInstances.forEach((inst, id) => {
            const targetFrame = incomingFrames[id] ?? (id === 'single' ? incomingFrames.single : null);
            if (!targetFrame) return;

            const values: Record<string, number> = {};
            for (const name of SO101_NAMES) {
              const reading = (
                targetFrame.source_mode === 'LIVE_PHYSICAL' ? targetFrame.calibrated : targetFrame.measured
              )?.find((item) => item.name === name);
              if (!reading) continue;
              const val = toUrdfRadians(name, reading.position, reading.unit);
              if (val !== null) values[name] = val;
            }
            inst.currentTargets = values;
          });
        };
        updateArmTargetsRef.current = updateArmTargets;

        // Fetch URDF Text and instantiate
        fetch(SO101_URDF)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${SO101_URDF}`);
            return res.text();
          })
          .then((urdfText) => {
            if (disposed) return;

            // Arms to instantiate: 'single' plus the 4 table arms
            const armList: { id: string; color: string }[] = [
              { id: 'single', color: '#0284c7' },
              { id: 'leader_left', color: ARM_METADATA.leader_left.colorHex },
              { id: 'follower_left', color: ARM_METADATA.follower_left.colorHex },
              { id: 'leader_right', color: ARM_METADATA.leader_right.colorHex },
              { id: 'follower_right', color: ARM_METADATA.follower_right.colorHex },
            ];

            for (const item of armList) {
              const robot = loader.parse(urdfText);

              // Verify joint specs
              for (const name of Object.keys(SO101_JOINTS) as (keyof typeof SO101_JOINTS)[]) {
                const spec = SO101_JOINTS[name];
                const joint = robot.joints[spec.urdf];
                if (
                  !joint ||
                  joint.jointType !== 'revolute' ||
                  !joint.axis.equals(new THREE.Vector3(...spec.axis)) ||
                  Math.abs(joint.limit.lower - spec.lower) > 0.00001 ||
                  Math.abs(joint.limit.upper - spec.upper) > 0.00001
                ) {
                  setError(`URDF joint mismatch: ${spec.urdf}`);
                  return;
                }
                robot.setJointValue(spec.urdf, 0);
              }

              const baseGroup = new THREE.Group();
              const ringGeo = new THREE.RingGeometry(0.065, 0.08, 32);
              const ringMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(item.color),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
              });
              const ringMesh = new THREE.Mesh(ringGeo, ringMat);
              ringMesh.position.z = 0.001;
              baseGroup.add(ringMesh);

              baseGroup.add(robot);
              scene.add(baseGroup);

              robotInstances.set(item.id, {
                armId: item.id,
                robot,
                baseGroup,
                baseRingMesh: ringMesh,
                currentTargets: {},
              });
            }

            manager.onLoad = () => {
              if (disposed) return;
              if (meshErrors.length) {
                setError(`Missing SO-101 meshes: ${meshErrors.join(', ')}`);
              } else {
                fitCamera();
                setReady(true);
                updateVisibility();
                if (latestProps.current.frames) {
                  updateArmTargets(latestProps.current.frames);
                } else if (latestProps.current.frame) {
                  updateArmTargets({ single: latestProps.current.frame });
                }
              }
            };
          })
          .catch((reason) => {
            if (!disposed) setError(String(reason));
          });

        let frameId = 0;
        let last = performance.now();

        const render = (now: number) => {
          if (disposed) return;
          const dt = Math.min(50, now - last);
          last = now;

          robotInstances.forEach((inst) => {
            if (!inst.baseGroup.visible) return;
            const target = inst.currentTargets;

            for (const name of SO101_NAMES) {
              const targetVal = target[name];
              if (targetVal === undefined) continue;

              const joint = inst.robot.joints[SO101_JOINTS[name].urdf];
              if (!joint) continue;
              const current = joint.jointValue[0] ?? 0;
              const next = current + (targetVal - current) * Math.min(1, dt / 90);
              inst.robot.setJointValue(joint.urdfName, next);
            }
          });

          gridGroup.visible = showGrid;
          axesHelper.visible = showAxes;
          controls.autoRotate = autoRotate;
          controls.autoRotateSpeed = 1.5;

          controls.update();
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(render);
        };
        frameId = requestAnimationFrame(render);

        const resize = () => {
          const width = Math.max(1, container.clientWidth);
          const height = Math.max(1, container.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };

        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        resetPoseRef.current = () => {
          robotInstances.forEach((inst) => {
            inst.currentTargets = {};
            for (const spec of Object.values(SO101_JOINTS)) {
              inst.robot.setJointValue(spec.urdf, 0);
            }
          });
        };

        cleanup = () => {
          cancelAnimationFrame(frameId);
          observer.disconnect();
          controls.dispose();

          robotInstances.forEach((inst) => {
            inst.robot.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => m.dispose());
              }
            });
            inst.baseRingMesh.geometry.dispose();
            (inst.baseRingMesh.material as import('three').Material).dispose();
          });

          meshCache.forEach((geom) => geom.dispose());
          meshCache.clear();

          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason));
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      className={`relative h-[380px] w-full overflow-hidden rounded-xl border border-slate-700 bg-[#1a1e22] md:h-[480px] lg:h-[540px] ${className}`}
    >
      <div ref={host} className="h-full w-full cursor-grab active:cursor-grabbing" aria-label="SO-101 3D digital twin" />

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1e22]/90 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          <p className="mt-3 text-xs font-medium text-slate-300">{error ?? 'Loading SO-101 URDF and meshes…'}</p>
        </div>
      )}

      {/* Top Left: Controls & Overlays */}
      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-900/80 p-1.5 backdrop-blur-md border border-slate-700/60 shadow-lg">
        <button
          type="button"
          onClick={() => setShowGrid((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium transition-colors ${
            showGrid ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Workbench Grid"
        >
          <Grid className="h-3 w-3" />
          <span>Grid</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAxes((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium transition-colors ${
            showAxes ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Coordinate Gizmo"
        >
          <Compass className="h-3 w-3" />
          <span>Axes</span>
        </button>
        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium transition-colors ${
            autoRotate ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Auto Rotation"
        >
          <Rotate3D className="h-3 w-3" />
          <span>Rotate</span>
        </button>
      </div>

      {/* Top Right: Camera Presets */}
      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-lg bg-slate-900/80 p-1 backdrop-blur-md border border-slate-700/60 shadow-lg">
        <span className="px-2 text-2xs font-semibold uppercase tracking-wider text-slate-400">View</span>
        {(['isometric', 'top', 'front', 'side'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setCameraPresetRef.current?.(preset)}
            className="rounded px-2 py-1 text-2xs font-medium capitalize text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Bottom Right: Reset Buttons */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => resetCameraRef.current?.()}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-2xs font-medium text-slate-200 backdrop-blur-md border border-slate-700/60 hover:bg-slate-800 hover:text-white transition-colors shadow-md"
        >
          <Camera className="h-3 w-3" />
          <span>Reset camera</span>
        </button>
        <button
          type="button"
          onClick={() => resetPoseRef.current?.()}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-2xs font-medium text-slate-200 backdrop-blur-md border border-slate-700/60 hover:bg-slate-800 hover:text-white transition-colors shadow-md"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Reset fixture pose</span>
        </button>
      </div>

      {/* Bottom Left: Arm Legends & Quick Selection (if multi-arm) */}
      {isMultiArm && (
        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
          {(layoutMode === 'single'
            ? [activeArmId]
            : layoutMode === 'pair'
            ? activePairId === 'left_pair'
              ? (['leader_left', 'follower_left'] as const)
              : (['leader_right', 'follower_right'] as const)
            : (['leader_left', 'follower_left', 'leader_right', 'follower_right'] as const)
          ).map((id) => {
            const meta = ARM_METADATA[id];
            const isSelected = id === activeArmId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectArm?.(id)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-md transition-all shadow-md ${
                  isSelected
                    ? 'bg-slate-900 text-white border-2 border-white/80'
                    : 'bg-slate-900/80 text-slate-300 border border-slate-700 hover:bg-slate-800'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/20" style={{ backgroundColor: meta.colorHex }} />
                <span>{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
