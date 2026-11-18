import { useEffect, useState } from 'react';
import { useReveal } from '../home/useReveal';

export type DesktopPlatform = 'windows' | 'macos' | 'linux';
export type InstallTab = 'apps' | 'command-line' | 'guide';

/** Browser platform hints are only evaluated after mount, so server and initial client output match. */
export function detectDesktopPlatform(userAgent: string, platformHint = ''): DesktopPlatform | null {
  const value = `${userAgent} ${platformHint}`.toLowerCase();
  // iOS browsers may report a Mac-like user agent, especially iPadOS in desktop mode.
  if (/iphone|ipad|ipod/.test(value)) return null;
  if (/windows|win32|win64/.test(value)) return 'windows';
  if (/macintosh|mac os|macintel|macppc|mac68k/.test(value)) return 'macos';
  if (/linux|x11/.test(value) && !/android/.test(value)) return 'linux';
  return null;
}

const PLATFORMS: Array<{ id: DesktopPlatform; name: string; package: string; detail: string }> = [
  { id: 'windows', name: 'Windows', package: '.exe', detail: 'Windows desktop installer' },
  { id: 'macos', name: 'macOS', package: '.dmg or .zip', detail: 'Apple Silicon and Intel builds unavailable' },
  { id: 'linux', name: 'Linux', package: '.deb', detail: 'Supported distributions and packages unavailable' },
];
const TABS: Array<{ id: InstallTab; label: string }> = [
  { id: 'apps', label: 'Apps' }, { id: 'command-line', label: 'Command Line' }, { id: 'guide', label: 'Installation Guide' },
];

function moveTabFocus(event: React.KeyboardEvent<HTMLDivElement>, current: InstallTab, setTab: (tab: InstallTab) => void) {
  const currentIndex = TABS.findIndex((item) => item.id === current);
  const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  const next = TABS[(currentIndex + direction + TABS.length) % TABS.length];
  setTab(next.id);
  document.getElementById(`install-tab-${next.id}`)?.focus();
}

export function DesktopDownloadChapter() {
  const reveal = useReveal<HTMLElement>(0.15);
  const [detected, setDetected] = useState<DesktopPlatform | null>(null);
  const [selected, setSelected] = useState<DesktopPlatform | null>(null);
  const [tab, setTab] = useState<InstallTab>('apps');

  useEffect(() => {
    const platform = detectDesktopPlatform(navigator.userAgent, navigator.platform);
    setDetected(platform);
    setSelected(platform);
  }, []);

  return (
    <section id="v2-download" ref={reveal} aria-labelledby="v2-download-title" className="v2-anchor v2-reveal relative z-10 border-t border-[var(--v2-line)] px-[var(--v2-margin)] py-[var(--v2-section)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="v2-mono text-[12px] uppercase tracking-[0.16em] text-[var(--v2-teal)]">Quick Start</p>
            <h2 id="v2-download-title" data-reveal className="v2-display mt-4 text-[var(--v2-head)] font-medium">Download VISTA Desktop</h2>
          </div>
          <p data-reveal className="max-w-[46ch] text-[15px] leading-6 text-[var(--v2-muted)]">Choose your platform. VISTA desktop installers are not available yet; this page will list verified builds when they are published.</p>
        </div>

        <div className="mt-10 flex flex-wrap gap-2 border-b border-[var(--v2-line-strong)]" role="tablist" aria-label="Installation options" onKeyDown={(event) => moveTabFocus(event, tab, setTab)}>
          {TABS.map((item) => (
            <button key={item.id} id={`install-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="install-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}
              className={`min-h-11 border-b-2 px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-teal)] ${tab === item.id ? 'border-[var(--v2-teal)] text-[var(--v2-text)]' : 'border-transparent text-[var(--v2-muted)] hover:text-[var(--v2-text)]'}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div id="install-panel" role="tabpanel" aria-labelledby={`install-tab-${tab}`} className="pt-7">
          {tab === 'apps' && <>
            <p className="mb-5 text-sm text-[var(--v2-muted)]">{detected ? `${PLATFORMS.find((item) => item.id === detected)?.name} detected. All platforms remain available to select.` : 'Select a platform. All options are shown.'}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {PLATFORMS.map((item) => {
                const recommended = item.id === detected;
                const active = selected === item.id;
                return <article key={item.id} className={`relative flex min-h-[244px] flex-col border bg-[var(--v2-graphite)] p-5 transition-colors duration-200 ${active ? 'border-[var(--v2-teal)]/70' : 'border-[var(--v2-line-strong)] hover:border-[var(--v2-muted)]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" aria-pressed={active} onClick={() => setSelected(item.id)} className="text-left text-lg font-medium text-[var(--v2-text)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-teal)]">{item.name}</button>
                    {recommended && <span className="v2-mono border border-[var(--v2-teal)]/40 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--v2-teal)]">Recommended</span>}
                  </div>
                  <p className="v2-mono mt-4 text-xs text-[var(--v2-soft)]">{item.package}</p>
                  <p className="mt-2 text-sm leading-5 text-[var(--v2-muted)]">{item.detail}</p>
                  <div className="mt-auto pt-6">
                    <button type="button" disabled aria-describedby={`unavailable-${item.id}`} className="inline-flex min-h-11 w-full items-center justify-center border border-[var(--v2-line-strong)] bg-[var(--v2-graphite-2)] px-4 text-sm font-medium text-[var(--v2-muted)] disabled:cursor-not-allowed">Download unavailable</button>
                    <p id={`unavailable-${item.id}`} className="mt-2 text-xs text-[var(--v2-muted)]">No verified {item.name} release artifact is published.</p>
                  </div>
                </article>;
              })}
            </div>
          </>}
          {tab === 'command-line' && <div className="max-w-3xl border border-[var(--v2-line-strong)] bg-[var(--v2-graphite)] p-5 md:p-7"><h3 className="text-base font-medium">Command-line installation</h3><p className="mt-3 text-sm leading-6 text-[var(--v2-muted)]">No supported package or verified installation command is published yet. Linux distributions have different package formats; check back when VISTA lists supported builds.</p></div>}
          {tab === 'guide' && <div className="max-w-3xl border border-[var(--v2-line-strong)] bg-[var(--v2-graphite)] p-5 md:p-7"><h3 className="text-base font-medium">Installation guide</h3><p className="mt-3 text-sm leading-6 text-[var(--v2-muted)]">Desktop installation instructions will be published with the first signed, verified installers.</p></div>}
        </div>
        <p className="mt-8 text-xs text-[var(--v2-muted)]">No files download automatically. Select a platform to see its status.</p>
      </div>
    </section>
  );
}
