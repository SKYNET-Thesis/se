import { useEffect, useRef, useState } from 'react';
import type { JointState } from './twinTelemetry';
import { SO101_JOINTS, SO101_NAMES, SO101_URDF, resolveSo101Mesh, toUrdfRadians } from './so101Model';

export function So101DigitalTwinViewer({ frame, fresh, calibrated }: { frame: JointState | null; fresh: boolean; calibrated: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const drive = useRef<((frame: JointState | null, fresh: boolean) => void) | null>(null);
  const resetCamera = useRef<(() => void) | null>(null);
  const resetPose = useRef<(() => void) | null>(null);
  const latestInput = useRef({ frame, fresh, calibrated });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([
      import('three'), import('urdf-loader'), import('three/examples/jsm/loaders/STLLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ]).then(([THREE, { default: URDFLoader }, { STLLoader }, { OrbitControls }]) => {
      if (disposed) return;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x242a2d);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.005, 100);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 0.15;
      controls.maxDistance = 3;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667078, 2.1));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
      keyLight.position.set(0.4, -0.5, 1); scene.add(keyLight);
      const grid = new THREE.GridHelper(1.2, 24, 0x788286, 0x465053);
      grid.rotation.x = Math.PI / 2; grid.position.z = -0.006; scene.add(grid);
      const manager = new THREE.LoadingManager();
      const loader = new URDFLoader(manager);
      loader.packages = { so_arm_description: '/assets/so101' };
      loader.parseCollision = false;
      const meshErrors: string[] = [];
      loader.loadMeshCb = (path, loadingManager, material, done) => {
        let url: string;
        try { url = resolveSo101Mesh(path); }
        catch (reason) { const message = String(reason); meshErrors.push(message); done(null as never, new Error(message)); return; }
        new STLLoader(loadingManager).load(url, geometry => {
          if (disposed) { geometry.dispose(); return; }
          // Same LeLab geometry; white is a viewer material override of URDF's yellow 3d_printed material.
          const displayMaterial = material.name === '3d_printed'
            ? new THREE.MeshStandardMaterial({ color: 0xf2f2ed, roughness: 0.84 })
            : new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.6, metalness: 0.15 });
          done(new THREE.Mesh(geometry, displayMaterial));
        }, undefined, reason => { meshErrors.push(url); done(null as never, reason as Error); });
      };
      let robot: import('urdf-loader').URDFRobot | null = null;
      let frameId = 0;
      let target: Record<string, number> | null = null;
      let last = performance.now();
      let moving = false;
      const fitCamera = () => {
        if (!robot) return;
        const bounds = new THREE.Box3().setFromObject(robot);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.y, size.z, 0.2) * 2.2;
        camera.position.copy(center).add(new THREE.Vector3(1, -1.3, 0.8).normalize().multiplyScalar(distance));
        controls.target.copy(center); controls.update();
      };
      const resize = () => {
        const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
        camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      };
      const observer = new ResizeObserver(resize); observer.observe(container); resize();
      const render = (now: number) => {
        if (disposed) return;
        const dt = Math.min(50, now - last); last = now;
        if (robot && moving && target) {
          let pending = false;
          for (const name of SO101_NAMES) {
            const joint = robot.joints[SO101_JOINTS[name].urdf];
            const current = joint.jointValue[0] ?? 0;
            const next = current + (target[name] - current) * Math.min(1, dt / 90);
            robot.setJointValue(joint.urdfName, next);
            if (Math.abs(target[name] - next) > 0.0001) pending = true;
          }
          moving = pending;
        }
        controls.update(); renderer.render(scene, camera);
        frameId = requestAnimationFrame(render);
      };
      frameId = requestAnimationFrame(render);
      loader.load(SO101_URDF, loaded => {
        if (disposed) return;
        robot = loaded;
        for (const name of Object.keys(SO101_JOINTS) as (keyof typeof SO101_JOINTS)[]) {
          const spec = SO101_JOINTS[name]; const joint = robot.joints[spec.urdf];
          if (!joint || joint.jointType !== 'revolute' || !joint.axis.equals(new THREE.Vector3(...spec.axis)) ||
            Math.abs(joint.limit.lower - spec.lower) > 0.00001 || Math.abs(joint.limit.upper - spec.upper) > 0.00001) {
            setError(`URDF joint mismatch: ${spec.urdf}`); return;
          }
          robot.setJointValue(spec.urdf, 0);
        }
        scene.add(robot);
        manager.onLoad = () => { if (!disposed) { if (meshErrors.length) setError(`Missing SO-101 meshes: ${meshErrors.join(', ')}`); else { fitCamera(); setReady(true); drive.current?.(latestInput.current.frame, latestInput.current.fresh && latestInput.current.calibrated); } } };
      }, undefined, reason => { if (!disposed) setError(String(reason)); });
      drive.current = (nextFrame, isCurrent) => {
        if (!robot || !nextFrame || !isCurrent) { moving = false; return; }
        const values: Record<string, number> = {};
        for (const name of SO101_NAMES) {
          const reading = nextFrame.measured.find(item => item.name === name);
          if (!reading) { moving = false; return; }
          const value = toUrdfRadians(name, reading.position, reading.unit);
          if (value === null && name !== 'gripper') { moving = false; return; }
          // Percent has no calibrated Jaw transfer function. Keep the model's zero pose.
          values[name] = value ?? 0;
        }
        target = values; moving = true;
      };
      resetCamera.current = fitCamera;
      resetPose.current = () => { moving = false; target = null; if (robot) for (const spec of Object.values(SO101_JOINTS)) robot.setJointValue(spec.urdf, 0); };
      cleanup = () => {
        drive.current = null; resetCamera.current = null; resetPose.current = null;
        cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose();
        robot?.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()); } });
        renderer.dispose(); renderer.domElement.remove();
      };
    }).catch(reason => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => { latestInput.current = { frame, fresh, calibrated }; drive.current?.(frame, fresh && calibrated); }, [frame, fresh, calibrated]);

  return <div className="relative h-[380px] w-full overflow-hidden rounded-lg bg-[#242a2d] md:h-[480px]">
    <div ref={host} className="h-full w-full" aria-label="SO-101 so101_new_calib 3D digital twin" />
    {!ready && <p className="absolute left-4 top-4 rounded bg-black/60 px-3 py-2 text-xs text-white">{error ?? 'Loading SO-101 URDF and meshes…'}</p>}
    <div className="absolute bottom-4 right-4 flex gap-2">
      <button type="button" onClick={() => resetCamera.current?.()} className="rounded bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900">Reset camera</button>
      <button type="button" onClick={() => resetPose.current?.()} className="rounded bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900">Reset fixture pose</button>
    </div>
  </div>;
}
