import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { RobotScene, webglAvailable, type CameraRig, type SceneOptions } from './robotScene';

export type StageStatus = 'loading' | 'ready' | 'error';

interface RobotCanvasProps extends SceneOptions {
  rig: CameraRig;
  className?: string;
  label: string;
  onReady?: (scene: RobotScene) => void;
  onStatus?: (status: StageStatus) => void;
  /**
   * Probe WebGL with a throwaway context before building the scene (the default). Opting out skips that
   * extra context (≈0.2 s of main-thread work measured); a missing WebGL then surfaces as `error` from
   * the real renderer instead.
   */
  probe?: boolean;
}

/**
 * One WebGL canvas holding the SO-101 scene. While the model loads, the canvas shows the stage colour
 * (space is reserved); if WebGL or the model is unavailable, an honest text fallback replaces it.
 */
export const RobotCanvas = forwardRef<RobotScene | null, RobotCanvasProps>(function RobotCanvas({ rig, className, label, onReady, onStatus, probe = true, ...options }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<RobotScene | null>(null);
  const [status, setStatus] = useState<StageStatus>('loading');
  // The scene is created after first paint, so the parent's ref is refreshed when the status changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => scene.current as RobotScene, [status]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return undefined;
    if (probe && !webglAvailable()) { setStatus('error'); onStatus?.('error'); return undefined; }
    let instance: RobotScene | null = null;
    let cancelled = false;
    const resize = new ResizeObserver(() => instance?.resize());
    // The scene (model parsing, shaders, environment map) starts only once the page has painted and the
    // browser is idle, so the headline and controls never wait for WebGL.
    const start = () => {
      if (cancelled) return;
      try { instance = new RobotScene(node, rig, options); } catch { setStatus('error'); onStatus?.('error'); return; }
      const created = instance;
      scene.current = created;
      (window as unknown as { __labScene?: RobotScene }).__labScene = created;
      resize.observe(node);
      created.load()
        .then(() => { if (cancelled) return; setStatus('ready'); onStatus?.('ready'); onReady?.(created); })
        .catch(() => { if (!cancelled) { setStatus('error'); onStatus?.('error'); } });
    };
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 700 }) : window.setTimeout(start, 120);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else window.clearTimeout(idle);
      resize.disconnect(); instance?.dispose(); scene.current = null;
    };
    // The scene is created once; later rig and pose changes go through its methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn('relative', className)} data-stage-status={status}>
      <canvas ref={canvas} role="img" aria-label={label} className={cn('block h-full w-full transition-opacity duration-700', status === 'ready' ? 'opacity-100' : 'opacity-0')} />
      {status === 'error' && (
        <p className="absolute inset-0 grid place-items-center p-8 text-center text-[15px] text-[var(--lab-muted)]">The 3D preview could not start on this device. The lesson below works without it.</p>
      )}
    </div>
  );
});
