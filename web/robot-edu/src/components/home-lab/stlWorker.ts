/// <reference lib="webworker" />
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { decodeVmesh } from './vmesh';

/**
 * Parses SO-101 meshes off the main thread. The page posts a mesh URL; the worker fetches it, decodes it and transfers the arrays
 * back without copying. A `.msh` URL is the compact web mesh (indexed, smooth normals). If it is missing or corrupt, the original
 * STL it was derived from is used instead, so a bad deploy of the web meshes costs download size, not the 3D preview.
 */
const loader = new STLLoader();
const webToOriginal = (url: string) => url.replace('/meshes-web/', '/meshes/').replace(/\.msh(\?.*)?$/i, '.stl$1');

async function fetchBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.arrayBuffer();
}

async function parse(url: string) {
  if (/\.msh(\?.*)?$/i.test(url)) {
    try { const { position, normal, index } = decodeVmesh(await fetchBuffer(url)); return { position, normal, index }; } catch { /* fall back to the original */ }
    url = webToOriginal(url);
  }
  const geometry = loader.parse(await fetchBuffer(url));
  return { position: geometry.getAttribute('position').array as Float32Array, normal: geometry.getAttribute('normal')?.array as Float32Array | undefined, index: undefined };
}

self.onmessage = async (event: MessageEvent<{ id: number; url: string }>) => {
  const { id, url } = event.data;
  try {
    const { position, normal, index } = await parse(url);
    const transfer: ArrayBuffer[] = [position.buffer as ArrayBuffer];
    if (normal) transfer.push(normal.buffer as ArrayBuffer);
    if (index) transfer.push(index.buffer as ArrayBuffer);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, position, normal, index }, transfer);
  } catch (error) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
