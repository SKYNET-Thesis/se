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
export type RobotLink = { connected: boolean; calibrated: boolean };

let robotLink: RobotLink = { connected: MOCK_ROBOT.connected, calibrated: MOCK_ROBOT.calibrated };
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
  if (merged.connected === robotLink.connected && merged.calibrated === robotLink.calibrated) return;
  robotLink = merged;
  robotLinkListeners.forEach((listener) => listener());
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
