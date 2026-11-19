import { expect, type Page } from '@playwright/test';

export async function dragFromFlyout(page: Page, category: string, blockText: RegExp, to: { x: number; y: number }) {
  const cat = page.locator('.blocklyToolboxCategory', { hasText: category });
  await expect(cat).toBeVisible(); await page.waitForTimeout(500); await cat.click();
  const blocks = page.locator('.blocklyFlyout .blocklyBlockCanvas > g.blocklyDraggable');
  await expect.poll(() => blocks.count(), { timeout: 8000 }).toBeGreaterThan(0); await page.waitForTimeout(600);
  const texts = await blocks.allTextContents(); const index = texts.findIndex((t) => blockText.test(t));
  expect(index, `flyout ${category}: ${JSON.stringify(texts)}`).toBeGreaterThanOrEqual(0);
  const block = blocks.nth(index);
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + 12); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
}
export const workspaceBlocks = (page: Page) => page.locator('svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas g.blocklyDraggable');

export async function blockBox(page: Page, text: RegExp) {
  const rects = await workspaceBlocks(page).evaluateAll((els, source) => els.filter((el) => new RegExp(source).test(el.textContent ?? '')).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), text.source);
  expect(rects.length, `block ${text}`).toBeGreaterThan(0);
  return rects.sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

