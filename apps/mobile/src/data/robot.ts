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

const READINESS_STATUS: Record<RobotReadiness, RobotStatus> = {
  offline: "offline",
  stopped: "warning",
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
  stopped: "Robot sẽ không di chuyển. Nhấn Reset ở trên cùng khi đã an toàn.",
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

export async function getRobotSummary({ emergencyStopped }: { emergencyStopped: boolean }): Promise<RobotSummary> {
  const tasks = await getTasks();
  const readiness = resolveReadiness(MOCK_ROBOT.connected, MOCK_ROBOT.calibrated, emergencyStopped);

  return {
    name: MOCK_ROBOT.name,
    readiness,
    status: READINESS_STATUS[readiness],
    headline: READINESS_HEADLINE[readiness],
    message: READINESS_MESSAGE[readiness],
    suggestedSkill: pickSuggestedTask(tasks)
  };
}
