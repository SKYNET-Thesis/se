import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { JAW } from './jaw';
import { StlWorkerClient } from './stlWorkerClient';

/**
 * Home Lab 3D stage: the SO-101 from the repository URDF, lit like a product shot.
 * DEV prototype only: the hardware design licence of the derived model is unresolved (manifest R01),
 * so nothing built on this scene may ship publicly until that is settled.
 *
 * It renders on demand: frames are drawn only while the camera, a joint, a light or the highlight is
 * still easing towards its target, and never while the canvas is off screen or the tab is hidden.
 * It drives a visual preview only and never talks to a robot.
 */
export type JointName = 'Rotation' | 'Pitch' | 'Elbow' | 'Wrist_Pitch' | 'Wrist_Roll' | 'Jaw';
export type Pose = Partial<Record<JointName, number>>;

/** Camera on a sphere around a target point (robot height is normalised to 1 unit). */
export interface CameraRig {
  azimuth: number; elevation: number; distance: number; targetY: number; fov: number; targetX?: number; targetZ?: number;
  /** Lens shift as a fraction of the canvas: moves the subject right (+x) or down (+y) without turning the camera. */
  shiftX?: number; shiftY?: number;
}

export interface SceneOptions {
  transparent?: boolean;
  background?: number;
  /** Draws the 600 × 400 mm learning stage under the arm (TABLE in kinematics.ts). */
  stage?: boolean;
  reducedMotion?: boolean;
  lowPower?: boolean;
  /** V2: parse STL meshes in a Web Worker so the main thread stays responsive while the arm loads. */
  worker?: boolean;
  /** V2: compile shaders asynchronously before the first frame instead of blocking on first render. */
  precompile?: boolean;
  /** V2: the stage can fade in and out (its materials become transparent). Off for the H6.1 lab. */
  stageFade?: boolean;
  /**
   * V2: build the studio reflections in a worker (OffscreenCanvas). Same result as the in-page PMREM,
   * without its ≈0.7 s shader-compile task on the main thread. Falls back to the in-page path on error.
   */
  envWorker?: boolean;
  /** Tone-mapping exposure (default 1.3, the H6.1 look). */
  exposure?: number;
}

/** A point in the lesson-only learning frame, in millimetres: origin at the stage's front-left corner. */
export interface StagePoint { x: number; y: number; z: number }
export type StageAxis = 'x' | 'y' | 'z';

export { JAW };
/** A ready pose inside the URDF limits: elbow bent, gripper forward and open. */
export const REST_POSE: Pose = { Rotation: 0.4, Pitch: -0.6, Elbow: 1.0, Wrist_Pitch: 0.6, Wrist_Roll: 0, Jaw: JAW.open };

const JOINTS: JointName[] = ['Rotation', 'Pitch', 'Elbow', 'Wrist_Pitch', 'Wrist_Roll', 'Jaw'];

interface Animated { current: number; target: number }

export class RobotScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  private robot: (THREE.Object3D & { setJointValue: (n: string, v: number) => void; joints: Record<string, THREE.Object3D> }) | null = null;
  private pivot = new THREE.Group();
  private printed: THREE.MeshStandardMaterial;
  private servo: THREE.MeshStandardMaterial;
  private key: THREE.SpotLight;
  private rim: THREE.DirectionalLight;
  private fill: THREE.HemisphereLight;
  private rig: Record<keyof CameraRig, Animated>;
  private joints = Object.fromEntries(JOINTS.map((j) => [j, { current: REST_POSE[j] ?? 0, target: REST_POSE[j] ?? 0 }])) as Record<JointName, Animated>;
  private light: Animated = { current: 1, target: 1 };
  private glow: Animated = { current: 0, target: 0 };
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private raf = 0;
  private last = 0;
  private visible = true;
  private disposed = false;
  private observer: IntersectionObserver | null = null;
  private onFrameCbs = new Set<() => void>();
  private opts: Required<SceneOptions>;
  private active = true;
  private stageGroup: THREE.Group | null = null;
  private stageMaterials: Array<THREE.Material & { opacity: number }> = [];
  private stageBase: number[] = [];
  private stageLevel: Animated = { current: 1, target: 1 };
  private overlay: THREE.Group | null = null;
  private overlayParts: Record<'x' | 'y' | 'z' | 'axes' | 'target', THREE.Material & { opacity: number }> | null = null;
  private overlayLevel: Animated = { current: 0, target: 0 };
  private focusAxis: StageAxis | null = null;
  private meshWorker = new StlWorkerClient();
  private envReady: Promise<void> = Promise.resolve();
  private cancelEnvironment: (() => void) | null = null;
  private cancelLoad: (() => void) | null = null;
  private meshCache = new Map<string, Promise<THREE.BufferGeometry>>();
  /** Frame timing samples (ms), read by the browser QA script. */
  readonly frameTimes: number[] = [];

  constructor(canvas: HTMLCanvasElement, rig: CameraRig, options: SceneOptions = {}) {
    this.canvas = canvas;
    this.opts = { transparent: false, background: 0x0b0e10, stage: false, reducedMotion: false, lowPower: false, worker: false, precompile: false, stageFade: false, envWorker: false, exposure: 1.3, ...options };
    // Timings of each construction step (cheap; readable in the Performance panel and by the QA scripts).
    performance.mark('so101:construct');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.opts.lowPower, alpha: this.opts.transparent, powerPreference: 'high-performance' });
    performance.measure('so101:renderer', 'so101:construct');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.opts.lowPower ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.opts.exposure;
    this.renderer.shadowMap.enabled = !this.opts.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (!this.opts.transparent) {
      this.scene.background = new THREE.Color(this.opts.background);
      this.scene.fog = new THREE.Fog(this.opts.background, 3.2, 7.5);
    }
    this.scene.environmentIntensity = 0.32;
    if (this.opts.envWorker && typeof OffscreenCanvas !== 'undefined') this.envReady = this.environmentFromWorker();
    else this.buildEnvironmentHere();

    this.printed = new THREE.MeshStandardMaterial({ color: 0x4a4d50, metalness: 0.18, roughness: 0.5, emissive: 0x3fd1bc, emissiveIntensity: 0 });
    this.servo = new THREE.MeshStandardMaterial({ color: 0x121517, metalness: 0.45, roughness: 0.38, emissive: 0x3fd1bc, emissiveIntensity: 0 });

    // Product lighting: a warm-white key from the front left, a cool teal rim from behind, a low fill.
    this.key = new THREE.SpotLight(0xfff4e8, 52, 10, Math.PI / 5.5, 0.6, 1.5);
    this.key.position.set(-2.2, 3.2, 2.6);
    this.key.castShadow = !this.opts.lowPower;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0004;
    this.rim = new THREE.DirectionalLight(0xa6e9e0, 1.4);
    this.rim.position.set(2.4, 1.8, -2.6);
    this.fill = new THREE.HemisphereLight(0x9fb3b0, 0x050607, 0.35);
    this.scene.add(this.key, this.key.target, this.rim, this.fill, this.pivot);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64),
      this.opts.transparent ? new THREE.ShadowMaterial({ opacity: 0.45 }) : new THREE.MeshStandardMaterial({ color: this.opts.background, roughness: 0.92, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    if (this.opts.stage) { this.stageGroup = this.buildStage(); this.scene.add(this.stageGroup); }

    this.rig = Object.fromEntries(Object.entries({ targetX: 0, targetZ: 0, shiftX: 0, shiftY: 0, ...rig }).map(([k, v]) => [k, { current: v as number, target: v as number }])) as Record<keyof CameraRig, Animated>;

    this.observer = new IntersectionObserver(([entry]) => { this.visible = !!entry?.isIntersecting; if (this.visible) this.kick(); }, { threshold: 0 });
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.kick);
    this.resize();
    performance.measure('so101:construct-total', 'so101:construct');
  }

  /** The real learning stage, 600 × 400 mm, scaled with the arm (arm height ≈ 1 unit ≈ 420 mm). */
  private buildStage(): THREE.Group {
    const mm = 1 / 420;
    const group = new THREE.Group();
    const w = 600 * mm, d = 400 * mm;
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x15201d, roughness: 0.8, metalness: 0.05, transparent: this.opts.stageFade });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d), plateMaterial);
    plate.rotation.x = -Math.PI / 2; plate.position.y = 0.001; plate.receiveShadow = true;
    group.add(plate);
    const lines: number[] = [];
    for (let x = 0; x <= 600; x += 50) lines.push((x - 300) * mm, 0.002, -d / 2, (x - 300) * mm, 0.002, d / 2);
    for (let y = 0; y <= 400; y += 50) lines.push(-w / 2, 0.002, (y - 200) * mm, w / 2, 0.002, (y - 200) * mm);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x3fd1bc, transparent: true, opacity: 0.16 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x3fd1bc, transparent: true, opacity: 0.55 });
    group.add(new THREE.LineSegments(geometry, gridMaterial));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.0001, d)), edgeMaterial);
    edge.position.y = 0.003;
    group.add(edge);
    // The arm stands at the front edge, centred, as in the classroom set-up.
    group.position.z = -d / 2 + 0.06;
    if (this.opts.stageFade) {
      this.stageMaterials = [plateMaterial, gridMaterial, edgeMaterial];
      this.stageBase = [1, 0.16, 0.55];
    }
    return group;
  }

  load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('The preview scene was disposed.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = new AbortController();
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelLoad = null;
        this.meshWorker.dispose();
        if (error) { request.abort(); this.cancelEnvironment?.(); reject(error); } else resolve();
      };
      // Also bound URDF fetching, reflections and shader compilation, not just individual meshes.
      const timeout = setTimeout(() => finish(new Error('The 3D preview load timed out.')), 45_000);
      this.cancelLoad = () => finish(new Error('The preview scene was disposed.'));
      const manager = new THREE.LoadingManager();
      const loader = new URDFLoader(manager);
      loader.fetchOptions = { ...loader.fetchOptions, signal: request.signal };
      const stl = new STLLoader(manager);
      // Five URDF visuals share one servo mesh: each file is fetched, parsed and uploaded once.
      const geometryFor = (file: string): Promise<THREE.BufferGeometry> => {
        let pending = this.meshCache.get(file);
        if (!pending) {
          const url = `/assets/so101/meshes/${file}`;
          pending = this.opts.worker ? this.parseInWorker(url) : new Promise((resolve, reject) => stl.load(url, (g) => { g.computeVertexNormals(); resolve(g); }, undefined, reject));
          this.meshCache.set(file, pending);
        }
        return pending;
      };
      // A mesh that fails to load must fail the scene. Worker-parsed meshes never pass through the
      // manager's own loaders, so `manager.onError` alone would miss them and `onLoad` would report an
      // arm with missing parts as ready (H6.9 release blocker: false-ready, empty stage).
      let failed: string | null = null;
      loader.loadMeshCb = (path, _manager, material, done) => {
        const file = path.split('/').pop() ?? '';
        // Track each visual on the manager so `onLoad` waits for shared (cached) meshes too.
        const token = `mesh:${file}:${Math.random()}`;
        manager.itemStart(token);
        geometryFor(file).then((geometry) => {
          if (settled || this.disposed) { done(new THREE.Group(), new Error('The preview load was cancelled.')); return; }
          const mesh = new THREE.Mesh(geometry, material.name === 'sts3215' || file.startsWith('sts3215') ? this.servo : this.printed);
          mesh.castShadow = true; mesh.receiveShadow = true;
          done(mesh);
        }).catch((err) => { failed ??= file; const error = err instanceof Error ? err : new Error(`Could not load ${file}`); done(new THREE.Group(), error); finish(error); })
          .finally(() => manager.itemEnd(token));
      };
      let robot: RobotScene['robot'] = null;
      manager.onLoad = () => {
        if (settled || this.disposed) return;
        if (failed) { finish(new Error(`Could not load ${failed}`)); return; }
        if (!robot) return;
        // urdf-loader applies the URDF <material> after loading, so map by its name: servos vs printed parts.
        robot.traverse((node) => {
          if (node instanceof THREE.Mesh) node.material = (node.material as THREE.Material).name === 'sts3215' || node.material === this.servo ? this.servo : this.printed;
        });
        this.robot = robot;
        robot.rotation.x = -Math.PI / 2;
        this.pivot.add(robot);
        this.applyJoints();
        const box = new THREE.Box3().setFromObject(this.pivot);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1 / Math.max(size.y, 0.001);
        this.pivot.scale.setScalar(scale);
        const scaled = new THREE.Box3().setFromObject(this.pivot);
        const center = scaled.getCenter(new THREE.Vector3());
        this.pivot.position.set(-center.x, -scaled.min.y, -center.z);
        this.key.target.position.set(0, 0.45, 0);
        this.meshWorker.dispose();
        if (this.opts.precompile) {
          // Wait for the reflections first, so the materials compile once, with their environment map.
          this.envReady.then(() => { if (!settled) return this.renderer.compileAsync(this.scene, this.camera); }).catch(() => undefined).then(() => { if (!settled) { this.kick(); finish(); } });
        } else {
          this.kick();
          finish();
        }
      };
      manager.onError = (url) => finish(new Error(`Could not load ${url}`));
      try {
        loader.load('/assets/so101/urdf/so101_new_calib.urdf', (result) => { robot = result as RobotScene['robot']; }, undefined, (err) => finish(err instanceof Error ? err : new Error('URDF failed to load')));
      } catch (error) { finish(error instanceof Error ? error : new Error('URDF failed to load')); }
    });
  }

  /** Update a live preview without reloading its model or WebGL context. */
  setReducedMotion(reduced: boolean) {
    this.opts.reducedMotion = reduced;
    if (reduced) {
      for (const value of [...Object.values(this.rig), ...Object.values(this.joints), this.light, this.glow, this.stageLevel, this.overlayLevel]) value.current = value.target;
      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    }
    this.kick();
  }

  /** Eases the named joints to new values (instantly with reduced motion). */
  setPose(pose: Pose) {
    for (const [name, value] of Object.entries(pose) as Array<[JointName, number]>) {
      this.joints[name].target = value;
      if (this.opts.reducedMotion) this.joints[name].current = value;
    }
    this.kick();
  }

  setRig(rig: Partial<CameraRig>, instant = false) {
    for (const [k, v] of Object.entries(rig) as Array<[keyof CameraRig, number]>) {
      this.rig[k].target = v;
      if (instant || this.opts.reducedMotion) this.rig[k].current = v;
    }
    this.kick();
  }

  /** Key-light level, 0 (dark) to 1 (lit). Used for the entrance. */
  setLight(level: number, instant = false) { this.light.target = level; if (instant || this.opts.reducedMotion) this.light.current = level; this.kick(); }

  /** Teal edge glow on the arm while a step addresses it (e.g. "use left arm"). */
  setGlow(level: number) { this.glow.target = level; if (this.opts.reducedMotion) this.glow.current = level; this.kick(); }

  /** Pointer in −1…1; adds a small, damped orbit for depth. Ignored with reduced motion or low power. */
  setPointer(x: number, y: number) {
    if (this.opts.reducedMotion || this.opts.lowPower) return;
    this.pointer.tx = x; this.pointer.ty = y; this.kick();
  }

  private buildEnvironmentHere() {
    performance.mark('so101:pmrem');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    performance.measure('so101:environment', 'so101:pmrem');
  }

  private environmentFromWorker(): Promise<void> {
    performance.mark('so101:env-worker');
    return new Promise((resolve) => {
      let worker: Worker | null = null;
      let settled = false;
      const finish = (fallback: boolean) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); this.cancelEnvironment = null;
        if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
        if (fallback && !this.disposed) {
          // Reflections are optional: retain direct lighting if both environment paths fail.
          try { this.buildEnvironmentHere(); } catch { /* The scene still has its key, rim and fill. */ }
        }
        resolve();
      };
      const timeout = setTimeout(() => finish(true), 10_000);
      this.cancelEnvironment = () => finish(false);
      try {
        worker = new Worker(new URL('./envWorker.ts', import.meta.url), { type: 'module' });
        worker.onerror = (event) => { event.preventDefault(); finish(true); };
        worker.onmessageerror = () => finish(true);
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const result = event.data;
          if (!result || typeof result !== 'object' || !('width' in result) || !('height' in result) || !('data' in result) ||
              typeof result.width !== 'number' || typeof result.height !== 'number' || result.width <= 0 || result.height <= 0 ||
              !(result.data instanceof Uint16Array) || result.data.length !== result.width * result.height * 4) { finish(true); return; }
          if (this.disposed) { finish(false); return; }
          try {
            const texture = new THREE.DataTexture(result.data, result.width, result.height, THREE.RGBAFormat, THREE.HalfFloatType);
            texture.mapping = THREE.CubeUVReflectionMapping as THREE.Mapping;
            texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false; texture.colorSpace = THREE.LinearSRGBColorSpace;
            texture.needsUpdate = true;
            this.scene.environment = texture;
            performance.measure('so101:environment-worker', 'so101:env-worker');
            this.kick(); finish(false);
          } catch { finish(true); }
        };
        worker.postMessage({ sigma: 0.04 });
      } catch { finish(true); }
    });
  }

  private parseInWorker(url: string): Promise<THREE.BufferGeometry> {
    return this.meshWorker.parse(url).then(({ position, normal }) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      if (normal) geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      else geometry.computeVertexNormals();
      return geometry;
    });
  }

  /** Stops (false) or resumes (true) rendering, e.g. while the canvas is covered by other content. */
  setActive(active: boolean) { this.active = active; if (active) this.kick(); }

  /** Fades the learning stage in (1) or out (0). Needs `stageFade`. */
  setStageVisible(level: number, instant = false) {
    this.stageLevel.target = level;
    if (instant || this.opts.reducedMotion) this.stageLevel.current = level;
    this.kick();
  }

  /** World position of a point in the learning frame (mm; origin front-left corner, y into the stage, z up). */
  stageToWorld(p: StagePoint): { x: number; y: number; z: number } {
    const mm = 1 / 420; const w = 600 * mm; const d = 400 * mm;
    const gz = this.stageGroup?.position.z ?? -d / 2 + 0.06;
    return { x: p.x * mm - w / 2, y: p.z * mm, z: gz + d / 2 - p.y * mm };
  }

  /** Screen position (px) of a learning-frame point, for HTML labels on the stage. */
  projectStage(p: StagePoint): { x: number; y: number } {
    const w = this.stageToWorld(p);
    const v = new THREE.Vector3(w.x, w.y, w.z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight };
  }

  /**
   * Shows the learning-frame overlay: the three axes from the origin, a target marker and the guides
   * that measure it along x, then y, then up z. `focus` brings one guide forward.
   */
  setTargetOverlay(target: StagePoint, level: number, focus: StageAxis | null = null) {
    if (!this.overlay) this.buildOverlay(target);
    this.overlayLevel.target = level;
    if (this.opts.reducedMotion) this.overlayLevel.current = level;
    this.focusAxis = focus;
    this.kick();
  }

  private buildOverlay(target: StagePoint) {
    const group = new THREE.Group();
    const at = (p: StagePoint) => { const w = this.stageToWorld(p); return new THREE.Vector3(w.x, w.y, w.z); };
    const line = (points: StagePoint[], color: number, dashed = false) => {
      const material = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0, dashSize: 0.025, gapSize: 0.018 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 });
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map(at));
      const object = new THREE.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      group.add(object);
      return material;
    };
    const lift = 3;
    const axes = new THREE.LineBasicMaterial({ color: 0xc6cfcc, transparent: true, opacity: 0 });
    for (const end of [{ x: 640, y: 0, z: lift }, { x: 0, y: 430, z: lift }, { x: 0, y: 0, z: 200 }]) {
      const geometry = new THREE.BufferGeometry().setFromPoints([at({ x: 0, y: 0, z: lift }), at(end)]);
      group.add(new THREE.Line(geometry, axes));
    }
    const x = line([{ x: 0, y: 0, z: lift }, { x: target.x, y: 0, z: lift }], 0x3fd1bc, true);
    const y = line([{ x: target.x, y: 0, z: lift }, { x: target.x, y: target.y, z: lift }], 0x3fd1bc, true);
    const z = line([{ x: target.x, y: target.y, z: lift }, target], 0x3fd1bc, true);
    const marker = new THREE.MeshStandardMaterial({ color: 0xeef2f0, emissive: 0x3fd1bc, emissiveIntensity: 0.6, transparent: true, opacity: 0 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), marker);
    sphere.position.copy(at(target));
    group.add(sphere);
    this.overlay = group;
    this.overlayParts = { x, y, z, axes, target: marker };
    this.scene.add(group);
  }

  /** World position of a joint (robot height = 1), e.g. to aim the camera at the gripper. */
  jointWorld(name: JointName): { x: number; y: number; z: number } | null {
    const joint = this.robot?.joints[name];
    if (!joint) return null;
    this.pivot.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Screen position (px, relative to the canvas) of a joint, for engineering labels. */
  project(name: JointName): { x: number; y: number; visible: boolean } | null {
    const joint = this.robot?.joints[name];
    if (!joint) return null;
    const p = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld).project(this.camera);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 };
  }

  onFrame(fn: () => void): () => void { this.onFrameCbs.add(fn); return () => { this.onFrameCbs.delete(fn); }; }

  resize = () => {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kick();
  };

  private applyJoints() { for (const name of JOINTS) this.robot?.setJointValue(name, this.joints[name].current); }

  private kick = () => {
    if (this.disposed || this.raf || !this.visible || !this.active || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  };

  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.frameTimes.push(now - this.last);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.last = now;
    let moving = false;
    const ease = (a: Animated, rate: number) => {
      const d = a.target - a.current;
      if (Math.abs(d) < 1e-4) { a.current = a.target; return; }
      a.current += d * (1 - Math.exp(-rate * dt)); moving = true;
    };
    for (const a of Object.values(this.rig)) ease(a, 3.2);
    for (const a of Object.values(this.joints)) ease(a, 7);
    ease(this.light, 2.2); ease(this.glow, 6);
    ease(this.stageLevel, 3); ease(this.overlayLevel, 3.5);
    const p = this.pointer;
    for (const k of ['x', 'y'] as const) {
      const t = k === 'x' ? p.tx : p.ty;
      const d = t - p[k];
      if (Math.abs(d) > 1e-4) { p[k] += d * (1 - Math.exp(-4 * dt)); moving = true; } else p[k] = t;
    }

    const r = this.rig;
    const az = r.azimuth.current + p.x * 0.12, el = r.elevation.current - p.y * 0.05;
    const target = new THREE.Vector3(r.targetX.current, r.targetY.current, r.targetZ.current);
    this.camera.position.set(
      target.x + r.distance.current * Math.cos(el) * Math.sin(az),
      target.y + r.distance.current * Math.sin(el),
      target.z + r.distance.current * Math.cos(el) * Math.cos(az),
    );
    this.camera.fov = r.fov.current;
    const { clientWidth: cw, clientHeight: ch } = this.canvas;
    if (cw && ch) this.camera.setViewOffset(cw, ch, -r.shiftX.current * cw, -r.shiftY.current * ch, cw, ch);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.key.intensity = 52 * this.light.current;
    // The highlight reads as a lighting cue: the teal rim brightens, the parts only faintly glow.
    this.rim.intensity = 1.4 * (0.35 + 0.65 * this.light.current) * (1 + 1.6 * this.glow.current);
    this.scene.environmentIntensity = 0.32 * (0.25 + 0.75 * this.light.current);
    this.printed.emissiveIntensity = this.servo.emissiveIntensity = 0.05 * this.glow.current;
    this.applyJoints();
    this.stageMaterials.forEach((m, i) => { m.opacity = this.stageBase[i] * this.stageLevel.current; m.visible = this.stageLevel.current > 0.01; });
    if (this.overlayParts && this.overlay) {
      const o = this.overlayLevel.current; const f = this.focusAxis;
      this.overlay.visible = o > 0.01;
      for (const axis of ['x', 'y', 'z'] as const) this.overlayParts[axis].opacity = o * (f === null ? 0.85 : f === axis ? 1 : 0.22);
      this.overlayParts.axes.opacity = o * 0.5;
      this.overlayParts.target.opacity = o;
    }
    this.renderer.render(this.scene, this.camera);
    for (const fn of this.onFrameCbs) fn();
    if (moving) this.kick();
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoad?.();
    this.cancelEnvironment?.();
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.meshWorker.dispose();
    document.removeEventListener('visibilitychange', this.kick);
    const geometries = new Set<THREE.BufferGeometry>();
    const disposeGeometry = (geometry: THREE.BufferGeometry) => { if (!geometries.has(geometry)) { geometries.add(geometry); geometry.dispose(); } };
    this.scene.traverse((node) => { if (node instanceof THREE.Mesh) disposeGeometry(node.geometry); });
    // A failed load may never attach its robot to the scene. Release those cached meshes too.
    for (const pending of this.meshCache.values()) void pending.then(disposeGeometry, () => undefined);
    this.meshCache.clear();
    this.scene.environment?.dispose(); this.scene.environment = null;
    this.printed.dispose(); this.servo.dispose();
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
