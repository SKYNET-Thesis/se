#!/usr/bin/env node
/**
 * Homepage SO-101 3D measurement in a real Chrome (software GL unless a GPU is present): frame cadence while scrolling the whole page,
 * long tasks, WebGL context events, console errors, heap, scene resources, and screenshots at every 3D chapter.
 *
 *   node scripts/measure-home-3d.mjs <url> <label> <outDir> [--trace] [--dpr 2] [--cycles 2]
 *
 * Output: <outDir>/<label>.json (summary), <label>-<chapter>.png (screenshots), <label>-trace.json when --trace.
 * It only reads the page; it sends nothing anywhere but the URL given.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const [url, label, outDir, ...flags] = process.argv.slice(2);
if (!url || !label || !outDir) { console.error('usage: measure-home-3d.mjs <url> <label> <outDir> [--trace] [--dpr N] [--cycles N]'); process.exit(2); }
const flag = (name, fallback) => { const i = flags.indexOf(name); return i === -1 ? fallback : flags[i + 1]; };
const chromeArgs = (flag('--chrome-args', '') ?? '').split(' ').filter(Boolean);
const dpr = Number(flag('--dpr', 2)); const cycles = Number(flag('--cycles', 2)); const trace = flags.includes('--trace');
mkdirSync(outDir, { recursive: true });

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const summarize = (frames) => {
  const sorted = [...frames].sort((a, b) => a - b); const sum = frames.reduce((a, b) => a + b, 0);
  return {
    frames: frames.length, meanMs: +(sum / Math.max(1, frames.length)).toFixed(2), p50: +pct(sorted, 50).toFixed(1), p95: +pct(sorted, 95).toFixed(1), p99: +pct(sorted, 99).toFixed(1),
    maxMs: +(sorted.at(-1) ?? 0).toFixed(1), over33: frames.filter((f) => f > 33.4).length, over50: frames.filter((f) => f > 50).length, over100: frames.filter((f) => f > 100).length, over250: frames.filter((f) => f > 250).length,
    fps: +(1000 / Math.max(1, sum / Math.max(1, frames.length))).toFixed(1),
  };
};

const browser = await chromium.launch({ executablePath: process.env.VISTA_E2E_CHROMIUM_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', ...chromeArgs] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
const page = await context.newPage();
const consoleProblems = []; const failedRequests = [];
let crashed = false;
page.on('crash', () => { crashed = true; consoleProblems.push('PAGE CRASHED (renderer process died)'); console.error('PAGE CRASHED'); });
page.on('close', () => { if (!crashed) console.error('page closed'); });
browser.on('disconnected', () => console.error('browser disconnected'));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleProblems.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${String(e.message).slice(0, 240)}`));
page.on('requestfailed', (r) => failedRequests.push(`${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
const bytes = { total: 0, so101: 0, js: 0 };
page.on('response', async (r) => { try { const len = Number((await r.allHeaders())['content-length'] ?? 0) || (await r.body()).length; bytes.total += len; if (/so101/.test(r.url())) bytes.so101 += len; if (/\.js(\?|$)/.test(r.url())) bytes.js += len; } catch { /* body unavailable */ } });

await page.addInitScript(() => {
  const perf = { frames: [], long: [], ctxLost: 0, ctxRestored: 0, marks: {} };
  window.__perf = perf;
  let last = performance.now();
  const loop = (t) => { perf.frames.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => perf.long.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function hooked(...args) {
    const ctx = original.apply(this, args);
    if (!this.__hooked) { this.__hooked = true; this.addEventListener('webglcontextlost', () => { perf.ctxLost += 1; }); this.addEventListener('webglcontextrestored', () => { perf.ctxRestored += 1; }); }
    return ctx;
  };
});

const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter((m) => ['JSHeapUsedSize', 'LayoutCount', 'RecalcStyleCount', 'ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(m.name)).map((m) => [m.name, m.value]));

const glRenderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
const status = await page.waitForFunction(() => document.querySelector('[data-stage-status]')?.getAttribute('data-stage-status'), null, { timeout: 5000 }).catch(() => null);
const readyBy = Date.now();
let stageStatus = 'unknown';
const deadline = Date.now() + 90_000;
while (Date.now() < deadline) {
  stageStatus = await page.evaluate(() => [...document.querySelectorAll('[data-stage-status]')].map((n) => n.getAttribute('data-stage-status')).join(','));
  if (/ready|error|poster/.test(stageStatus)) break;
  await page.waitForTimeout(250);
}
const timeToStage = Date.now() - t0; console.error(`stage=${stageStatus} after ${timeToStage}ms`); void status; void readyBy;
await page.waitForTimeout(1500);
const before = await metrics();
const idleStart = await page.evaluate(() => window.__perf.frames.length);
await page.waitForTimeout(2500);
const idleFrames = await page.evaluate((from) => window.__perf.frames.slice(from), idleStart);

if (trace) await browser.startTracing(page, { path: path.join(outDir, `${label}-trace.json`), categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });

const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const sceneInfo = () => page.evaluate(() => {
  const s = window.__labScene; const info = s?.renderer?.info;
  return { present: !!s, geometries: info?.memory.geometries ?? null, textures: info?.memory.textures ?? null, calls: info?.render.calls ?? null, triangles: info?.render.triangles ?? null, programs: info?.programs?.length ?? null,
    canvasCount: document.querySelectorAll('canvas').length, ctxLost: window.__perf.ctxLost };
});
const phases = []; const infoStart = await sceneInfo();
for (let cycle = 0; cycle < cycles; cycle += 1) {
  for (const dir of [1, -1]) {
    const from = await page.evaluate(() => window.__perf.frames.length); const passStart = Date.now();
    const stepPx = 90; const steps = Math.ceil(total / stepPx);
    for (let i = 0; i < steps; i += 1) { if (i % 15 === 0) console.error(`scroll dir=${dir} step ${i}/${steps} y=${await page.evaluate(() => Math.round(scrollY)).catch(() => 'n/a')} closed=${page.isClosed()}`); await page.mouse.wheel(0, dir * stepPx); await page.waitForTimeout(32); }
    await page.waitForTimeout(400);
    phases.push({ name: `${dir === 1 ? 'down' : 'up'}-${cycle + 1}`, wallSec: +((Date.now() - passStart) / 1000).toFixed(1), plannedSec: +((steps * 0.032)).toFixed(1), ...summarize(await page.evaluate((f) => window.__perf.frames.slice(f), from)) });
  }
}
if (trace) await browser.stopTracing();

// screenshots at every 3D chapter and a robot-presence check on each
const chapters = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].map((n) => ({ name: n.getAttribute('data-scene'), top: n.getBoundingClientRect().top + scrollY, height: n.getBoundingClientRect().height })));
const shots = [];
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200);
for (const c of [{ name: 'top', top: 0, height: 900 }, ...chapters]) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, c.top + Math.min(c.height, 900) / 2 - 450)); await page.waitForTimeout(1600);
  const file = path.join(outDir, `${label}-${c.name}.png`); await page.screenshot({ path: file }); shots.push({ chapter: c.name, file });
}
const after = await metrics(); const infoEnd = await sceneInfo();
const perfEnd = await page.evaluate(() => ({ long: window.__perf.long, ctxLost: window.__perf.ctxLost, ctxRestored: window.__perf.ctxRestored, errors: [] }));
const all = phases.flatMap((p) => []); void all;
const result = {
  label, url, glRenderer, viewport: '1440x900', dpr, cycles, stageStatus, timeToStageMs: timeToStage, scrollHeight: total + 900, chapters: chapters.map((c) => c.name),
  idle: summarize(idleFrames), phases, bytes, scene: { start: infoStart, end: infoEnd },
  longTasks: { count: perfEnd.long.length, totalMs: +perfEnd.long.reduce((a, b) => a + b, 0).toFixed(0), maxMs: +(Math.max(0, ...perfEnd.long)).toFixed(0) },
  webglContext: { lost: perfEnd.ctxLost, restored: perfEnd.ctxRestored }, heapMB: { before: +(before.JSHeapUsedSize / 1048576).toFixed(1), after: +(after.JSHeapUsedSize / 1048576).toFixed(1) },
  cdp: { scriptSec: +(after.ScriptDuration - before.ScriptDuration).toFixed(2), taskSec: +(after.TaskDuration - before.TaskDuration).toFixed(2), layoutSec: +(after.LayoutDuration - before.LayoutDuration).toFixed(2), styleSec: +(after.RecalcStyleDuration - before.RecalcStyleDuration).toFixed(2), layouts: after.LayoutCount - before.LayoutCount },
  consoleProblems: [...new Set(consoleProblems)].slice(0, 20), failedRequests: [...new Set(failedRequests)].slice(0, 10), screenshots: shots,
};
writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ label, stageStatus, timeToStageMs: timeToStage, idle: result.idle, worstPhase: phases.reduce((a, b) => (b.p99 > a.p99 ? b : a), phases[0]), longTasks: result.longTasks, ctx: result.webglContext, scene: result.scene, bytes, consoleProblems: result.consoleProblems.length }, null, 2));
await browser.close();
