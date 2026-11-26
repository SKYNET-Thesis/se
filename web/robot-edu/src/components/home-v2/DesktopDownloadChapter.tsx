import { useEffect, useState } from 'react';
import { useReveal } from '../home/useReveal';
import { DESKTOP_RELEASE, checksumCommand, downloadCommand, formatSize, installCommand, launchCommand, releaseAvailable, verifiedChecksumCommand } from './desktopRelease';

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

const TABS: Array<{ id: InstallTab; label: string }> = [
  { id: 'apps', label: 'Apps' }, { id: 'command-line', label: 'Command Line' }, { id: 'guide', label: 'Installation Guide' },
];

const COMING_SOON = [{ id: 'windows', name: 'Windows' }, { id: 'macos', name: 'macOS' }] as const;

function CommandBlock({ label, command, enabled }: { label: string; command: string; enabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(command); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } };
  return <div className="mt-5">
    <p className="text-xs font-medium text-[var(--v2-text)]">{label}</p>
    <div className="mt-2 flex items-start gap-2">
      <pre className="v2-mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all border border-[var(--v2-line-strong)] bg-[var(--v2-graphite-2)] p-3 text-xs text-[var(--v2-soft)]"><code>{command}</code></pre>
      <button type="button" disabled={!enabled} onClick={() => void copy()} aria-label={`Copy command: ${label}`} className="inline-flex min-h-11 shrink-0 items-center border border-[var(--v2-line-strong)] px-3 text-xs font-medium text-[var(--v2-text)] disabled:cursor-not-allowed disabled:text-[var(--v2-muted)]">{copied ? 'Copied' : 'Copy'}</button>
    </div>
  </div>;
}

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
  const available = releaseAvailable(DESKTOP_RELEASE);

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
          <p data-reveal className="max-w-[46ch] text-[15px] leading-6 text-[var(--v2-muted)]">VISTA Lab Station for Ubuntu (amd64). The download is enabled only after the published release has been verified.</p>
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
            <p className="mb-5 text-sm text-[var(--v2-muted)]">{detected === 'linux' ? 'Linux detected. The Ubuntu package is the only supported download.' : 'VISTA Lab Station is available for Ubuntu (amd64) only. Windows and macOS are not yet available.'}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <article className={`relative flex min-h-[244px] flex-col border bg-[var(--v2-graphite)] p-5 ${selected === 'linux' ? 'border-[var(--v2-teal)]/70' : 'border-[var(--v2-line-strong)]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" aria-pressed={selected === 'linux'} onClick={() => setSelected('linux')} className="text-left text-lg font-medium text-[var(--v2-text)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-teal)]">Ubuntu</button>
                  {detected === 'linux' && <span className="v2-mono border border-[var(--v2-teal)]/40 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--v2-teal)]">Recommended</span>}
                </div>
                <p className="v2-mono mt-4 text-xs text-[var(--v2-soft)]">{DESKTOP_RELEASE.platformLabel} · .deb · v{DESKTOP_RELEASE.version}</p>
                {DESKTOP_RELEASE.verification && <p className="v2-mono mt-1 text-xs text-[var(--v2-soft)]">{formatSize(DESKTOP_RELEASE.verification.sizeBytes)}</p>}
                <p className="mt-2 text-sm leading-5 text-[var(--v2-muted)]">VISTA Lab Station: the student Simulation Lab for Ubuntu. The Simulation Profile runs on its own; the Robotics Profile needs an external Python environment (see Requirements).</p>
                <div className="mt-auto pt-6">
                  {available
                    ? <a href={DESKTOP_RELEASE.url} className="inline-flex min-h-11 w-full items-center justify-center border border-[var(--v2-teal)] bg-[var(--v2-teal)]/10 px-4 text-sm font-medium text-[var(--v2-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-teal)]">Download DEB</a>
                    : <><button type="button" disabled aria-describedby="unavailable-linux" className="inline-flex min-h-11 w-full items-center justify-center border border-[var(--v2-line-strong)] bg-[var(--v2-graphite-2)] px-4 text-sm font-medium text-[var(--v2-muted)] disabled:cursor-not-allowed">Download unavailable</button>
                      <p id="unavailable-linux" className="mt-2 text-xs text-[var(--v2-muted)]">The Ubuntu release is not yet publicly available. The download is enabled only after the published file and its checksum are verified.</p></>}
                </div>
              </article>
              {COMING_SOON.map((item) => <article key={item.id} className="relative flex min-h-[244px] flex-col border border-[var(--v2-line-strong)] bg-[var(--v2-graphite)] p-5">
                <h3 className="text-lg font-medium text-[var(--v2-text)]">{item.name}</h3>
                <p className="v2-mono mt-4 text-xs text-[var(--v2-soft)]">Coming Soon</p>
                <p className="mt-2 text-sm leading-5 text-[var(--v2-muted)]">{item.name} is not yet available.</p>
                <div className="mt-auto pt-6"><button type="button" disabled className="inline-flex min-h-11 w-full items-center justify-center border border-[var(--v2-line-strong)] bg-[var(--v2-graphite-2)] px-4 text-sm font-medium text-[var(--v2-muted)] disabled:cursor-not-allowed">Coming Soon</button></div>
              </article>)}
            </div>
          </>}
          {tab === 'command-line' && <div className="max-w-3xl border border-[var(--v2-line-strong)] bg-[var(--v2-graphite)] p-5 md:p-7">
            <h3 className="text-base font-medium">Command-line installation (Ubuntu amd64)</h3>
            {!available && <p className="mt-3 text-sm text-[var(--v2-muted)]" role="status">These commands are shown for reference. They will only work once the Ubuntu release is publicly available; copying is disabled until then.</p>}
            <CommandBlock label="1. Download" command={downloadCommand(DESKTOP_RELEASE)} enabled={available} />
            {DESKTOP_RELEASE.verification && <p className="mt-4 text-xs text-[var(--v2-muted)]">Verified SHA-256: <code className="v2-mono break-all text-[var(--v2-text)]">{DESKTOP_RELEASE.verification.sha256}</code></p>}
            <CommandBlock label="2. Verify the checksum (expect “OK”)" command={available ? verifiedChecksumCommand(DESKTOP_RELEASE) : checksumCommand(DESKTOP_RELEASE)} enabled={available} />
            {available && <CommandBlock label="2b. Or compare with the published SHA256SUMS (expect “OK”)" command={checksumCommand(DESKTOP_RELEASE)} enabled />}
            <CommandBlock label="3. Install" command={installCommand} enabled={available} />
            <CommandBlock label="4. Launch" command={launchCommand} enabled={available} />
          </div>}
          {tab === 'guide' && <div className="max-w-3xl space-y-6 border border-[var(--v2-line-strong)] bg-[var(--v2-graphite)] p-5 text-sm leading-6 text-[var(--v2-muted)] md:p-7">
            <h3 className="text-base font-medium text-[var(--v2-text)]">Installation guide</h3>
            <div><h4 className="font-medium text-[var(--v2-text)]">System requirements</h4><ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Ubuntu or Debian-based Linux, amd64 (x86_64). Tested on Ubuntu 26.04.1; other releases are not claimed.</li>
              <li>Internet access for the download and for APT to fetch dependencies.</li>
              <li>Simulation Profile: no GPU or CUDA required.</li>
              <li>Robotics Profile (optional, advanced): an operator-managed Python 3.12.14 environment and an authorized VISTA Edge checkout, selected in Desktop Settings. It is not bundled.</li>
              <li>Physical robot operation is not certified by this release.</li>
            </ul></div>
            <div><h4 className="font-medium text-[var(--v2-text)]">Steps</h4><ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Download the DEB and verify its checksum against the published <code className="v2-mono">SHA256SUMS</code> (Command Line tab).</li>
              <li>Install with <code className="v2-mono">sudo apt install /tmp/vista-lab-station.deb</code>; APT resolves the dependencies.</li>
              <li>Launch “VISTA Lab Station” from the application menu or with <code className="v2-mono">gtk-launch vista-lab-station</code>.</li>
              <li>Sign in with your student account; assignments and evidence stay in the VISTA web app.</li>
            </ol></div>
            <p>Windows and macOS builds are not yet available. There is no AppImage.</p>
          </div>}
        </div>
        <p className="mt-8 text-xs text-[var(--v2-muted)]">No files download automatically. Select a platform to see its status.</p>
      </div>
    </section>
  );
}
