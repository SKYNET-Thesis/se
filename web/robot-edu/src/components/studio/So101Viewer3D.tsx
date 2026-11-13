import React, { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { SimState } from '../../types/robotProgram';
import { perfMark } from '../../utils/perf';
import { loadSo101Geometry, SO101_URDF } from './so101Assets';

type Viewer = HTMLElement & {
  setJointValue?: (name: string, value: number) => void;
  robot?: THREE.Object3D;
  camera?: THREE.PerspectiveCamera;
  controls?: { target: THREE.Vector3; update: () => void };
  redraw?: () => void;
};

/** Read-only SO-101 viewer adapted from LeLab's Apache-2.0 URDF viewer path. */
export function So101Viewer3D({ state, learningTarget = null, targetZone = null }: { state: SimState; learningTarget?: { x: number; y: number; z: number } | null; targetZone?: { x: number; y: number; w: number; h: number } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const jointValues = useRef<Record<string, number>>({});
  const animationFrame = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by Retry to rebuild the viewer

  useEffect(() => {
    const hostElement = host.current;
    let disposed = false;
    let failedMeshes = 0;
    void Promise.all([import('urdf-loader/src/urdf-manipulator-element.js'), import('three')]).then(([{ default: URDFManipulator }, THREE]) => {
      if (disposed || !hostElement) return;
      if (!customElements.get('urdf-viewer')) customElements.define('urdf-viewer', URDFManipulator);
      const element = document.createElement('urdf-viewer') as Viewer;
      (element as Viewer & { loadMeshFunc?: unknown }).loadMeshFunc = (
        path: string,
        manager: THREE.LoadingManager,
        material: THREE.Material,
        done: (mesh: THREE.Object3D | null, error?: unknown) => void,
      ) => {
        const file = path.split('/').pop() as string;
        // The loading manager must still see every mesh, otherwise urdf-processed would fire early or never.
        manager.itemStart(file);
        loadSo101Geometry(file).then(
          (geometry) => { done(new THREE.Mesh(geometry, material ?? new THREE.MeshStandardMaterial({ color: 0x6b736f, metalness: 0.45, roughness: 0.42 }))); manager.itemEnd(file); },
          (loadError) => { failedMeshes += 1; manager.itemError(file); done(null, loadError); manager.itemEnd(file); },
        );
      };
      // The library resizes the canvas every animation frame, which reallocates the drawing buffer. Only do it on a real change.
      const originalUpdateSize = (element as Viewer & { updateSize: () => void }).updateSize.bind(element);
      let lastSize = '';
      (element as Viewer & { updateSize: () => void }).updateSize = () => {
        const size = `${element.clientWidth}x${element.clientHeight}@${window.devicePixelRatio}`;
        if (size === lastSize) return;
        lastSize = size; originalUpdateSize();
      };
      element.setAttribute('up', 'Z'); element.setAttribute('urdf', SO101_URDF);
      element.setAttribute('ambient-light', '1.5'); // no auto-redraw: render only when a joint, the camera or the size changes
      element.addEventListener('urdf-processed', () => {
        // urdf-loader only recenters its target; it deliberately leaves its
        // camera at the default distance. Fit from the actual mesh bounds so
        // SO-101 displays correctly whether its STL files use mm or metres.
        const loadedViewer = element as Viewer;
        if (loadedViewer.robot && loadedViewer.camera && loadedViewer.controls) {
          const bounds = new THREE.Box3().setFromObject(loadedViewer.robot);
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const maxDimension = Math.max(size.x, size.y, size.z, 0.1);
          loadedViewer.camera.position.copy(center).add(
            new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(maxDimension * 1.35),
          );
          loadedViewer.controls.target.copy(center);
          loadedViewer.controls.update();
          loadedViewer.redraw?.();
        }
        if (failedMeshes > 0) { setError(`${failedMeshes} robot part${failedMeshes === 1 ? '' : 's'} could not be downloaded.`); return; }
        perfMark('viewer3d-ready');
        setReady(true);
      }, { once: true });
      // Custom elements default to `display: inline`, which gives this viewer a
      // zero-height layout even when width/height are set. Make its canvas fill
      // the preview frame explicitly.
      element.style.display = 'block';
      element.style.width = '100%';
      element.style.height = '100%';
      hostElement.replaceChildren(element); viewer.current = element;
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load 3D viewer.'));
    return () => {
      disposed = true;
      const renderer = (viewer.current as (Viewer & { renderer?: THREE.WebGLRenderer }) | null)?.renderer;
      hostElement?.replaceChildren(); viewer.current = null;
      // Release the WebGL context: browsers cap live contexts, and each workspace visit would otherwise leak one.
      renderer?.dispose(); renderer?.forceContextLoss();
    };
  }, [attempt]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const element = viewer.current;
    if (!element?.setJointValue) return;
    const left = state.arms.left.tool; const right = state.arms.right.tool;
    const target = {
      Rotation: ((left.x - right.x) / 600) * 0.7,
      Pitch: ((left.y + right.y - 400) / 800) * 0.8,
      Elbow: -0.9 + ((left.z + right.z) / 500),
      Wrist_Pitch: state.arms.left.gripper === 'open' ? 0.18 : -0.08,
      Jaw: state.arms.left.gripper === 'open' ? 0.45 : 0.05,
    };
    const from = Object.fromEntries(Object.entries(target).map(([joint, value]) => [joint, jointValues.current[joint] ?? value]));
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    const durationMs = 520;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      // Smooth acceleration and deceleration makes gripper state changes feel
      // like a robot movement rather than a swapped static image.
      const eased = progress * progress * (3 - 2 * progress);
      Object.entries(target).forEach(([joint, value]) => {
        element.setJointValue?.(joint, from[joint] + (value - from[joint]) * eased);
      });
      if (progress < 1) animationFrame.current = requestAnimationFrame(animate);
      else { jointValues.current = target; animationFrame.current = null; }
    };
    animationFrame.current = requestAnimationFrame(animate);
    return () => { if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current); };
  }, [ready, state]);

  useEffect(() => {
    if (!ready) return;
    const element = viewer.current;
    if (!element?.robot) return;
    let disposed = false;
    void import('three').then((THREE) => {
      if (disposed || !element.robot) return;
      const existing = element.robot.getObjectByName('vista-learning-target');
      if (existing) element.robot.remove(existing);
      if (!learningTarget) return;
      // This is intentionally a normalized classroom visualization, not a robot frame.
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.025, 18, 12), new THREE.MeshStandardMaterial({ color: 0x10a58e, emissive: 0x0a5d50, emissiveIntensity: 0.5 }));
      marker.name = 'vista-learning-target';
      marker.position.set((learningTarget.x - 300) / 1300, (learningTarget.y - 200) / 1300, 0.11 + (learningTarget.z - 10) / 2000);
      element.robot.add(marker); element.redraw?.();
    });
    return () => { disposed = true; };
  }, [learningTarget, ready]);

  useEffect(() => {
    if (!ready) return;
    const element = viewer.current;
    if (!element?.robot) return;
    let disposed = false;
    void import('three').then((THREE) => {
      if (disposed || !element.robot) return;
      const existingZone = element.robot.getObjectByName('vista-target-zone');
      if (existingZone) element.robot.remove(existingZone);
      if (!targetZone) return;
      const zoneMesh = new THREE.Mesh(
        new THREE.BoxGeometry(targetZone.w / 1300, targetZone.h / 1300, 0.002),
        new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.35,
          roughness: 0.5,
        }),
      );
      zoneMesh.name = 'vista-target-zone';
      const centerX = targetZone.x + targetZone.w / 2;
      const centerY = targetZone.y + targetZone.h / 2;
      zoneMesh.position.set((centerX - 300) / 1300, (centerY - 200) / 1300, 0.001);
      element.robot.add(zoneMesh);
      element.redraw?.();
    });
    return () => { disposed = true; };
  }, [ready, targetZone]);

  return error ? <div role="alert" className="grid h-full place-items-center p-6 text-center text-sm text-ink-muted"><div><p>3D preview unavailable: {error}</p><button type="button" onClick={() => { setError(null); setReady(false); setAttempt((value) => value + 1); }} className="mt-3 rounded-md border border-line-strong bg-surface px-3 py-1.5 font-medium text-ink hover:bg-sunken">Retry 3D preview</button></div></div> : <div ref={host} data-ready={ready} className="h-full w-full" aria-label="Interactive 3D SO-101 robot preview" />;
}
