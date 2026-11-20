# VISTA Desktop — audit, architecture proposal and release plan

Status: **proposal for approval. Nothing is implemented, built, signed or published.** Audited at `origin/main` `b0bd6d4` on 2026-11-18.

## 1. Audit: what exists
| Question | Finding (evidence) |
|---|---|
| Electron / Tauri / native app? | **None.** No `electron`, `electron-builder`, `@electron-forge/*`, `@tauri-apps/*`, `Cargo.toml`, `tauri.conf.json`, NSIS/WiX/DMG/AppImage files and no desktop dependency in any `package.json`. |
| Existing packaging / release workflows? | **None.** No workflow mentions desktop, installer, dmg, exe, deb, electron or tauri. |
| Desktop launcher / robot client? | None. `apps/mobile` (Expo) and the web app (`web/robot-edu`, Vite + React 18) are the only clients. |
| Public download UI | `web/robot-edu/src/components/home-v2/DesktopDownloadChapter.tsx` (owned by Codex): lists Windows `.exe`, macOS `.dmg or .zip`, Linux `.deb`, and states "No verified … release artifact is published". It must keep doing so until a verified manifest exists. |
| Reusable runtime pieces | `web/robot-edu` (Blockly workspace, 3D SO-101 preview, Practice flow), `services/robot-runtime` (Python/FastAPI, private execution boundary to CHECKIK, `hardwareEnabled=false` by default, no raw joints/serial exposed), `services/robot-hardware-adapter` (Python/FastAPI + `operator_cli`, calibration), `services/digital-twin` (Python/FastAPI telemetry), `edge/raspberry-pi-agent`. |

Conclusion: a desktop app does **not** exist; the smallest viable one is a thin shell around the existing web app plus an optional local robot runtime. No framework has been implemented.

## 2. Electron vs Tauri for VISTA
| Criterion | Electron | Tauri |
|---|---|---|
| Team stack | TypeScript only; same toolchain as `web/robot-edu` | Adds Rust to a repo that has none |
| Rendering consistency | Bundled Chromium: identical WebGL (3D SO-101 preview), Blockly and Web APIs on all OSes; Playwright can drive the real app | System WebView (WebView2 / WKWebView / WebKitGTK): rendering and WebGL differences per OS and distro, more QA |
| One-config installers | `electron-builder`: NSIS `.exe`, `.dmg`/`.zip`, `.deb` from one config and one CI matrix | Tauri bundler: `.msi`/`.exe`, `.dmg`/`.app`, `.deb`/AppImage; needs Rust toolchain per runner |
| Size | ~100–150 MB installers | ~10–30 MB |
| Auto-update | `electron-updater` (signed metadata, differential) | Built-in updater plugin (signature required) |
| Local sidecar (Python runtime) | Spawn child process from main; straightforward | Sidecar supported; same packaging work |
| Security surface | Larger (must harden: contextIsolation, no nodeIntegration, CSP, fixed origin) | Smaller default surface |

**Recommendation: Electron for the first release** (single language, consistent Chromium for the 3D/Blockly experience, one `electron-builder` config for all three formats, existing CI skills). Revisit Tauri only if installer size becomes a requirement. **This is a recommendation, not an implementation: approval is required before any framework is added.**

## 3. Proposed minimal architecture
1. **Shell**: Electron main process loading the production web app origin (`https://skynex.best`) in a hardened `BrowserWindow` (`contextIsolation`, no Node in renderer, strict navigation allow-list, CSP, no remote module). Offline/bundled-UI mode is out of scope for v1.
2. **Optional local robot bridge** (only for users with hardware): a packaged `services/robot-runtime`/adapter sidecar bound to `127.0.0.1` with a per-launch random token; started only after explicit user action; `hardwareEnabled=false` unless a reviewed commissioning config is present. The shell never exposes serial ports or raw joints to the web page; the web app talks to the sidecar only through the existing runtime contract.
3. **No new LMS surface**: all learning/auth stays in the existing web app and API (Supabase auth, Student Code login unchanged).
4. **Local robot connectivity requirements** (to confirm with hardware owners): USB-serial access (drivers on Windows; `dialout`/udev on Linux; macOS permissions), calibration files location, firewall prompt avoidance (loopback only), explicit physical-safety confirmation before enabling hardware.

## 4. Installer delivery plan (nothing built yet)
| Target | Format | Build runner | Notes |
|---|---|---|---|
| Windows x64 | NSIS `.exe` | `windows-latest` | Authenticode signing (OV/EV certificate) required to avoid SmartScreen warnings |
| macOS | `.dmg` (+ `.zip` of the `.app` for updater) | `macos-14` (arm64) and an x64/universal build | Apple Developer ID signing + notarization + stapling |
| Linux x64 | `.deb` | `ubuntu-22.04` | Detached GPG signature; apt repository optional later |
Only formats that are actually built, installed in a clean VM/runner and launched by a smoke test may be listed as available.

Cross-cutting: **versioning** semver, tag `desktop-vX.Y.Z`, build number from the workflow run; **checksums** SHA-256 for every artifact in a signed `SHA256SUMS`; **hosting** decision needed (GitHub Releases vs a private S3 bucket behind CloudFront); **secrets** (signing certificates, notarization credentials) only in a protected GitHub environment with required reviewers; **updates** signed update metadata over HTTPS, updater verifies the code signature, rollback by publishing a higher version, minimum-version kill switch in the manifest.

GitHub Actions matrix: `build` (win/mac/linux) → `smoke` (install, launch, load the production origin, exit code) → `sign/notarize` (protected env) → `checksums` → `manifest` (generated only from artifacts that passed) → `publish` (manual approval). Publishing never runs on pull requests.

## 5. Release manifest contract (for the Homepage)
Schema: `docs/desktop/release-manifest.schema.json`. Rules the consumer (Codex's UI) must follow:
- The manifest is fetched from one approved HTTPS URL decided at publish time; **no URL is invented in code**.
- A platform is "available" only if it has an entry with `status: "available"`, a `sha256`, a `sizeBytes`, an `https` `url` on the allow-listed artifact host, and `verification.smokeTestPassed: true`. Anything else, or a missing/invalid manifest, renders as unavailable (current behavior).
- Show version, size, SHA-256 and signature status; never auto-download.
- `minimumSupportedVersion` and `revoked` entries let the site stop offering a bad build.

## 6. Approvals and next steps
1. Approve Electron (or choose Tauri). 2. Decide artifact hosting and the approved download host. 3. Provide/approve signing identities (Windows certificate, Apple Developer ID + notarization, Linux GPG key). 4. Agree the hardware-sidecar scope for v1 (web-only shell first is the safest slice). 5. Then implement: `apps/desktop` shell, hardened window, CI matrix with smoke tests, unsigned internal builds first.
