import { getLiveReadiness, getRobotSetup, resolveDeviceTarget } from "./robot";
import { getRobotProvider } from "./robotProviders/registry";
import { providerErrorCode, RobotDeviceTarget, RobotJointJog, RobotProviderErrorCode } from "./robotProviders/types";

// ── Motion commands (domain) ───────────────────────────────────────────────
// The ONLY path from a control screen to a provider's motion commands.
// Every motion command passes the shared safety gate HERE, synchronously, at
// the moment it would leave the app — then, and only then, the provider is
// called. Providers never decide whether motion is safe.
//
//   Manual / Phone → screen's own live checks → robotCommands (gate) → provider
//
// Stopping is never gated: it is always the safe direction.

// What the caller knows that the domain can't: E-STOP (owned by App.tsx)
// and whether the user has deliberately enabled control right now (Manual's
// arm switch, Phone's dead-man hold). Pass values read at call time (refs),
// never ones captured at render.
export type ControlGate = {
  emergencyStopped: boolean;
  controlEnabled: boolean;
};

export type CommandBlockReason = "emergency_stop" | "robot_not_ready" | "control_disabled" | "arm_unavailable";

export type CommandOutcome =
  | { status: "sent" }
  | { status: "blocked"; reason: CommandBlockReason }
  | { status: "failed"; error: RobotProviderErrorCode };

// The shared gate, evaluated now: global E-STOP, the active setup's live
// readiness (connected + calibrated, every required arm), the user's
// deliberate enable, then this arm's own connection, calibration and device.
function gate(armId: string, control: ControlGate): { target: RobotDeviceTarget } | { reason: CommandBlockReason } {
  if (control.emergencyStopped) return { reason: "emergency_stop" };
  if (getLiveReadiness(control.emergencyStopped) !== "ready") return { reason: "robot_not_ready" };
  if (!control.controlEnabled) return { reason: "control_disabled" };
  const arm = getRobotSetup().arms[armId];
  if (!arm?.connected || !arm.calibrated || arm.calibrating) return { reason: "arm_unavailable" };
  const resolved = resolveDeviceTarget(arm, getRobotProvider());
  return "target" in resolved ? resolved : { reason: "arm_unavailable" };
}

async function send(run: () => Promise<void>): Promise<CommandOutcome> {
  try {
    await run();
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: providerErrorCode(error, "command_failed") };
  }
}

// Hold-to-move: one jog step on one joint of one arm.
export async function jogRobotJoint(armId: string, jog: RobotJointJog, control: ControlGate): Promise<CommandOutcome> {
  const provider = getRobotProvider();
  if (!provider.capabilities.jointControl) return { status: "failed", error: "unsupported" };
  const checked = gate(armId, control);
  if ("reason" in checked) return { status: "blocked", reason: checked.reason };
  return send(() => provider.command.jogJoint(checked.target, jog));
}

// Drop the current target / return to the neutral reference. Gated like
// motion, since a neutral pose may move the arm.
export async function recenterRobotArm(armId: string, control: ControlGate): Promise<CommandOutcome> {
  const provider = getRobotProvider();
  const recenter = provider.command.recenter;
  if (!provider.capabilities.jointControl || !recenter) return { status: "failed", error: "unsupported" };
  const checked = gate(armId, control);
  if ("reason" in checked) return { status: "blocked", reason: checked.reason };
  return send(() => recenter(checked.target));
}

// Stop motion on one arm. Never gated by readiness or E-STOP — only needs a
// device to talk to. Sent whenever control ends (release, disarm, leave).
export async function stopRobotMotion(armId: string): Promise<CommandOutcome> {
  const provider = getRobotProvider();
  if (!provider.capabilities.jointControl) return { status: "failed", error: "unsupported" };
  const arm = getRobotSetup().arms[armId];
  if (!arm) return { status: "blocked", reason: "arm_unavailable" };
  const resolved = resolveDeviceTarget(arm, provider);
  if (!("target" in resolved)) return { status: "blocked", reason: "arm_unavailable" };
  return send(() => provider.command.stopMotion(resolved.target));
}

// The arm Manual Control drives: the active setup's first follower.
export function getControlledFollowerArmId(): string | null {
  const setup = getRobotSetup();
  return setup.activeArmIds.find((id) => setup.arms[id]?.role === "follower") ?? null;
}
