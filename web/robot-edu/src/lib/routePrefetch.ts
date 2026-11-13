import { prefetchSo101Assets } from '../components/studio/so101Assets';

/**
 * The practice workspace pulls in Blockly and Three.js (~1.5 MB of JavaScript plus 16 MB of robot meshes). Pages that lead
 * to it call this once the browser is idle, so opening the workspace finds those chunks and meshes already downloaded.
 * It only warms public, user-independent assets; no authenticated data is fetched.
 */
let started = false;
export function prefetchPracticeWorkspace(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => { void import('../pages/Practice').catch(() => { started = false; }); void prefetchSo101Assets(); };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 }); else window.setTimeout(run, 1200);
}
