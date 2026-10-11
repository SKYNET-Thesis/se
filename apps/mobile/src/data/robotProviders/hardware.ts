import { SO101_ENCODER_SCALE } from "./so101";
import { RobotProvider, RobotProviderError } from "./types";

// ── SO-ARM101 hardware provider — PLACEHOLDER ─────────────────────────────
// Not implemented and not active. Every operation fails with "unavailable";
// nothing here pretends to succeed, and there is no transport code.
//
// The real implementation sits on the far side of this contract:
//
//   mobile domain ↔ SO101 hardware provider ↔ transport (native module, or a
//   local/remote bridge) ↔ LeRobot / Feetech bus ↔ SO-ARM101
//
// Transport details (ports, sockets, processes) stay inside the provider;
// devices are identified to the app only by RobotDeviceDescriptor.deviceId.

export const SO101_HARDWARE_PROVIDER_ID = "so101-hardware";

const unavailable = (operation: string) =>
  Promise.reject(new RobotProviderError("unavailable", `SO-ARM101 hardware provider is not implemented (${operation})`));

export const so101HardwareProvider: RobotProvider = {
  id: SO101_HARDWARE_PROVIDER_ID,
  mode: "hardware",
  // poseControl false: when this provider is implemented it will decide
  // whether Phone sessions go to the LeRobot bridge or its own transport.
  capabilities: {
    discovery: false,
    connection: false,
    calibration: false,
    jointTelemetry: false,
    jointControl: false,
    poseControl: false
  },

  connection: {
    connect: () => unavailable("connect"),
    // Nothing is ever connected through this placeholder.
    disconnect: async () => undefined,
    discover: () => unavailable("discover")
  },

  calibration: {
    calibrate: () => unavailable("calibrate")
  },

  telemetry: {
    positionScale: SO101_ENCODER_SCALE,
    // No readings at all — never simulated values under the "hardware" mode.
    start: () => () => undefined
  },

  command: {
    jogJoint: () => unavailable("jogJoint"),
    stopMotion: () => unavailable("stopMotion")
  }
};
