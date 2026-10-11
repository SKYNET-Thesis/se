// ── Robot provider contracts ──────────────────────────────────────────────
// The boundary between the robot DOMAIN (data/robot.ts, robotCommands.ts,
// calibrationTelemetry.ts) and whatever actually reaches a physical arm.
// Screens never import this folder: they call domain actions and read shared
// state. A provider only performs device operations — it never writes app
// state, never navigates, never returns UI copy, and never decides whether a
// motion is safe (the domain's gate does, before calling it).
//
// Contracts are transport-neutral on purpose: a future implementation may
// be a native module, a local/remote bridge to LeRobot, or anything else.

// Where state comes from. Drives the "Chế độ thử nghiệm" disclosures.
export type RobotProviderMode = "prototype" | "hardware";

export type RobotArmModel = "SO-ARM101";

// The physical device a logical arm is bound to. `deviceId` is the
// provider's stable id for that device (e.g. "so101-usb-abc123") — never a
// transport address such as COM9 or a USB path, which may change between
// sessions and belongs inside the provider.
export type PhysicalArmBinding = {
  providerId: string;
  deviceId: string;
};

// A device a provider can offer for binding (future discovery). Minimal on
// purpose: no serials, firmware or health fields the app has no use for.
export type RobotDeviceDescriptor = {
  providerId: string;
  deviceId: string;
  model: RobotArmModel;
  displayName?: string;
  roleHint?: "leader" | "follower";
};

// Machine-readable failure reasons. Screens map these to Vietnamese copy.
export type RobotProviderErrorCode =
  | "unavailable" // provider / device can't be reached or isn't installed
  | "unsupported" // provider lacks this capability
  | "unbound" // the arm has no physical device
  | "connection_failed"
  | "disconnected" // device went away mid-operation
  | "calibration_failed"
  | "command_failed"
  | "cancelled";

export class RobotProviderError extends Error {
  readonly code: RobotProviderErrorCode;

  constructor(code: RobotProviderErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "RobotProviderError";
    this.code = code;
  }
}

export function providerErrorCode(error: unknown, fallback: RobotProviderErrorCode): RobotProviderErrorCode {
  return error instanceof RobotProviderError ? error.code : fallback;
}

// What a provider is asked to act on. `armId` is the app's logical id, for
// correlation/logging only; the device is identified by `binding`.
export type RobotDeviceTarget = {
  armId: string;
  binding: PhysicalArmBinding;
};

// The app's joint vocabulary (SO-ARM101's six joints).
export type RobotJointId =
  | "shoulder_pan"
  | "shoulder_lift"
  | "elbow_flex"
  | "wrist_flex"
  | "wrist_roll"
  | "gripper";

// Positions are in the provider's units — see RobotTelemetryProvider.positionScale.
export type RobotJointSample = {
  jointId: RobotJointId;
  position: number;
};

export type JointPositionScale = {
  unit: "encoder_counts" | "degrees";
  min: number;
  max: number;
};

// What a provider can do, so the domain can refuse an operation cleanly
// ("unsupported") instead of calling into a stub.
export type RobotProviderCapabilities = {
  discovery: boolean;
  connection: boolean;
  calibration: boolean;
  jointTelemetry: boolean;
  jointControl: boolean;
  // Streaming a handheld controller's pose (Phone Control). Separate from
  // jointControl: it is a session, not per-joint commands.
  poseControl: boolean;
};

export type RobotConnectionProvider = {
  // Resolves once the device answers. `calibrated` is what the device
  // reports about its stored calibration; omitted when it can't tell (the
  // app then keeps its own record). Rejects with RobotProviderError.
  connect: (target: RobotDeviceTarget) => Promise<{ calibrated?: boolean }>;
  disconnect: (target: RobotDeviceTarget) => Promise<void>;
  // Best effort: abandon an in-flight connect. The domain ignores the late
  // result either way.
  cancelConnect?: (target: RobotDeviceTarget) => void;
  discover?: () => Promise<RobotDeviceDescriptor[]>;
};

export type RobotCalibrationPhase = "center" | "range";

export type RobotCalibrationProvider = {
  // Finalise the calibration the user just walked this device through
  // (centre pose, then full range): read and store the ranges on the device.
  // The guided workflow stays in the UI; this is the hardware step only.
  calibrate: (target: RobotDeviceTarget) => Promise<void>;
  cancelCalibration?: (target: RobotDeviceTarget) => void;
};

export type RobotTelemetryProvider = {
  positionScale: JointPositionScale;
  // Streams joint positions for one device; returns a stop function. Read
  // only — never moves a motor. `phase` is a hint (the prototype simulates a
  // different motion per step; hardware may ignore it). A sample may hold
  // any subset of joints.
  start: (
    target: RobotDeviceTarget,
    phase: RobotCalibrationPhase,
    onSample: (samples: readonly RobotJointSample[]) => void
  ) => () => void;
};

// Hold-to-move jog, as Manual Control drives it today: move one joint a
// small `step` (in positionScale units) in `direction`.
export type RobotJointJog = {
  jointId: RobotJointId;
  direction: -1 | 1;
  step: number;
};

// Motion commands. ONLY ever called by the domain (robotCommands.ts) after
// the shared safety gate passed at that moment — a provider must not add
// its own "looks safe" logic or be called from screens.
export type RobotCommandProvider = {
  jogJoint: (target: RobotDeviceTarget, jog: RobotJointJog) => Promise<void>;
  // Stop any motion on the device. Always allowed (stopping is the safe
  // direction).
  stopMotion: (target: RobotDeviceTarget) => Promise<void>;
  // Drop the current target / return to the neutral reference.
  recenter?: (target: RobotDeviceTarget) => Promise<void>;
};

// ── Pose control (Phone Control) ──────────────────────────────────────────
// A controller session: the phone streams its relative pose while the user
// holds control; whatever serves the session maps it onto an arm. The
// session's own connection is NOT the arm's connection — an open session is
// no evidence the robot is online.

export type PoseSessionState = "disconnected" | "connecting" | "connected";

// Lifecycle events a screen reacts to (release the hold, reset tracking).
export type PoseSessionEvent = "open" | "error" | "close";

export type PoseTrackingState = "ready" | "tracking" | "limited" | "lost";

export type PoseEndpoint = { host: string; port: string; secure: boolean };

export type PoseFrame = {
  trackingState: PoseTrackingState;
  fineMode: boolean;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  gripperVelocity: number;
};

// The logical arm a pose session drives, resolved by the domain: the app
// arm id, its physical binding, and the facts a transport may need to map
// it onto its own channels. Never parsed from the arm's name.
export type RobotPoseTarget = RobotDeviceTarget & {
  model: RobotArmModel;
  role: "leader" | "follower";
  side?: "left" | "right" | "custom";
};

export type PoseSessionOptions = {
  platform: "android" | "ios";
  sessionId: string;
  target: RobotPoseTarget;
};

// One controller session. Sends happen only while the session is open;
// otherwise they are dropped. Never reconnects by itself.
export type PoseControlSession = {
  getState: () => PoseSessionState;
  // Synchronous: is the session open right now (not the last render's state)?
  isOpen: () => boolean;
  subscribe: (listener: () => void) => () => void;
  onEvent: (listener: (event: PoseSessionEvent) => void) => () => void;
  // false when the endpoint is incomplete or a session is already open/opening.
  open: (endpoint: PoseEndpoint) => boolean;
  // User-initiated close: state → disconnected and a "close" event.
  close: () => void;
  // Teardown (screen leaving): closes without emitting events.
  shutdown: () => void;
  sendPose: (frame: PoseFrame) => void;
  // Stop following the controller now; `reason` is a short machine string.
  stopMotion: (reason: string) => void;
  // Drop the current target; the next hold sets a new neutral.
  recenter?: () => void;
};

export type RobotPoseControlProvider = {
  readonly id: string;
  createSession: (options: PoseSessionOptions) => PoseControlSession;
};

export type RobotProvider = {
  readonly id: string;
  readonly mode: RobotProviderMode;
  readonly capabilities: RobotProviderCapabilities;
  readonly connection: RobotConnectionProvider;
  readonly calibration: RobotCalibrationProvider;
  readonly telemetry: RobotTelemetryProvider;
  readonly command: RobotCommandProvider;
  // Present when capabilities.poseControl is true.
  readonly poseControl?: RobotPoseControlProvider;
};
