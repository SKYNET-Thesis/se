import type { RobotStatus } from "../components/ui/StatusBadge";
import { getTasks, Task } from "./tasks";

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
// is its stable identity; `name` is a user-editable label and is never
// parsed — role and side are explicit fields.
export const ROBOT_ARM_MODEL = "SO-ARM101";

export type RobotArmRole = "leader" | "follower";
export type RobotArmSide = "left" | "right" | "custom";

export type RobotArmState = {
  id: string;
  name: string;
  role: RobotArmRole;
  side?: RobotArmSide;
  model: typeof ROBOT_ARM_MODEL;
  connected: boolean;
  calibrated: boolean;
  // In-flight attempts (connectRobotArm / completeRobotCalibration). Neither
  // counts toward readiness: a connecting arm is offline, and an arm still
  // finishing calibration keeps its previous calibration state.
  connecting: boolean;
  calibrating: boolean;
};

// The arm facts the link may change. Identity, role and model never change
// through it; the name changes only through renameRobotArm().
type RobotArmFlags = Pick<RobotArmState, "connected" | "calibrated" | "connecting" | "calibrating">;

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

// Prototype setup: one leader and one follower, both connected and
// calibrated, so every existing flow (Manual, Phone, Skills) is reachable
// without setup. Either arm can be recalibrated on its own, and the dev
// hook below can drop one to "needs calibration".
function prototypeArm(id: string, name: string, role: RobotArmRole, side: RobotArmSide): RobotArmState {
  return { id, name, role, side, model: ROBOT_ARM_MODEL, connected: true, calibrated: true, connecting: false, calibrating: false };
}

let robotSetup: RobotSetup = {
  arms: {
    arm_01: prototypeArm("arm_01", "leader_left", "leader", "left"),
    arm_02: prototypeArm("arm_02", "follower_right", "follower", "right")
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

function patchArms(armIds: readonly string[], patch: Partial<RobotArmFlags>) {
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

// One arm's connection / calibration facts. A real transport calls this as
// each arm reports in.
export function setRobotArm(armId: string, patch: Partial<RobotArmFlags>) {
  patchArms([armId], patch);
}

// Legacy whole-robot setter: applies to every active arm at once.
export function setRobotLink(next: Partial<RobotLink>) {
  patchArms(robotSetup.activeArmIds, next);
}

// Which registered arms the current setup requires. Unknown ids are dropped.
// Seam for a future setup picker; nothing calls it yet.
export function setActiveRobotArms(armIds: readonly string[]) {
  const known = armIds.filter((id, index) => robotSetup.arms[id] && armIds.indexOf(id) === index);
  if (known.length === robotSetup.activeArmIds.length && known.every((id, i) => id === robotSetup.activeArmIds[i])) return;
  commitSetup({ ...robotSetup, activeArmIds: known });
}

// ── Rename seam ────────────────────────────────────────────────────────────
// Names are labels only: renaming never changes the id, role or side, and
// role is never inferred from the name.
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

// ── Connection seam ────────────────────────────────────────────────────────
// Screens never talk to hardware: they call the connect / disconnect
// actions and read the shared state. HOW an arm is reached is a provider.
// Today the only provider is the prototype one below, which talks to
// nothing — it is labelled as such in the UI (getRobotLinkMode()). A real
// SO-ARM101 transport replaces it later without any screen changing.
export type RobotLinkMode = "prototype" | "hardware";

export type RobotLinkProvider = {
  mode: RobotLinkMode;
  // Resolves once the arm has answered, with what it reports about its
  // calibration; rejects if it can't be reached.
  connect: (armId: string) => Promise<{ calibrated: boolean }>;
  disconnect: (armId: string) => Promise<void>;
  // Finalises a calibration the user has just walked this arm through
  // (centre pose, then full range). Resolves once the arm has stored it;
  // rejects if it couldn't. Real hardware would read and save the joint
  // ranges here.
  completeCalibration: (armId: string) => Promise<void>;
};

// Prototype: no discovery, pairing or handshake happens. "Connecting" is a
// short simulated wait; each arm keeps whatever calibration state it had.
// Calibration reads no servo and writes nothing to any arm — finishing it
// is a short simulated wait too. The UI says so (getRobotLinkMode()).
const PROTOTYPE_CONNECT_MS = 1200;
const PROTOTYPE_CALIBRATION_MS = 1000;
const prototypeProvider: RobotLinkProvider = {
  mode: "prototype",
  connect: (armId) =>
    new Promise((resolve) => {
      setTimeout(() => resolve({ calibrated: robotSetup.arms[armId]?.calibrated ?? false }), PROTOTYPE_CONNECT_MS);
    }),
  disconnect: async () => undefined,
  completeCalibration: () =>
    new Promise((resolve) => {
      setTimeout(resolve, PROTOTYPE_CALIBRATION_MS);
    })
};

const linkProvider: RobotLinkProvider = prototypeProvider;

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

export function getRobotLinkMode(): RobotLinkMode {
  return linkProvider.mode;
}

export type ConnectResult = "connected" | "cancelled" | "failed";

// Connecting never touches E-STOP (owned by App.tsx) and never arms or
// resumes any control: readiness simply re-derives from the new state.
export async function connectRobotArm(armId: string): Promise<ConnectResult> {
  const arm = robotSetup.arms[armId];
  if (!arm) return "failed";
  if (arm.connected) return "connected";
  if (arm.connecting) return "cancelled";
  const attempt = nextAttempt(connectAttempts, armId);
  setRobotArm(armId, { connecting: true });
  try {
    const { calibrated } = await linkProvider.connect(armId);
    if (!isCurrentAttempt(connectAttempts, armId, attempt)) return "cancelled";
    setRobotArm(armId, { connected: true, calibrated, connecting: false });
    return "connected";
  } catch {
    if (!isCurrentAttempt(connectAttempts, armId, attempt)) return "cancelled";
    setRobotArm(armId, { connecting: false });
    return "failed";
  }
}

export function cancelRobotArmConnect(armId: string) {
  if (!robotSetup.arms[armId]?.connecting) return;
  nextAttempt(connectAttempts, armId);
  setRobotArm(armId, { connecting: false });
}

// Disconnecting one arm drops readiness to offline at once (controllers
// disarm via the shared gate) and invalidates a connect or calibration in
// flight for THAT arm only; it does not clear E-STOP or its calibration.
export async function disconnectRobotArm(armId: string): Promise<void> {
  if (!robotSetup.arms[armId]) return;
  nextAttempt(connectAttempts, armId);
  nextAttempt(calibrationAttempts, armId);
  setRobotArm(armId, { connected: false, connecting: false, calibrating: false });
  await linkProvider.disconnect(armId);
}

// Whole-setup actions (what Connect uses today): the prototype connects and
// disconnects every active arm together. Per-arm actions above are the
// long-term API. One arm failing makes the setup "failed"; arms that did
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
// Calibration belongs to ONE arm. The guided steps are the user's; finishing
// is the provider's. An arm's `calibrated` becomes true ONLY here, after the
// provider confirms, and only if that arm is still connected and this
// attempt is still current. It never touches E-STOP: finishing while stopped
// records the calibration, and readiness stays "stopped" until the user's
// Reset. It never arms or starts any control either.
export type CalibrationResult = "calibrated" | "offline" | "cancelled" | "failed";

export async function completeRobotCalibration(armId: string): Promise<CalibrationResult> {
  const arm = robotSetup.arms[armId];
  if (!arm?.connected) return "offline";
  if (arm.calibrating) return "cancelled";
  const attempt = nextAttempt(calibrationAttempts, armId);
  setRobotArm(armId, { calibrating: true });
  try {
    await linkProvider.completeCalibration(armId);
    if (!isCurrentAttempt(calibrationAttempts, armId, attempt)) return "cancelled";
    if (!robotSetup.arms[armId]?.connected) {
      setRobotArm(armId, { calibrating: false });
      return "offline";
    }
    setRobotArm(armId, { calibrated: true, calibrating: false });
    return "calibrated";
  } catch {
    if (!isCurrentAttempt(calibrationAttempts, armId, attempt)) return "cancelled";
    setRobotArm(armId, { calibrating: false });
    return "failed";
  }
}

export function cancelRobotCalibration(armId: string) {
  if (!robotSetup.arms[armId]?.calibrating) return;
  nextAttempt(calibrationAttempts, armId);
  setRobotArm(armId, { calibrating: false });
}

// Dev/QA only (stripped from release builds): lets a tester or test script
// drive the shared state — e.g.
//   globalThis.__skynexRobotLink.set({ connected: false })          // whole setup
//   globalThis.__skynexRobotLink.setArm("arm_02", { calibrated: false })
//   globalThis.__skynexRobotLink.rename("arm_01", "robot_lab_1")
// until a real robot link exists. It writes the shared source; there is no
// per-screen override.
if (__DEV__) {
  (globalThis as { __skynexRobotLink?: unknown }).__skynexRobotLink = {
    get: getRobotLink,
    set: setRobotLink,
    getSetup: getRobotSetup,
    setArm: setRobotArm,
    setActive: setActiveRobotArms,
    rename: renameRobotArm
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
