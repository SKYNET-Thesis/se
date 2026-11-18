// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopDownloadChapter, detectDesktopPlatform } from './DesktopDownloadChapter';

vi.mock('../home/useReveal', () => ({ useReveal: () => ({ current: null }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('detectDesktopPlatform', () => {
  it('detects Windows', () => expect(detectDesktopPlatform('Mozilla Windows NT 10.0', 'Win32')).toBe('windows'));
  it('detects macOS', () => expect(detectDesktopPlatform('Mozilla Macintosh Mac OS X', 'MacIntel')).toBe('macos'));
  it('detects Linux but excludes Android', () => {
    expect(detectDesktopPlatform('Mozilla X11 Linux x86_64')).toBe('linux');
    expect(detectDesktopPlatform('Mozilla Linux Android 14')).toBeNull();
  });
  it.each([
    ['iPhone / iOS', 'Mozilla iPhone; CPU iPhone OS 18_0 like Mac OS X', 'iPhone'],
    ['iPadOS desktop mode', 'Mozilla Macintosh Mac OS X', 'iPad'],
    ['Android', 'Mozilla Linux Android 14', 'Linux armv8l'],
    ['unknown platform', 'Mozilla iPad', ''],
  ])('returns no desktop recommendation for %s', (_label, userAgent, platform) => {
    expect(detectDesktopPlatform(userAgent, platform)).toBeNull();
  });
});

describe('DesktopDownloadChapter', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla Windows NT 10.0', platform: 'Win32' });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const render = async () => act(async () => { root.render(<DesktopDownloadChapter />); await Promise.resolve(); });

  it('keeps all platforms visible, recommends detected OS, and allows manual selection', async () => {
    await render();
    expect(container.querySelectorAll('article')).toHaveLength(3);
    expect(container.textContent).toContain('Recommended');
    const linux = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Linux')!;
    act(() => linux.click()); expect(linux.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows unavailable artifact states with no download links', async () => {
    await render();
    expect(container.querySelectorAll('button[disabled]')).toHaveLength(3);
    expect(container.textContent).toContain('No verified Windows release artifact');
    expect(container.querySelectorAll('a[href*="download"]')).toHaveLength(0);
  });

  it('switches installation tabs and provides the navigation anchor', async () => {
    await render();
    const commandTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Command Line')!;
    act(() => commandTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Command-line installation');
    const guideTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Installation Guide')!;
    act(() => guideTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Desktop installation instructions');
    expect(container.querySelector('#v2-download')).toBeTruthy();
  });

  it('moves tab selection with the keyboard', async () => {
    await render();
    const apps = container.querySelector('[role="tab"][aria-selected="true"]')!;
    act(() => apps.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(container.querySelector('#install-tab-command-line')?.getAttribute('aria-selected')).toBe('true');
  });
});
