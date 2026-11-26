/**
 * Public Desktop release metadata shown on the Homepage. Ubuntu amd64 DEB only (no Windows, macOS or AppImage artifact exists).
 * `verification` is set only after the published release has been checked anonymously (download, filename, size, SHA256SUMS, package
 * version and architecture). While it is null the page shows "unavailable" and offers no download or copy action.
 * Verified 2026-11-26 against the public GitHub release v0.1.0 (anonymous download HTTP 200; the downloaded file's size and SHA-256 match
 * the published SHA256SUMS and BUILD_PROVENANCE.txt; `dpkg-deb`: Package vista-lab-station, Version 0.1.0, Architecture amd64).
 */
export interface DesktopReleaseVerification { verifiedAt: string; sizeBytes: number; sha256: string }
export interface DesktopRelease { version: string; platformLabel: string; filename: string; url: string; checksumsUrl: string; verification: DesktopReleaseVerification | null }

const BASE = 'https://github.com/leduc121/vista_lab/releases/download/v0.1.0';
export const DESKTOP_RELEASE: DesktopRelease = {
  version: '0.1.0',
  platformLabel: 'Ubuntu (amd64)',
  filename: 'VISTA.Lab.Station-0.1.0-amd64.deb',
  url: `${BASE}/VISTA.Lab.Station-0.1.0-amd64.deb`,
  checksumsUrl: `${BASE}/SHA256SUMS`,
  verification: { verifiedAt: '2026-11-26', sizeBytes: 131395882, sha256: 'a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4' },
};

export const releaseAvailable = (release: DesktopRelease) => release.verification !== null;
export const downloadCommand = (release: DesktopRelease) => `curl -fL "${release.url}" -o /tmp/vista-lab-station.deb`;
export const installCommand = 'sudo apt install /tmp/vista-lab-station.deb';
export const launchCommand = 'gtk-launch vista-lab-station';
/** Compares the downloaded package with the published SHA256SUMS line for its original filename. */
export const checksumCommand = (release: DesktopRelease) =>
  `curl -fL "${release.checksumsUrl}" -o /tmp/SHA256SUMS && grep -F "${release.filename}" /tmp/SHA256SUMS | awk '{print $1"  /tmp/vista-lab-station.deb"}' | sha256sum -c -`;
/** Human-readable size (binary units) for the verified package. */
export const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB (${bytes.toLocaleString('en-US')} bytes)`;
/** Compares the downloaded package with the checksum verified at release time. */
export const verifiedChecksumCommand = (release: DesktopRelease) =>
  release.verification ? `echo "${release.verification.sha256}  /tmp/vista-lab-station.deb" | sha256sum -c -` : '';
