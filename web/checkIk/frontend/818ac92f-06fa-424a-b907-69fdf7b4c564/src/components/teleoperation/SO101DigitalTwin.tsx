import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RobotDevice } from '../../types';

const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'] as const;

export function SO101DigitalTwin({ left, right, live, visibleSide = 'both' }: { left: RobotDevice; right: RobotDevice; live: boolean; visibleSide?: 'left' | 'right' | 'both'; }) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'home' | 'front' | 'top'>('home');
  const devices = useRef({ left, right });
  devices.current = { left, right };

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d12);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
    const views = {
      home: [0.78, 0.7, 1.15],
      front: [0, 0.48, 1.45],
      top: [0, 1.65, 0.12],
    } as const;
    camera.position.set(...views[view]);
    camera.lookAt(0, 0.28, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xddeeff, 0x26313c, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(1, 2, 2);
    scene.add(key);
    const grid = new THREE.GridHelper(2.2, 12, 0x1b4650, 0x111b22);
    scene.add(grid);

    type RenderJoint = {
      node: THREE.Object3D;
      rest: THREE.Quaternion;
      displayedAngle: number;
      targetAngle: number;
      hasTelemetry: boolean;
    };
    const robots: Record<'left' | 'right', { joints: RenderJoint[] } | null> = {
      left: null,
      right: null,
    };
    new GLTFLoader().load('/assets/arm.glb', (gltf) => {
      (['left', 'right'] as const).forEach((side) => {
        if (visibleSide !== 'both' && side !== visibleSide) return;
        const root = new THREE.Group();
        const model = gltf.scene.clone(true);
        model.traverse((node) => { if (node.name.toLowerCase().includes('collision')) node.visible = false; });
        root.add(model);
        root.position.set(side === 'left' ? -0.24 : 0.24, 0, 0.12);
        root.rotation.y = Math.PI / 2;
        root.scale.setScalar(1.08);
        scene.add(root);
        robots[side] = {
          joints: JOINTS.map((name) => {
            const node = model.getObjectByName(name);
            if (!node) throw new Error(`arm.glb is missing joint ${name}`);
            return {
              node,
              rest: node.quaternion.clone(),
              displayedAngle: 0,
              targetAngle: 0,
              hasTelemetry: false,
            };
          }),
        };
      });
    });

    const axis = new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion();
    const clock = new THREE.Clock();
    let frame = 0;
    const resize = () => {
      const width = container.clientWidth;
      const height = Math.max(320, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      (['left', 'right'] as const).forEach((side) => {
        const robot = robots[side];
        if (!robot) return;
        const source = devices.current[side];
        robot.joints.forEach((joint, index) => {
          const measuredDegrees = source.joints[index]?.value;
          if (typeof measuredDegrees === 'number' && Number.isFinite(measuredDegrees)) {
            joint.targetAngle = THREE.MathUtils.degToRad(measuredDegrees);
            joint.hasTelemetry = true;
          }
          if (!joint.hasTelemetry) return;

          // Never extract an Euler Y angle from node.quaternion here: that
          // quaternion already contains the GLB bind/rest rotation.  Tracking
          // the animated offset separately avoids discontinuities and gimbal
          // jumps.  The wrapped delta also makes wrist-roll cross +/-180 deg
          // along the shortest path.
          const delta = Math.atan2(
            Math.sin(joint.targetAngle - joint.displayedAngle),
            Math.cos(joint.targetAngle - joint.displayedAngle),
          );
          const nearestTarget = joint.displayedAngle + delta;
          joint.displayedAngle = THREE.MathUtils.damp(joint.displayedAngle, nearestTarget, 24, dt);
          rotation.setFromAxisAngle(axis, joint.displayedAngle);
          joint.node.quaternion.copy(joint.rest).multiply(rotation);
        });
      });
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [visibleSide, view]);

  return <div className="twin-viewport control-bay relative h-[24rem] overflow-hidden rounded-xl border border-line bg-elev lg:h-[32rem]" ref={host}>
    <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-line bg-card/85 px-2 py-1 text-xs text-ink2">
      SO-101 {visibleSide === 'both' ? 'digital twins' : `${visibleSide} digital twin`} · {live ? 'live follower joints' : 'last known pose'}
    </span>
    <div className="absolute right-3 top-3 z-10 inline-flex rounded-lg border border-line bg-card/90 p-1" role="group" aria-label="Robot view">
      {([['home', 'Reset view'], ['front', 'Front'], ['top', 'Top']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} title={label} className={`h-7 rounded-md px-2 text-xs transition-colors ${view === key ? 'bg-subtle text-ink' : 'text-ink2 hover:text-ink'}`}>{label}</button>)}
    </div>
  </div>;
}
