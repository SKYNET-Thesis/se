/// <reference lib="webworker" />
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

/**
 * Parses SO-101 STL meshes off the main thread. The page posts a mesh URL; the worker fetches it,
 * parses it and transfers the position and normal arrays back without copying.
 */
const loader = new STLLoader();

self.onmessage = async (event: MessageEvent<{ id: number; url: string }>) => {
  const { id, url } = event.data;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const geometry = loader.parse(await response.arrayBuffer());
    const position = geometry.getAttribute('position').array as Float32Array;
    const normal = geometry.getAttribute('normal')?.array as Float32Array | undefined;
    const transfer = normal ? [position.buffer, normal.buffer] : [position.buffer];
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, position, normal }, transfer);
  } catch (error) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
