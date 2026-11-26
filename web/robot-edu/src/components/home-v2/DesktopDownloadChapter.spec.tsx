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

  it('shows Ubuntu amd64 plus Windows and macOS as Coming Soon, with no AppImage', async () => {
    await render();
    expect(container.querySelectorAll('article')).toHaveLength(3);
    expect(container.textContent).toContain('Ubuntu'); expect(container.textContent).toContain('amd64');
    expect(container.textContent).toContain('Windows'); expect(container.textContent).toContain('macOS');
    expect(container.textContent?.match(/Coming Soon/g)?.length).toBeGreaterThanOrEqual(4);
    expect(container.textContent).not.toMatch(/AppImage(?! )/); // only the guide's "There is no AppImage." statement may mention it
    expect(container.textContent).not.toMatch(/\.exe|\.dmg/);
  });

  it('does not recommend Ubuntu on Windows but does on Linux', async () => {
    await render();
    expect(container.textContent).not.toContain('Recommended');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla X11 Linux x86_64', platform: 'Linux x86_64' });
    act(() => root.unmount()); root = createRoot(container);
    await render();
    expect(container.textContent).toContain('Recommended');
  });

  const openCommandTab = () => {
    const commandTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Command Line')!;
    act(() => commandTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };

  it('offers the verified Ubuntu DEB: active download, version, size, direct link', async () => {
    await render();
    const link = container.querySelector('a[href="https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb"]');
    expect(link?.textContent).toBe('Download DEB');
    expect(container.textContent).toContain('v0.1.0');
    expect(container.textContent).toContain('125.3 MiB (131,395,882 bytes)');
    expect([...container.querySelectorAll('button[disabled]')].map((b) => b.textContent)).toEqual(['Coming Soon', 'Coming Soon']); // Windows and macOS only
    expect(container.textContent).not.toContain('not yet publicly available');
  });

  it('shows terminal, checksum and launch commands with working Copy buttons for the verified release', async () => {
    await render(); openCommandTab();
    expect(container.textContent).toContain('curl -fL "https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb" -o /tmp/vista-lab-station.deb');
    expect(container.textContent).toContain('echo "a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4  /tmp/vista-lab-station.deb" | sha256sum -c -');
    expect(container.textContent).toContain('sudo apt install /tmp/vista-lab-station.deb');
    expect(container.textContent).toContain('gtk-launch vista-lab-station');
    const copies = [...container.querySelectorAll('button')].filter((button) => button.textContent === 'Copy');
    expect(copies).toHaveLength(5); expect(copies.every((button) => !button.disabled)).toBe(true);
  });

  it('keeps the download unavailable when verification metadata is absent: disabled controls, no download link, no hard-coded checksum', async () => {
    vi.resetModules();
    vi.doMock('./desktopRelease', async (importOriginal) => {
      const real = await importOriginal<typeof import('./desktopRelease')>();
      return { ...real, DESKTOP_RELEASE: { ...real.DESKTOP_RELEASE, verification: null } };
    });
    const { DesktopDownloadChapter: Unverified } = await import('./DesktopDownloadChapter');
    await act(async () => { root.render(<Unverified />); await Promise.resolve(); });
    expect(container.querySelectorAll('a[href*="github.com"]')).toHaveLength(0);
    expect([...container.querySelectorAll('button[disabled]')].map((b) => b.textContent)).toEqual(['Download unavailable', 'Coming Soon', 'Coming Soon']);
    expect(container.textContent).toContain('not yet publicly available');
    openCommandTab();
    const copies = [...container.querySelectorAll('button')].filter((button) => button.textContent === 'Copy');
    expect(copies).toHaveLength(4); expect(copies.every((button) => button.disabled)).toBe(true);
    expect(container.textContent).not.toMatch(/[0-9a-f]{64}/);
    vi.doUnmock('./desktopRelease');
  });

  it('switches installation tabs and provides the navigation anchor', async () => {
    await render();
    const commandTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Command Line')!;
    act(() => commandTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Command-line installation');
    const guideTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Installation Guide')!;
    act(() => guideTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('System requirements');
    expect(container.textContent).toContain('Installation guide');
    expect(container.querySelector('#v2-download')).toBeTruthy();
  });

  it('moves tab selection with the keyboard', async () => {
    await render();
    const apps = container.querySelector('[role="tab"][aria-selected="true"]')!;
    act(() => apps.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(container.querySelector('#install-tab-command-line')?.getAttribute('aria-selected')).toBe('true');
  });
});
