import type { RobotStatus } from "../components/ui/StatusBadge";
import { getTasks, Task } from "./tasks";

// What Home needs to answer "who is the robot, is it ready, what next?".
// Readiness is a gate, checked in this order — each step blocks the next:
//   offline            → nothing works until the robot is connected
//   stopped            → E-STOP blocks every motion (connect stays allowed,
//                        matching the existing route-disable rule)
//   needs-calibration  → connected, but motion would be inaccurate
//   ready              → the robot can perform a skill
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

// Mock connection snapshot standing in for the real robot link. Only the
// two facts readiness depends on — no latency, profile or history, which
// would be telemetry this layer must not fake. When the robot link exists,
// only this object's source changes; getRobotSummary()'s shape stays.
const MOCK_ROBOT = {
  name: "SO-ARM101",
  connected: true,
  calibrated: true
};

// The live robot link: the ONE place connection/calibration state lives.
// Seeded from MOCK_ROBOT today; when the real link exists, it calls
// setRobotLink() and every consumer (useRobotSummary, getLiveReadiness)
// follows without any screen changing. Replaced, never mutated, so a
// snapshot identity change means the link changed.
//
// `connecting` is the in-flight attempt started by connectRobot(). It never
// counts toward readiness: a robot that is still connecting is offline.
export type RobotLink = { connected: boolean; calibrated: boolean; connecting: boolean };

let robotLink: RobotLink = { connected: MOCK_ROBOT.connected, calibrated: MOCK_ROBOT.calibrated, connecting: false };
const robotLinkListeners = new Set<() => void>();

export function getRobotLink(): RobotLink {
  return robotLink;
}

export function subscribeRobotLink(listener: () => void): () => void {
  robotLinkListeners.add(listener);
  return () => {
    robotLinkListeners.delete(listener);
  };
}

export function setRobotLink(next: Partial<RobotLink>) {
  const merged = { ...robotLink, ...next };
  if (
    merged.connected === robotLink.connected &&
    merged.calibrated === robotLink.calibrated &&
    merged.connecting === robotLink.connecting
  ) {
    return;
  }
  robotLink = merged;
  robotLinkListeners.forEach((listener) => listener());
}

// ── Connection seam ────────────────────────────────────────────────────────
// Screens never talk to hardware: they call connectRobot()/disconnectRobot()
// and read the shared link. HOW a robot is reached is a provider. Today the
// only provider is the prototype one below, which talks to nothing — it is
// labelled as such in the UI (getRobotLinkMode()). A real SO-ARM101 transport
// replaces it later without any screen changing.
export type RobotLinkMode = "prototype" | "hardware";

export type RobotLinkProvider = {
  mode: RobotLinkMode;
  // Resolves once the robot has answered, with what the robot reports about
  // its calibration; rejects if it can't be reached.
  connect: () => Promise<{ calibrated: boolean }>;
  disconnect: () => Promise<void>;
};

// Prototype: no discovery, pairing or handshake happens. "Connecting" is a
// short simulated wait; the robot keeps whatever calibration state it had.
const PROTOTYPE_CONNECT_MS = 1200;
const prototypeProvider: RobotLinkProvider = {
  mode: "prototype",
  connect: () =>
    new Promise((resolve) => {
      setTimeout(() => resolve({ calibrated: robotLink.calibrated }), PROTOTYPE_CONNECT_MS);
    }),
  disconnect: async () => undefined
};

const linkProvider: RobotLinkProvider = prototypeProvider;
// Each attempt gets an id; a cancelled or superseded attempt's late result
// is ignored instead of connecting the robot behind the user's back.
let connectAttempt = 0;

export function getRobotLinkMode(): RobotLinkMode {
  return linkProvider.mode;
}

export type ConnectResult = "connected" | "cancelled" | "failed";

// Connecting never touches E-STOP (owned by App.tsx) and never arms or
// resumes any control: readiness simply re-derives from the new link.
export async function connectRobot(): Promise<ConnectResult> {
  if (robotLink.connected) return "connected";
  if (robotLink.connecting) return "cancelled";
  const attempt = ++connectAttempt;
  setRobotLink({ connecting: true });
  try {
    const { calibrated } = await linkProvider.connect();
    if (attempt !== connectAttempt) return "cancelled";
    setRobotLink({ connected: true, calibrated, connecting: false });
    return "connected";
  } catch {
    if (attempt !== connectAttempt) return "cancelled";
    setRobotLink({ connecting: false });
    return "failed";
  }
}

export function cancelRobotConnect() {
  if (!robotLink.connecting) return;
  connectAttempt += 1;
  setRobotLink({ connecting: false });
}

// Disconnecting drops readiness to offline at once (controllers disarm via
// the shared gate); it does not clear E-STOP or calibration.
export async function disconnectRobot(): Promise<void> {
  connectAttempt += 1;
  setRobotLink({ connected: false, connecting: false });
  await linkProvider.disconnect();
}

// Dev/QA only (stripped from release builds): lets a tester or test script
// drive the shared link — e.g. globalThis.__skynexRobotLink.set({ connected: false })
// — until a real robot link exists. It writes the shared source; there is
// no per-screen override.
if (__DEV__) {
  (globalThis as { __skynexRobotLink?: unknown }).__skynexRobotLink = { get: getRobotLink, set: setRobotLink };
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

// Readiness right now, synchronously, from the live link. For last-line
// checks at the moment a command would leave the app — no render, effect
// or promise in between.
export function getLiveReadiness(emergencyStopped: boolean): RobotReadiness {
  return resolveReadiness(robotLink.connected, robotLink.calibrated, emergencyStopped);
}

export function buildRobotSummary(link: RobotLink, emergencyStopped: boolean, suggestedSkill: Task | null): RobotSummary {
  const readiness = resolveReadiness(link.connected, link.calibrated, emergencyStopped);

  return {
    name: MOCK_ROBOT.name,
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

// One-shot summary of the live link. Screens use useRobotSummary() instead,
// which also follows link changes.
export async function getRobotSummary({ emergencyStopped }: { emergencyStopped: boolean }): Promise<RobotSummary> {
  return buildRobotSummary(robotLink, emergencyStopped, await getSuggestedSkill());
}
