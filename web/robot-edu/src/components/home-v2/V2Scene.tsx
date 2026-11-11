import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import type { StageStatus } from '../home-lab/RobotCanvas';
import type { CameraRig, RobotScene, StageAxis } from '../home-lab/robotScene';
import { AssetMedia } from '../home/media/AssetMedia';

/**
 * The SO-101 model is derived from the repository URDF/STL whose hardware design licence is unverified.
 * It renders only in development builds, or when a build explicitly sets VITE_SO101_3D_CLEARED=true
 * after the licence is cleared. Every other build takes the poster path (`home.v2.robot.poster`).
 */
export const SO101_3D_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_SO101_3D_CLEARED === 'true';

/** Loaded only when 3D is allowed, so a build without licence clearance contains no 3D model code. */
const RobotCanvas = SO101_3D_ALLOWED ? lazy(() => import('../home-lab/RobotCanvas').then((m) => ({ default: m.RobotCanvas }))) : null;

/** The H6.1 ready pose (robotScene REST_POSE), kept here so the poster path never imports the 3D module. */
const REST_POSE = { Rotation: 0.4, Pitch: -0.6, Elbow: 1.0, Wrist_Pitch: 0.6, Wrist_Roll: 0, Jaw: 0.7 };

/**
 * A cheap check only: creating a throwaway WebGL context to probe costs ≈0.2 s on the main thread
 * (measured), so the one real context decides. If it cannot be created, the page takes the poster path.
 */
function webglMaybeAvailable(): boolean {
  return typeof window !== 'undefined' && ('WebGL2RenderingContext' in window || 'WebGLRenderingContext' in window);
}

export type Chapter = 'hero' | 'lesson' | 'space' | 'finale' | 'modes' | `x-${string}`;
/** Views of the optional learning-modes chapter (development prototypes only; `/home-v2` has none). */
export type ModesView = 'program' | 'vr' | 'demo';
export type SpaceView = 'product' | 'technical';

/**
 * In the 3D stage chapter the arm is turned aside (inside the URDF joint limits) so it never hides
 * Target A. The same pose serves both views: switching view moves the camera only.
 */
/** The closing end-state: the arm folded into its park pose (inside the URDF joint limits). */
const PARK_POSE = { Rotation: 0, Pitch: -1.7, Elbow: 1.55, Wrist_Pitch: 0.75, Wrist_Roll: 0, Jaw: -0.15 };
type Pose = typeof REST_POSE;
const mixPose = (a: Pose, b: Pose, t: number): Pose => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v + (b[k as keyof Pose] - v) * t])) as Pose;

const SPACE_POSE = { Rotation: -1.15, Pitch: -0.9, Elbow: 1.35, Wrist_Pitch: 0.7, Wrist_Roll: 0, Jaw: 0.7 };

/** Target A from the seeded Reach a Target lesson, in the learning_preview_v1 frame (mm). */
export const TARGET_A = { x: 240, y: 220, z: 120 } as const;

type RigName = 'hero' | 'entry' | 'lesson' | 'product' | 'technical' | 'finale' | 'modesProgram' | 'modesVr' | 'modesDemo';

/**
 * Camera rigs in window space (robot height = 1, base at the origin). `fov` is the vertical field of
 * view inside a window of aspect `fit` (width / height); narrower windows widen the lens so the subject
 * still fits across. The target lands at (`ax`, `ay`) of the window. Each chapter marks its window with
 * `data-stage-window`; the director measures it, so the layout decides the composition at every width
 * and the camera follows. Distances stay inside the scene fog (~3.2–7.5 units).
 */
export interface StageRig extends Omit<CameraRig, 'shiftX' | 'shiftY'> { fit: number; ax?: number; ay?: number }

/**
 * How the modes chapter stages one learning experience: its camera (in window space), key light, rim
 * glow, and whether the arm returns to rest. Experiences carry their own preset, so a new one needs no
 * change here.
 */
export interface ModesPreset { rig: StageRig; light: number; glow: number; restArm: boolean }

/**
 * A preset any extra chapter can register under its own `x-…` scene name (development studies use it);
 * an optional pose is applied when the chapter takes the stage.
 */
export interface ScenePreset extends ModesPreset { pose?: Partial<typeof REST_POSE> }

const RIG: Record<RigName, StageRig> = {
  hero: { azimuth: 0.78, elevation: 0.12, distance: 3.15, targetY: 0.47, targetZ: 0.12, fov: 26, fit: 1.05, ay: 0.52 },
  entry: { azimuth: 1.55, elevation: 0.36, distance: 5.6, targetY: 0.47, targetZ: 0.12, fov: 26, fit: 1.05, ay: 0.52 },
  lesson: { azimuth: 1.25, elevation: 0.22, distance: 1.8, targetY: 0.7, targetZ: 0.55, fov: 30, fit: 0.86, ay: 0.52 },
  product: { azimuth: 0.62, elevation: 0.16, distance: 3.9, targetY: 0.36, targetZ: -0.25, fov: 28, fit: 0.96 },
  technical: { azimuth: 0.45, elevation: 0.95, distance: 4, targetX: -0.05, targetY: 0.1, targetZ: -0.4, fov: 30, fit: 0.96 },
  finale: { azimuth: 1.42, elevation: 0.05, distance: 3.6, targetX: 0.08, targetY: 0.34, targetZ: 0.05, fov: 26, fit: 1.25, ax: 0.42, ay: 0.55 },
  // Learning-modes prototypes: a close look at the gripper, a wide front view for the follower, a high
  // three-quarter view for recorded episodes.
  modesProgram: { azimuth: 2.05, elevation: 0.28, distance: 2.9, targetY: 0.55, targetZ: 0.2, fov: 28, fit: 1.25, ax: 0.54 },
  modesVr: { azimuth: 0.75, elevation: 0.24, distance: 3.7, targetY: 0.42, targetZ: 0.05, fov: 28, fit: 1.2, ax: 0.58 },
  modesDemo: { azimuth: -0.8, elevation: 0.42, distance: 3.9, targetY: 0.36, targetZ: 0.05, fov: 28, fit: 1.2, ax: 0.58, ay: 0.42 },
};

/** Which chapter's window each rig frames. */
const RIG_WINDOW: Record<RigName, Chapter> = { hero: 'hero', entry: 'hero', lesson: 'lesson', product: 'space', technical: 'space', finale: 'finale', modesProgram: 'modes', modesVr: 'modes', modesDemo: 'modes' };
const MODES_RIG: Record<ModesView, RigName> = { program: 'modesProgram', vr: 'modesVr', demo: 'modesDemo' };

interface Box { x: number; y: number; width: number; height: number }

/**
 * A chapter's window as it sits right now. The camera's lens shift follows it on every scroll frame, so
 * the arm rides inside its window instead of waiting where the window will be. Kinds (`data-stage-window`):
 * "bleed" runs under the transparent header (hero, finale); "column" starts at its chapter's top, under
 * the fixed header, so its framed area begins below the header; a plain window is framed whole (the
 * pinned compact stages, already placed below the header).
 */
interface WindowInfo { el: HTMLElement; kind?: string; ax?: number; ay?: number }
let windowCache: Partial<Record<Chapter, WindowInfo | null>> = {};
let headerHeight = 0;
/** Forget measured windows (on resize), so the next frame reads them again. */
const resetWindows = () => { windowCache = {}; headerHeight = 0; };

function windowInfo(chapter: Chapter): WindowInfo | null {
  if (windowCache[chapter] !== undefined && windowCache[chapter]?.el.isConnected !== false) return windowCache[chapter] ?? null;
  const el = document.querySelector<HTMLElement>(`[data-scene="${chapter}"] [data-stage-window]`);
  if (!el) return (windowCache[chapter] = null);
  const css = getComputedStyle(el);
  const ax = parseFloat(css.getPropertyValue('--stage-ax')); const ay = parseFloat(css.getPropertyValue('--stage-ay'));
  return (windowCache[chapter] = { el, kind: el.dataset.stageWindow, ax: Number.isNaN(ax) ? undefined : ax, ay: Number.isNaN(ay) ? undefined : ay });
}

function liveBox(chapter: Chapter): (Box & { ax?: number; ay?: number; top: number; home: number }) | null {
  const info = windowInfo(chapter);
  if (!info) return null;
  // One layout read per frame: the window's rect. Everything else only changes on resize.
  const r = info.el.getBoundingClientRect();
  if (!headerHeight) headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
  const inset = info.kind === 'column' ? headerHeight : 0;
  const height = Math.max(1, Math.min(r.height - inset, innerHeight - (info.kind === 'bleed' ? 0 : headerHeight)));
  return { x: r.left, y: r.top + inset, width: r.width, height, ax: info.ax, ay: info.ay, top: r.top, home: info.kind ? 0 : headerHeight };
}

/** Converts a window-space rig into the full-viewport canvas camera: a lens shift onto the window, and its fov. */
function frameRig({ fit, ax, ay, ...rig }: StageRig, box: ReturnType<typeof liveBox>): CameraRig {
  const cw = innerWidth || 1; const ch = innerHeight || 1;
  const w = box ?? { x: 0, y: 0, width: cw, height: ch };
  const fh = Math.max(1, Math.min(w.height, w.width / fit));
  const fov = (2 * Math.atan(Math.tan((rig.fov * Math.PI) / 360) * (ch / fh)) * 180) / Math.PI;
  const tx = w.x + (box?.ax ?? ax ?? 0.5) * w.width; const ty = w.y + (box?.ay ?? ay ?? 0.5) * w.height;
  return { ...rig, fov: Math.min(fov, 100), shiftX: (tx - cw / 2) / cw, shiftY: (ty - ch / 2) / ch };
}

const mix = (a: CameraRig, b: CameraRig, t: number): CameraRig => {
  const m = (k: keyof CameraRig) => (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  return { azimuth: m('azimuth'), elevation: m('elevation'), distance: m('distance'), targetY: m('targetY'), fov: m('fov'), targetX: m('targetX'), targetZ: m('targetZ'), shiftX: m('shiftX'), shiftY: m('shiftY') };
};
const smooth = (from: number, to: number, v: number) => { const t = Math.min(1, Math.max(0, (v - from) / (to - from))); return t * t * (3 - 2 * t); };

interface SceneContext {
  scene: MutableRefObject<RobotScene | null>;
  ready: boolean;
  mode: '3d' | 'poster';
  status: StageStatus | 'poster';
  active: Chapter | null;
  mobile: boolean;
  reduce: boolean;
  spaceView: SpaceView;
  setSpaceView: (view: SpaceView) => void;
  spaceFocus: StageAxis | null;
  setSpaceFocus: (axis: StageAxis | null) => void;
  /** While a lesson program plays, the lesson camera leans in a little. */
  setLean: (lean: boolean) => void;
  modesView: ModesView;
  /** The modes chapter's current experience preset (Homepage V2); overrides `modesView` when set. */
  setModesPreset: (preset: ModesPreset | null) => void;
  /** Stage an extra chapter (`data-scene="x-…"`) with its own preset, or remove it with null. */
  setScenePreset: (name: `x-${string}`, preset: ScenePreset | null) => void;
  setModesView: (view: ModesView) => void;
  /** The H6.1 ready pose, for chapters that hand the arm back to rest. */
  restPose: typeof REST_POSE;
}

const Ctx = createContext<SceneContext | null>(null);

export function useV2Scene(): SceneContext {
  const value = useContext(Ctx);
  if (!value) throw new Error('useV2Scene must be used inside V2SceneProvider');
  return value;
}

/**
 * One fixed WebGL canvas for the whole page. Chapters marked `data-scene` are windows onto it; the
 * director moves the camera, light and stage to the preset of the chapter that holds most of the
 * viewport, scrubs hero → lesson against scroll, and pauses rendering whenever no 3D chapter is
 * visible (opaque chapters cover the canvas). One GPU context, not one per section.
 */
export function V2SceneProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const mobile = useMediaQuery('(max-width: 767px)');
  const scene = useRef<RobotScene | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<StageStatus | 'poster'>('loading');
  const [active, setActive] = useState<Chapter | null>('hero');
  const [visible, setVisible] = useState(true);
  const [spaceView, setSpaceView] = useState<SpaceView>('product');
  const [spaceFocus, setSpaceFocus] = useState<StageAxis | null>(null);
  const [lean, setLean] = useState(false);
  const [modesView, setModesView] = useState<ModesView>('program');
  const [modesPreset, setModesPreset] = useState<ModesPreset | null>(null);
  const [scenes, setScenes] = useState<Record<string, ScenePreset>>({});
  const setScenePreset = useCallback((name: `x-${string}`, preset: ScenePreset | null) => setScenes((all) => {
    if (preset ? all[name] === preset : !(name in all)) return all;
    const next = { ...all }; if (preset) next[name] = preset; else delete next[name]; return next;
  }), []);
  const lastView = useRef<SpaceView>('product');
  const crane = useRef(0);
  const [mode, setMode] = useState<'3d' | 'poster'>(() => (RobotCanvas && webglMaybeAvailable() ? '3d' : 'poster'));
  const onStatus = useCallback((next: StageStatus) => { setStatus(next); if (next === 'error') setMode('poster'); }, []);
  const hiddenSince = useRef(false);
  const entered = useRef(false);
  const lessonAim = useRef<{ x: number; y: number; z: number } | null>(null);

  // Re-frame every rig when the layout changes size (windows are measured, not assumed).
  const [layout, setLayout] = useState(0);
  useEffect(() => {
    let t = 0;
    const onResize = () => { clearTimeout(t); t = window.setTimeout(() => { resetWindows(); setLayout((n) => n + 1); }, 150); };
    addEventListener('resize', onResize);
    return () => { removeEventListener('resize', onResize); clearTimeout(t); };
  }, []);

  const rigFor = useCallback((name: RigName): CameraRig => {
    void layout;
    const rig = name === 'lesson' && lessonAim.current
      ? { ...RIG.lesson, targetX: lessonAim.current.x, targetY: lessonAim.current.y - 0.04, targetZ: lessonAim.current.z, distance: RIG.lesson.distance * (lean ? 0.9 : 1) }
      : RIG[name];
    return frameRig(rig, liveBox(RIG_WINDOW[name]));
  }, [layout, lean]);
  const modesRig = useCallback((): CameraRig => (modesPreset ? frameRig(modesPreset.rig, liveBox('modes')) : rigFor(MODES_RIG[modesView])), [modesPreset, modesView, rigFor]);

  // Which 3D chapter holds the viewport, and is any of them visible at all?
  useEffect(() => {
    const ratios = new Map<Element, number>();
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) ratios.set(e.target, e.isIntersecting ? e.intersectionRect.height / innerHeight : 0);
      let best: Element | null = null; let bestRatio = 0; let any = false;
      for (const [node, r] of ratios) { if (r > 0.001) any = true; if (r > bestRatio) { best = node; bestRatio = r; } }
      setVisible(any);
      if (best && bestRatio > 0.12) setActive((best as HTMLElement).dataset.scene as Chapter);
      else if (!any) setActive(null);
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  useEffect(() => { scene.current?.setActive(visible); if (!visible) hiddenSince.current = true; }, [visible, ready]);

  // Apply the active chapter's preset. A chapter re-entering from behind opaque content cuts to its rig.
  useEffect(() => {
    const s = scene.current;
    if (!ready || !s || !active) return;
    const cut = hiddenSince.current || reduce;
    hiddenSince.current = false;
    if (active === 'hero') {
      if (!entered.current && !reduce) {
        // Signature move (from Concept A): dolly in from a wide, dark frame while the key light rises.
        entered.current = true;
        s.setRig(rigFor('entry'), true); s.setLight(0.05, true);
        window.setTimeout(() => { s.setRig(rigFor('hero')); s.setLight(1); }, 120);
      } else { entered.current = true; s.setRig(rigFor('hero'), cut); s.setLight(1, cut); }
      s.setStageVisible(0, cut); s.setTargetOverlay(TARGET_A, 0); s.setGlow(0);
    } else if (active === 'lesson') {
      s.setPose({ Rotation: REST_POSE.Rotation, Pitch: REST_POSE.Pitch, Elbow: REST_POSE.Elbow, Wrist_Pitch: REST_POSE.Wrist_Pitch });
      s.setRig(rigFor('lesson'), cut); s.setLight(1, cut); s.setStageVisible(0, cut); s.setTargetOverlay(TARGET_A, 0);
    } else if (active === 'space') {
      s.setPose(SPACE_POSE);
      window.clearTimeout(crane.current);
      if (!cut && lastView.current === 'product' && spaceView === 'technical') {
        // A crane move in two beats: rise and pull back over the product view, then swing over the stage.
        s.setRig({ ...rigFor('product'), elevation: 0.62, distance: 4.9 });
        crane.current = window.setTimeout(() => s.setRig(rigFor('technical')), 560);
      } else s.setRig(rigFor(spaceView), cut);
      lastView.current = spaceView;
      s.setLight(1, cut); s.setStageVisible(1, cut); s.setGlow(0);
      s.setTargetOverlay(TARGET_A, spaceView === 'technical' ? 1 : 0.35, spaceFocus);
    } else if (active === 'modes') {
      // The arm's motion here is driven by the modes chapter itself (follower, episodes); the director
      // sets the camera and light for the view, and hands the arm back to rest for Program & Preview.
      const light = modesPreset ? modesPreset.light : modesView === 'vr' ? 0.78 : 1;
      const glow = modesPreset ? modesPreset.glow : modesView === 'vr' ? 0.35 : 0;
      if (modesPreset ? modesPreset.restArm : modesView === 'program') s.setPose(REST_POSE);
      s.setRig(modesRig(), cut); s.setLight(light, cut);
      s.setGlow(glow); s.setStageVisible(0, cut); s.setTargetOverlay(TARGET_A, 0);
    } else if (active.startsWith('x-') && scenes[active]) {
      const preset = scenes[active];
      if (preset.pose) s.setPose(preset.pose); else if (preset.restArm) s.setPose(REST_POSE);
      s.setRig(frameRig(preset.rig, liveBox(active)), cut); s.setLight(preset.light, cut);
      s.setGlow(preset.glow); s.setStageVisible(0, cut); s.setTargetOverlay(TARGET_A, 0);
    } else if (active === 'finale') {
      // Closing frame: the arm in profile, the key light down, the rim up. It folds into park as the
      // chapter scrolls (below); with reduced motion it is simply parked.
      s.setPose(reduce ? PARK_POSE : REST_POSE);
      s.setRig(rigFor('finale'), cut); s.setLight(0.32, cut); s.setGlow(0.28); s.setStageVisible(0, cut); s.setTargetOverlay(TARGET_A, 0);
    }
  }, [active, ready, reduce, rigFor, spaceView, spaceFocus, modesView, modesRig, modesPreset, scenes]);

  // Every scroll frame: the lens shift follows the active window exactly (instant, so the arm never lags
  // its window), while the rest of the rig keeps its eased motion. Hero → lesson is scrubbed against
  // scroll until the lesson's window reaches its place; the finale orbits and folds the arm into park.
  // With reduced motion only the window-following remains.
  useEffect(() => {
    if (!ready) return undefined;
    let frame = 0;
    const follow = (rig: CameraRig) => scene.current?.setRig({ shiftX: rig.shiftX, shiftY: rig.shiftY }, true);
    const update = () => {
      frame = 0;
      const s = scene.current; if (!s || !active) return;
      const hero = document.querySelector<HTMLElement>('[data-scene="hero"]');
      const lessonBox = liveBox('lesson');
      if (hero && lessonBox && (active === 'hero' || active === 'lesson')) {
        // The scrub ends when the lesson's window reaches its place (its chapter's top, or its pin).
        const start = hero.offsetTop; const end = scrollY + lessonBox.top - lessonBox.home;
        const progress = (scrollY - start) / Math.max(1, end - start);
        const t = reduce ? (active === 'lesson' ? 1 : 0) : smooth(0.12, 0.92, progress);
        const heroRig = rigFor('hero'); const lessonRig = rigFor('lesson');
        if (!reduce) s.setRig(mix(heroRig, lessonRig, t));
        // The arm's place belongs to whichever window the reader can see, blended by visible height:
        // it rides up with the hero window and is waiting in the lesson window as that one arrives, so
        // it never passes behind the headline and no window is shown empty.
        const seen = (box: ReturnType<typeof liveBox>) => (box ? Math.max(0, Math.min(box.y + box.height, innerHeight) - Math.max(box.y, headerHeight)) : 0);
        const seenHero = seen(liveBox('hero')); const seenLesson = seen(lessonBox);
        follow(mix(heroRig, lessonRig, seenHero + seenLesson > 0 ? seenLesson / (seenHero + seenLesson) : t));
      } else if (active === 'finale') {
        const finale = document.querySelector<HTMLElement>('[data-scene="finale"]');
        const base = rigFor('finale');
        if (finale && !reduce) {
          const p = Math.min(1, Math.max(0, (scrollY + innerHeight - finale.offsetTop) / (finale.offsetHeight + innerHeight)));
          s.setRig({ ...base, azimuth: base.azimuth + 0.35 - 0.5 * p });
          s.setPose(mixPose(REST_POSE, PARK_POSE, smooth(0.2, 0.72, p)));
        }
        follow(base);
      } else if (active === 'space') {
        follow(rigFor(spaceView));
      } else if (active === 'modes') {
        follow(modesRig());
      } else if (active.startsWith('x-') && scenes[active]) {
        follow(frameRig(scenes[active].rig, liveBox(active)));
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [ready, reduce, active, rigFor, spaceView, modesView, modesRig, scenes]);

  // Pointer depth in the hero only (Concept A).
  useEffect(() => {
    if (!ready || reduce || mobile || active !== 'hero') return undefined;
    const instance = scene.current;
    const onMove = (e: PointerEvent) => instance?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    addEventListener('pointermove', onMove, { passive: true });
    return () => { removeEventListener('pointermove', onMove); instance?.setPointer(0, 0); };
  }, [ready, reduce, mobile, active]);

  const onReady = useCallback((instance: RobotScene) => {
    instance.setPose(REST_POSE);
    lessonAim.current = instance.jointWorld('Jaw');
    instance.setStageVisible(0, true);
    setReady(true);
  }, []);

  const value = useMemo<SceneContext>(() => ({ scene, ready, mode, status: mode === 'poster' ? 'poster' : status, active, mobile, reduce, spaceView, setSpaceView, spaceFocus, setSpaceFocus, setLean, modesView, setModesView, setModesPreset, setScenePreset, restPose: REST_POSE }), [ready, mode, status, active, mobile, reduce, spaceView, spaceFocus, modesView, setScenePreset]);

  return (
    <Ctx.Provider value={value}>
      <div aria-hidden={mode === 'poster' ? true : undefined} className={cn('pointer-events-none fixed inset-0 z-0 transition-opacity duration-500', visible ? 'opacity-100' : 'opacity-0')}>
        {mode === '3d' && RobotCanvas ? (
          <Suspense fallback={<div className="absolute inset-0 bg-[#0b0d0f]" data-stage-status="loading" />}>
          <RobotCanvas
            rig={frameRig(RIG.hero, null)}
            background={0x0b0d0f}
            stage
            stageFade
            worker
            envWorker
            precompile
            lowPower={mobile}
            reducedMotion={reduce}
            label="The SO-101 robot arm in a lit 3D preview"
            className="absolute inset-0"
            onStatus={onStatus}
            probe={false}
            onReady={onReady}
            ref={scene} />
          </Suspense>
        ) : (
          <div className="absolute inset-0 bg-[#0b0d0f]" data-stage-status="poster">
            <AssetMedia id="home.v2.robot.poster" />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}
      </div>
      {children}
    </Ctx.Provider>
  );
}
