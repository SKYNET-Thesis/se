/// <reference lib="webworker" />
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Builds the scene's studio reflections (the same RoomEnvironment PMREM the page would make) on an
 * OffscreenCanvas, so its shader compilation (≈0.7 s measured) blocks this worker, not the page.
 * Posts the finished cube-UV texture as half-float RGBA data; the page uploads it as-is.
 */
self.onmessage = (event: MessageEvent<{ sigma: number }>) => {
  try {
    const canvas = new OffscreenCanvas(16, 16);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas as unknown as HTMLCanvasElement, antialias: false });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(new RoomEnvironment(), event.data.sigma);
    const { width, height } = target;
    const data = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
    target.dispose(); pmrem.dispose(); renderer.dispose();
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ width, height, data }, [data.buffer]);
  } catch (error) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
