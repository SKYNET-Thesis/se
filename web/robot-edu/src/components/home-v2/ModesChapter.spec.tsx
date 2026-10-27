import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModesChapter } from './ModesChapter';
import { V2SceneProvider } from './V2Scene';

// Node has no WebGL, so this renders the production-safe poster path.
const html = renderToStaticMarkup(<V2SceneProvider><ModesChapter /></V2SceneProvider>);
const count = (re: RegExp) => (html.match(re) ?? []).length;

describe('ModesChapter (server render, no WebGL)', () => {
  it('keeps its anchor and is a 3D window of the shared scene', () => {
    expect(html).toContain('id="v2-modes"');
    expect(html).toContain('data-scene="modes"');
    expect(count(/data-stage-window/g)).toBe(1);
    expect(count(/<canvas/g)).toBe(0);
  });
  it('is an accessible tablist with one selected tab and roving tabindex', () => {
    expect(html).toContain('role="tablist"');
    expect(count(/role="tab"/g)).toBe(3);
    expect(count(/aria-selected="true"/g)).toBe(1);
    expect(html).toMatch(/id="v2-modes-tab-program"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(count(/tabindex="-1"/g)).toBeGreaterThanOrEqual(2);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls="v2-modes-panel"');
    expect(html).toContain('aria-labelledby="v2-modes-tab-program"');
  });
  it('shows the physical robot locked on the stage, and the experience it is', () => {
    expect(html).toContain('Physical robot locked');
    expect(html).toContain('In Practice');
    expect(html).toContain('Play all four');
  });
  it('says the live arm is not shown when there is no WebGL, and the poster path is used', () => {
    expect(html).toContain('The live 3D arm is not shown here');
    expect(html).toContain('data-stage-status="poster"');
  });
  it('renders every experience layer, with only the chosen one exposed', () => {
    expect(count(/v2-modes-layer/g)).toBe(3);
    expect(count(/class="v2-modes-layer absolute inset-0 is-on"/g)).toBe(1);
  });
});
