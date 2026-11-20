import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Deterministic Blockly helpers: every wait is on OBSERVABLE STATE (an element's geometry stopped changing across animation
 * frames, a block count changed), never on a fixed delay. Blockly animates the flyout opening, the workspace scroll and block
 * snapping; those animations end when the geometry is identical for several consecutive frames.
 */
export async function waitForStableGeometry(target: Locator, frames = 6, timeoutMs = 8000) {
  await target.evaluate((el, [needed, limit]) => new Promise<void>((resolve, reject) => {
    const started = performance.now(); let previous = ''; let same = 0;
    const tick = () => {
      const r = el.getBoundingClientRect(); const key = `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`;
      same = key === previous ? same + 1 : 0; previous = key;
      if (same >= (needed as number)) return resolve();
      if (performance.now() - started > (limit as number)) return reject(new Error(`geometry never settled (${key})`));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [frames, timeoutMs] as [number, number]);
}

/** The Blockly editor is usable: injected SVG, toolbox rendered with categories, and its geometry settled. */
export async function waitForBlocklyReady(page: Page) {
  await expect(page.locator('.blocklySvg')).toBeVisible();
  await expect.poll(() => page.locator('.blocklyToolboxCategory').count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await waitForStableGeometry(page.locator('.blocklyToolboxCategory').first());
  await waitForStableGeometry(page.locator('.blocklySvg').first());
}

export const workspaceBlocks = (page: Page) => page.locator('svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas g.blocklyDraggable');

export async function dragFromFlyout(page: Page, category: string, blockText: RegExp, to: { x: number; y: number }) {
  const before = await workspaceBlocks(page).count();
  const cat = page.locator('.blocklyToolboxCategory', { hasText: category });
  await expect(cat).toBeVisible(); await cat.click();
  const blocks = page.locator('.blocklyFlyout .blocklyBlockCanvas > g.blocklyDraggable');
  await expect.poll(() => blocks.count(), { timeout: 8000 }).toBeGreaterThan(0);
  const texts = await blocks.allTextContents(); const index = texts.findIndex((t) => blockText.test(t));
  expect(index, `flyout ${category}: ${JSON.stringify(texts)}`).toBeGreaterThanOrEqual(0);
  const block = blocks.nth(index);
  await waitForStableGeometry(block);                                                            // the flyout has finished opening/scrolling
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + 12); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => workspaceBlocks(page).count(), { message: `block "${blockText}" was dropped on the workspace`, timeout: 8000 }).toBe(before + 1);
  await settleWorkspace(page);
}

/** After a drop: the newest block stopped moving (snap animation finished), so the next target position can be measured. */
export async function settleWorkspace(page: Page) {
  const all = workspaceBlocks(page); const n = await all.count();
  for (let i = 0; i < n; i += 1) await waitForStableGeometry(all.nth(i), 4);
}

export async function blockBox(page: Page, text: RegExp) {
  const rects = await workspaceBlocks(page).evaluateAll((els, source) => els.filter((el) => new RegExp(source).test(el.textContent ?? '')).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), text.source);
  expect(rects.length, `block ${text}`).toBeGreaterThan(0);
  return rects.sort((a, b) => a.width * a.height - b.width * b.height)[0];
}
