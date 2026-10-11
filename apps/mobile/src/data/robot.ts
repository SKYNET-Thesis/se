import type { RobotStatus } from "../components/ui/StatusBadge";
import { PROTOTYPE_DEVICES, prototypeBinding } from "./robotProviders/prototype";
import { findRobotProvider, getRobotProvider, getRobotProviderMode, installRobotProvider } from "./robotProviders/registry";
import { SO101_MODEL } from "./robotProviders/so101";
import {
  PhysicalArmBinding,
  providerErrorCode,
  RobotDeviceDescriptor,
  RobotDeviceTarget,
  RobotProvider,
  RobotProviderErrorCode,
  RobotProviderMode
} from "./robotProviders/types";
import { getTasks, Task } from "./tasks";

export type { PhysicalArmBinding, RobotDeviceDescriptor, RobotProviderErrorCode } from "./robotProviders/types";

// The robot DOMAIN: the one shared store of arms and the active setup, and
// the actions that change it. Screens call these actions and read this
// state; device work goes through the active provider (robotProviders/),
// which never writes this state itself. See robotProviders/README.md.

// What Home needs to answer "who is the robot, is it ready, what next?".
// Readiness is a gate, checked in this order — each step blocks the next:
//   offline            → nothing works until the robot is connected
//   stopped            → E-STOP blocks every motion (connect stays allowed,
//                        matching the existing route-disable rule)
//   needs-calibration  → connected, but motion would be inaccurate
//   ready              → the robot can perform a skill
// With several arms, "the robot" is the active setup: readiness is the
// aggregate of the arms it requires (see aggregateLink()).
export type RobotReadiness = "offline" | "stopped" | "needs-calibration" | "ready";

export type RobotSummary = {
  name: string;
  readiness: RobotReadiness;
  // StatusBadge state for this readiness.
  status: RobotStatus;
  // One-line human status for the hero.
  headline: string;
  // Longer explanation for the readiness card.
  message: string;
  // First ready skill, or null when none is ready yet.
  suggestedSkill: Task | null;
};

// ── Arms and the active setup ─────────────────────────────────────────────
// A SkyNex setup may hold several SO-ARM101 arms (one leader + one follower,
// two of each, …), each connected and calibrated on its own. An arm's `id`
// is its stable APP identity; `name` is a user-editable label and is never
// parsed — role and side are explicit fields. The physical device behind an
// arm is a separate, optional `binding`: arm.id is never a device id or a
// port, and renaming or rebinding never changes it.
export const ROBOT_ARM_MODEL = SO101_MODEL;

export type RobotArmRole = "leader" | "follower";
export type RobotArmSide = "left" | "right" | "custom";

export type RobotArmState = {
  id: string;
  name: string;
  role: RobotArmRole;
  side?: RobotArmSide;
  model: typeof ROBOT_ARM_MODEL;
  // Which physical device this arm is (provider + device id). Bound ≠
  // connected: a bound arm may be offline; an unbound arm can't connect.
  binding?: PhysicalArmBinding;
  connected: boolean;
  calibrated: boolean;
  // In-flight attempts (connectRobotArm / completeRobotCalibration). Neither
  // counts toward readiness: a connecting arm is offline, and an arm still
  // finishing calibration keeps its previous calibration state.
  connecting: boolean;
  calibrating: boolean;
  // Why the last connect / calibration failed, if it did. Machine-readable;
  // screens choose the words. Cleared when a new attempt starts.
  lastError?: RobotProviderErrorCode;
};

// The arm facts the dev/QA setter may change. Identity, role and model never
// change; name, binding and errors change only through their own actions.
type RobotArmFlags = Pick<RobotArmState, "connected" | "calibrated" | "connecting" | "calibrating">;
type ArmPatch = Partial<RobotArmFlags> & {
  binding?: PhysicalArmBinding | undefined;
  lastError?: RobotProviderErrorCode | undefined;
};

// Every registered arm, plus the ones the current setup requires. Only
// active arms count toward readiness — a registered arm the setup doesn't
// use never blocks it.
export type RobotSetup = {
  arms: Readonly<Record<string, RobotArmState>>;
  activeArmIds: readonly string[];
};

export const ROBOT_ARM_ROLE_LABEL: Record<RobotArmRole, string> = {
  leader: "Leader",
  follower: "Follower"
};

// "Leader · SO-ARM101" — the secondary line under an arm's name.
export function describeRobotArm(arm: RobotArmState): string {
  return `${ROBOT_ARM_ROLE_LABEL[arm.role]} · ${arm.model}`;
}

// Prototype setup: one leader and one follower, each bound to a simulated
// prototype device, both connected and calibrated, so every existing flow
// (Manual, Phone, Skills) is reachable without setup. Either arm can be
// recalibrated on its own, and the dev hook below can drop one to "needs
// calibration".
function prototypeArm(id: string, name: string, role: RobotArmRole, side: RobotArmSide, deviceId: string): RobotArmState {
  return {
    id,
    name,
    role,
    side,
    model: ROBOT_ARM_MODEL,
    binding: prototypeBinding(deviceId),
    connected: true,
    calibrated: true,
    connecting: false,
    calibrating: false
  };
}

let robotSetup: RobotSetup = {
  arms: {
    arm_01: prototypeArm("arm_01", "leader_left", "leader", "left", PROTOTYPE_DEVICES[0].deviceId),
    arm_02: prototypeArm("arm_02", "follower_right", "follower", "right", PROTOTYPE_DEVICES[1].deviceId)
  },
  activeArmIds: ["arm_01", "arm_02"]
};

export function getRobotSetup(): RobotSetup {
  return robotSetup;
}

// The active setup's arms, in setup order. Unknown ids are skipped.
export function getActiveArms(setup: RobotSetup = robotSetup): RobotArmState[] {
  return setup.activeArmIds.flatMap((id) => (setup.arms[id] ? [setup.arms[id]] : []));
}

// The arm a setup-level "Calibrate" should open directly: the one connected
// arm that still needs calibration. null when none or several do — then
// Calibrate's own arm overview lets the user choose.
export function pickArmToCalibrate(arms: readonly RobotArmState[]): string | null {
  const pending = arms.filter((arm) => arm.connected && !arm.calibrated);
  return pending.length === 1 ? pending[0].id : null;
}

// ── Aggregate link (backward-compatible view) ─────────────────────────────
// Most screens only need "is the setup connected / calibrated?". RobotLink
// is that aggregate over the ACTIVE arms — the ONE place it is derived:
//   connected   → every active arm is connected
//   calibrated  → every active arm is calibrated
//   connecting  → any active arm is connecting
//   calibrating → any active arm is finishing calibration
// An empty setup is neither connected nor calibrated (offline).
export type RobotLink = { connected: boolean; calibrated: boolean; connecting: boolean; calibrating: boolean };

function aggregateLink(setup: RobotSetup): RobotLink {
  const arms = getActiveArms(setup);
  const any = arms.length > 0;
  return {
    connected: any && arms.every((arm) => arm.connected),
    calibrated: any && arms.every((arm) => arm.calibrated),
    connecting: arms.some((arm) => arm.connecting),
    calibrating: arms.some((arm) => arm.calibrating)
  };
}

function sameFlags<T extends object>(a: T, b: T) {
  return (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key]);
}

// Cached so its identity changes only when the aggregate does — screens
// reading it through useSyncExternalStore re-render only on a real change.
let robotLink: RobotLink = aggregateLink(robotSetup);
const robotLinkListeners = new Set<() => void>();

export function getRobotLink(): RobotLink {
  return robotLink;
}

// One subscription for the whole robot state: arms, setup and aggregate.
export function subscribeRobotLink(listener: () => void): () => void {
  robotLinkListeners.add(listener);
  return () => {
    robotLinkListeners.delete(listener);
  };
}

// Snapshots are replaced, never mutated, so an identity change means the
// state changed.
function commitSetup(next: RobotSetup) {
  robotSetup = next;
  const link = aggregateLink(next);
  if (!sameFlags(link, robotLink)) robotLink = link;
  robotLinkListeners.forEach((listener) => listener());
}

function patchArms(armIds: readonly string[], patch: ArmPatch) {
  let arms = robotSetup.arms;
  armIds.forEach((id) => {
    const arm = arms[id];
    if (!arm) return;
    const merged = { ...arm, ...patch };
    if (sameFlags(merged, arm)) return;
    arms = { ...arms, [id]: merged };
  });
  if (arms !== robotSetup.arms) commitSetup({ ...robotSetup, arms });
}

function patchArm(armId: string, patch: ArmPatch) {
  patchArms([armId], patch);
}

// Dev/QA: one arm's connection / calibration facts, written directly.
export function setRobotArm(armId: string, patch: Partial<RobotArmFlags>) {
  const { connected, calibrated, connecting, calibrating } = patch;
  const flags: Partial<RobotArmFlags> = {};
  if (connected !== undefined) flags.connected = connected;
  if (calibrated !== undefined) flags.calibrated = calibrated;
  if (connecting !== undefined) flags.connecting = connecting;
  if (calibrating !== undefined) flags.calibrating = calibrating;
  patchArm(armId, flags);
}

// Legacy whole-robot setter: applies to every active arm at once.
export function setRobotLink(next: Partial<RobotLink>) {
  robotSetup.activeArmIds.forEach((armId) => setRobotArm(armId, next));
}

// Which registered arms the current setup requires. Unknown ids are dropped.
// Seam for a future setup picker; nothing calls it yet.
export function setActiveRobotArms(armIds: readonly string[]) {
  const known = armIds.filter((id, index) => robotSetup.arms[id] && armIds.indexOf(id) === index);
  if (known.length === robotSetup.activeArmIds.length && known.every((id, i) => id === robotSetup.activeArmIds[i])) return;
  commitSetup({ ...robotSetup, activeArmIds: known });
}

// ── Rename seam ────────────────────────────────────────────────────────────
// Names are labels only: renaming never changes the id, role, side or
// binding, and role is never inferred from the name.
export type RenameArmResult = "renamed" | "unchanged" | "empty" | "not-found";

export function renameRobotArm(armId: string, name: string): RenameArmResult {
  const arm = robotSetup.arms[armId];
  if (!arm) return "not-found";
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (trimmed === arm.name) return "unchanged";
  commitSetup({ ...robotSetup, arms: { ...robotSetup.arms, [armId]: { ...arm, name: trimmed } } });
  return "renamed";
}

// ── Provider plumbing ─────────────────────────────────────────────────────
// Every device operation resolves the arm's binding against the ACTIVE
// provider here. An arm bound to another provider's device is unavailable,
// not silently re-targeted.

// Each attempt gets an id PER ARM; a cancelled or superseded attempt's late
// result is ignored instead of connecting (or calibrating) that arm behind
// the user's back. Arm A's counters never touch arm B.
const connectAttempts = new Map<string, number>();
const calibrationAttempts = new Map<string, number>();

function nextAttempt(attempts: Map<string, number>, armId: string) {
  const attempt = (attempts.get(armId) ?? 0) + 1;
  attempts.set(armId, attempt);
  return attempt;
}

function isCurrentAttempt(attempts: Map<string, number>, armId: string, attempt: number) {
  return attempts.get(armId) === attempt;
}

// The device target for an arm on a provider, or why there is none.
export function resolveDeviceTarget(
  arm: RobotArmState,
  provider: RobotProvider
): { target: RobotDeviceTarget } | { error: RobotProviderErrorCode } {
  if (!arm.binding) return { error: "unbound" };
  if (arm.binding.providerId !== provider.id) return { error: "unavailable" };
  return { target: { armId: arm.id, binding: arm.binding } };
}

// Where robot state comes from — the ONE source for every "Chế độ thử
// nghiệm" disclosure (Connect, Calibration, Status).
export type RobotLinkMode = RobotProviderMode;

export function getRobotLinkMode(): RobotLinkMode {
  return getRobotProviderMode();
}

// ── Binding seam ───────────────────────────────────────────────────────────
// Ties a logical arm to a physical device. Binding is not connecting: the
// arm stays offline until connectRobotArm(). Changing an arm's device takes
// it offline first (invalidating anything in flight for that arm only) and
// clears its calibration, which belonged to the previous device. Rename
// never touches a binding; unbinding never deletes the arm.
export type BindArmResult = "bound" | "unchanged" | "not-found" | "unsupported-model";

// Takes one arm offline in app state and invalidates its in-flight connect
// and calibration. Returns the provider target to release, if any.
function takeArmOffline(arm: RobotArmState): RobotDeviceTarget | null {
  nextAttempt(connectAttempts, arm.id);
  nextAttempt(calibrationAttempts, arm.id);
  patchArm(arm.id, { connected: false, connecting: false, calibrating: false });
  const resolved = resolveDeviceTarget(arm, getRobotProvider());
  return "target" in resolved ? resolved.target : null;
}

function releaseDevice(target: RobotDeviceTarget | null) {
  if (!target) return;
  // Best effort: app state is already offline whatever the device says.
  void getRobotProvider().connection.disconnect(target).catch(() => undefined);
}

export function bindRobotArm(armId: string, device: RobotDeviceDescriptor): BindArmResult {
  const arm = robotSetup.arms[armId];
  if (!arm) return "not-found";
  if (device.model !== arm.model) return "unsupported-model";
  if (arm.binding?.providerId === device.providerId && arm.binding.deviceId === device.deviceId) return "unchanged";
  const busy = arm.connected || arm.connecting || arm.calibrating;
  const previous = busy ? takeArmOffline(arm) : null;
  patchArm(armId, {
    binding: { providerId: device.providerId, deviceId: device.deviceId },
    calibrated: false,
    lastError: undefined
  });
  releaseDevice(previous);
  return "bound";
}

export function unbindRobotArm(armId: string): "unbound" | "unchanged" | "not-found" {
  const arm = robotSetup.arms[armId];
  if (!arm) return "not-found";
  if (!arm.binding) return "unchanged";
  const previous = takeArmOffline(arm);
  patchArm(armId, { binding: undefined, lastError: undefined });
  releaseDevice(previous);
  return "unbound";
}

// Devices the active provider can offer for binding (future pairing UI).
// Empty when the provider can't discover.
export async function discoverRobotDevices(): Promise<RobotDeviceDescriptor[]> {
  const provider = getRobotProvider();
  if (!provider.capabilities.discovery || !provider.connection.discover) return [];
  try {
    return await provider.connection.discover();
  } catch {
    return [];
  }
}

// ── Connection seam ────────────────────────────────────────────────────────
export type ConnectResult = "connected" | "cancelled" | "failed";

// Connecting never touches E-STOP (owned by App.tsx) and never arms or
// resumes any control: readiness simply re-derives from the new state.
export async function connectRobotArm(armId: string): Promise<ConnectResult> {
  const arm = robotSetup.arms[armId];
  if (!arm) return "failed";
  if (arm.connected) return "connected";
  if (arm.connecting) return "cancelled";
  const provider = getRobotProvider();
  const resolved = resolveDeviceTarget(arm, provider);
  if ("error" in resolved) {
    patchArm(armId, { lastError: resolved.error });
    return "failed";
  }
  if (!provider.capabilities.connection) {
    patchArm(armId, { lastError: "unsupported" });
    return "failed";
  }
  const attempt = nextAttempt(connectAttempts, armId);
  patchArm(armId, { connecting: true, lastError: undefined });
  try {
    const report = await provider.connection.connect(resolved.target);
    if (!isCurrentAttempt(connectAttempts, armId, attempt)) return "cancelled";
    // A device that reports its calibration is believed; one that can't
    // tell (the prototype) leaves the app's record as it was.
    patchArm(armId, report.calibrated === undefined
      ? { connected: true, connecting: false }
      : { connected: true, connecting: false, calibrated: report.calibrated });
    return "connected";
  } catch (error) {
    if (!isCurrentAttempt(connectAttempts, armId, attempt)) return "cancelled";
    const code = providerErrorCode(error, "connection_failed");
    patchArm(armId, { connecting: false, lastError: code === "cancelled" ? undefined : code });
    return code === "cancelled" ? "cancelled" : "failed";
  }
}

export function cancelRobotArmConnect(armId: string) {
  const arm = robotSetup.arms[armId];
  if (!arm?.connecting) return;
  nextAttempt(connectAttempts, armId);
  patchArm(armId, { connecting: false });
  const resolved = resolveDeviceTarget(arm, getRobotProvider());
  if ("target" in resolved) getRobotProvider().connection.cancelConnect?.(resolved.target);
}

// Disconnecting one arm drops readiness to offline at once (controllers
// disarm via the shared gate) and invalidates a connect or calibration in
// flight for THAT arm only; it does not clear E-STOP, its calibration or
// its binding.
export async function disconnectRobotArm(armId: string): Promise<void> {
  const arm = robotSetup.arms[armId];
  if (!arm) return;
  const target = takeArmOffline(arm);
  if (!target) return;
  try {
    await getRobotProvider().connection.disconnect(target);
  } catch {
    // Already offline in app state; nothing else to do.
  }
}

// Whole-setup actions (what Connect uses today): connect / disconnect every
// active arm. One arm failing makes the setup "failed"; arms that did
// connect stay connected, and the aggregate stays offline until all are.
export async function connectRobot(): Promise<ConnectResult> {
  const results = await Promise.all(robotSetup.activeArmIds.map(connectRobotArm));
  if (results.length === 0 || results.includes("failed")) return "failed";
  if (results.includes("cancelled")) return "cancelled";
  return "connected";
}

export function cancelRobotConnect() {
  robotSetup.activeArmIds.forEach(cancelRobotArmConnect);
}

export async function disconnectRobot(): Promise<void> {
  await Promise.all(robotSetup.activeArmIds.map(disconnectRobotArm));
}

// ── Calibration seam ───────────────────────────────────────────────────────
// Calibration belongs to ONE arm. The guided steps are the user's (the UI);
// finishing is the provider's hardware step. An arm's `calibrated` becomes
// true ONLY here, after the provider confirms, and only if that arm is still
// connected and this attempt is still current. It never touches E-STOP:
// finishing while stopped records the calibration, and readiness stays
// "stopped" until the user's Reset. It never arms or starts any control.
export type CalibrationResult = "calibrated" | "offline" | "cancelled" | "failed";

export async function completeRobotCalibration(armId: string): Promise<CalibrationResult> {
  const arm = robotSetup.arms[armId];
  if (!arm?.connected) return "offline";
  if (arm.calibrating) return "cancelled";
  const provider = getRobotProvider();
  const resolved = resolveDeviceTarget(arm, provider);
  if ("error" in resolved || !provider.capabilities.calibration) {
    patchArm(armId, { lastError: "error" in resolved ? resolved.error : "unsupported" });
    return "failed";
  }
  const attempt = nextAttempt(calibrationAttempts, armId);
  patchArm(armId, { calibrating: true, lastError: undefined });
  try {
    await provider.calibration.calibrate(resolved.target);
    if (!isCurrentAttempt(calibrationAttempts, armId, attempt)) return "cancelled";
    if (!robotSetup.arms[armId]?.connected) {
      patchArm(armId, { calibrating: false });
      return "offline";
    }
    patchArm(armId, { calibrated: true, calibrating: false });
    return "calibrated";
  } catch (error) {
    if (!isCurrentAttempt(calibrationAttempts, armId, attempt)) return "cancelled";
    const code = providerErrorCode(error, "calibration_failed");
    patchArm(armId, { calibrating: false, lastError: code === "cancelled" ? undefined : code });
    return code === "cancelled" ? "cancelled" : "failed";
  }
}

export function cancelRobotCalibration(armId: string) {
  const arm = robotSetup.arms[armId];
  if (!arm?.calibrating) return;
  nextAttempt(calibrationAttempts, armId);
  patchArm(armId, { calibrating: false });
  const resolved = resolveDeviceTarget(arm, getRobotProvider());
  if ("target" in resolved) getRobotProvider().calibration.cancelCalibration?.(resolved.target);
}

// ── Provider selection (development only) ─────────────────────────────────
// Swaps the provider for every arm. Every arm is taken offline first, so no
// in-flight result from the previous provider can land; arms bound to the
// previous provider's devices then report "unavailable" until rebound.
// No-op (false) in release builds.
export function setRobotProviderForDevelopment(providerId: string): boolean {
  if (!__DEV__) return false;
  const next = findRobotProvider(providerId);
  if (!next) return false;
  if (next === getRobotProvider()) return true;
  const targets = Object.values(robotSetup.arms).map(takeArmOffline);
  targets.forEach(releaseDevice);
  installRobotProvider(next);
  // Re-notify so screens re-read the provider mode.
  commitSetup({ ...robotSetup });
  return true;
}

// Dev/QA only (stripped from release builds): lets a tester or test script
// drive the shared state — e.g.
//   globalThis.__skynexRobotLink.set({ connected: false })          // whole setup
//   globalThis.__skynexRobotLink.setArm("arm_02", { calibrated: false })
//   globalThis.__skynexRobotLink.rename("arm_01", "robot_lab_1")
//   globalThis.__skynexRobotLink.setProvider("so101-hardware")      // placeholder: everything "unavailable"
// until a real robot link exists. It writes the shared source; there is no
// per-screen override.
if (__DEV__) {
  (globalThis as { __skynexRobotLink?: unknown }).__skynexRobotLink = {
    get: getRobotLink,
    set: setRobotLink,
    getSetup: getRobotSetup,
    setArm: setRobotArm,
    setActive: setActiveRobotArms,
    rename: renameRobotArm,
    bind: bindRobotArm,
    unbind: unbindRobotArm,
    discover: discoverRobotDevices,
    provider: () => getRobotProvider().id,
    setProvider: setRobotProviderForDevelopment
  };
}


const READINESS_STATUS: Record<RobotReadiness, RobotStatus> = {
  offline: "offline",
  stopped: "danger",
  "needs-calibration": "warning",
  ready: "ready"
};

const READINESS_HEADLINE: Record<RobotReadiness, string> = {
  offline: "Chưa kết nối",
  stopped: "Đang dừng khẩn cấp",
  "needs-calibration": "Cần hiệu chỉnh",
  ready: "Sẵn sàng hỗ trợ bạn"
};

const READINESS_MESSAGE: Record<RobotReadiness, string> = {
  offline: "Kết nối robot để bắt đầu sử dụng kỹ năng.",
  stopped: "Robot sẽ không di chuyển. Nhấn Reset cạnh nút E-STOP khi đã an toàn.",
  "needs-calibration": "Robot đã kết nối. Hiệu chỉnh một lần để robot di chuyển chính xác.",
  ready: "Đã kết nối và hiệu chỉnh xong."
};

// Short label for the readiness badge — shared by Home's readiness card and
// Skill Detail so the two always name a state the same way.
export const READINESS_BADGE_LABEL: Record<RobotReadiness, string> = {
  offline: "Ngoại tuyến",
  stopped: "E-STOP",
  "needs-calibration": "Cần hiệu chỉnh",
  ready: "Sẵn sàng"
};

export function resolveReadiness(connected: boolean, calibrated: boolean, emergencyStopped: boolean): RobotReadiness {
  if (!connected) return "offline";
  if (emergencyStopped) return "stopped";
  if (!calibrated) return "needs-calibration";
  return "ready";
}

// The ONE rule for "the skill SkyNex suggests": the first ready skill.
// Home's readiness CTA (via getRobotSummary) and the Skills screen's hero
// both read it from here, so the two screens can never feature different
// skills. Never a learning / coming-soon skill.
function pickSuggestedTask(tasks: Task[]): Task | null {
  return tasks.find((task) => task.status === "ready") ?? null;
}

export async function getSuggestedSkillId(): Promise<string | null> {
  return pickSuggestedTask(await getTasks())?.id ?? null;
}

// Readiness of the active setup right now, synchronously. For last-line
// checks at the moment a command would leave the app — no render, effect
// or promise in between.
export function getLiveReadiness(emergencyStopped: boolean): RobotReadiness {
  return resolveReadiness(robotLink.connected, robotLink.calibrated, emergencyStopped);
}

export function buildRobotSummary(link: RobotLink, emergencyStopped: boolean, suggestedSkill: Task | null): RobotSummary {
  const readiness = resolveReadiness(link.connected, link.calibrated, emergencyStopped);

  return {
    name: ROBOT_ARM_MODEL,
    readiness,
    status: READINESS_STATUS[readiness],
    headline: READINESS_HEADLINE[readiness],
    message: READINESS_MESSAGE[readiness],
    suggestedSkill
  };
}

export async function getSuggestedSkill(): Promise<Task | null> {
  return pickSuggestedTask(await getTasks());
}

// One-shot summary of the active setup. Screens use useRobotSummary()
// instead, which also follows changes.
export async function getRobotSummary({ emergencyStopped }: { emergencyStopped: boolean }): Promise<RobotSummary> {
  return buildRobotSummary(robotLink, emergencyStopped, await getSuggestedSkill());
}
