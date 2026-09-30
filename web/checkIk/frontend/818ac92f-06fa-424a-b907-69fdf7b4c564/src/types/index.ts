export type ArmSide = 'left' | 'right';
export type DeviceRole = 'leader' | 'follower';

export type ConnectionStatus =
'connected' |
'offline' |
'connecting' |
'reconnecting' |
'error' |
'unconfigured';

export type CalibrationStatus =
'calibrated' |
'required' |
'calibrating' |
'stale' |
'unknown';

export type PairState =
'ready' |
'active' |
'offline' |
'link-incomplete' |
'needs-calibration' |
'configuration-incomplete';

export type TeleopMode = 'single' | 'dual' | 'vr';
export type OperationProfile = 'exhibition' | 'project';
export type SessionState =
'idle' |
'starting' |
'active' |
'paused' |
'stopped' |
'error';

export type EStopState = 'ready' | 'active' | 'reset-required';

export interface JointReading {
  name: string;
  label: string;
  value: number | null;
  unit: '°' | '%';
  min: number;
  max: number;
}

export interface JointTelemetry {
  deviceId: string;
  joints: JointReading[];
  updatedAt: number;
  stale: boolean;
}

export interface CalibrationProfile {
  id: string;
  name: string;
  createdAt: string;
  jointCount: number;
}

export interface RobotDevice {
  id: string;
  name: string;
  side: ArmSide;
  role: DeviceRole;
  model: 'SO-101';
  serialPort: string | null;
  portPresent?: boolean;
  connection: ConnectionStatus;
  calibration: CalibrationStatus;
  calibrationProfile: CalibrationProfile | null;
  torqueEnabled: boolean | null;
  temperatureC: number | null;
  firmware: string | null;
  gripper: number | null;
  joints: JointReading[];
}

export interface SerialPort {
  path: string;
  description: string;
  assignedTo: string | null;
  present: boolean;
}

export interface CameraDevice {
  id: string;
  name: string;
  source: string;
  connection: ConnectionStatus;
  resolution: string | null;
  fps: number | null;
  recording: boolean;
  role: 'overhead' | 'left-wrist' | 'right-wrist' | 'front';
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  ports: Record<string, string | null>;
  cameras: Record<string, string | null>;
  vrHeadsetId: string | null;
  mobileCompanionId: string | null;
  preferredMode: TeleopMode;
  safety: {
    maxSpeedPct: number;
    jointLimits: 'workspace-profile' | 'firmware-default';
    onConnectionLoss: 'hold-position' | 'release-torque' | 'return-home';
    sessionTimeoutMin: number;
  };
  dirty: boolean;
}

export interface BackendCapabilities {
  backendName: string;
  backendVersion: string;
  supportsSingleArmTeleoperation: boolean;
  supportsDualArmTeleoperation: boolean;
  supportsVRControl: boolean;
  supportsMultiCameraRecording: boolean;
  supportsCloudTraining: boolean;
  supportsMobilePairing: boolean;
  supportsTorqueControl: boolean;
  supportsDeviceTemperature: boolean;
  supportsFirmwareReporting: boolean;
}

export interface ServiceHealth {
  id: string;
  name: string;
  address: string;
  status: ConnectionStatus;
  latencyMs: number | null;
  lastCheck: string;
  critical: boolean;
}

export interface VRController {
  side: ArmSide;
  connected: boolean;
  batteryPct: number | null;
  trackingConfidence: 'high' | 'medium' | 'low' | null;
  grip: number | null;
  trigger: number | null;
}

export interface VRHeadset {
  id: string;
  name: string;
  connected: boolean;
  batteryPct: number | null;
  refreshHz: number | null;
  wifiQuality: 'excellent' | 'good' | 'poor' | null;
  trackingQuality: 'high' | 'medium' | 'low' | null;
  latencyMs: number | null;
  controllers: VRController[];
}

export interface OperatorDevice {
  id: string;
  name: string;
  role: string;
  connected: boolean;
  batteryPct: number | null;
  detail: string;
}

export interface TeleoperationSession {
  id: string;
  mode: TeleopMode;
  sides: ArmSide[];
  state: SessionState;
  startedAt: number;
  latencyMs: number;
  commandRateHz: number;
  recording: boolean;
  sync: 'independent' | 'mirror';
}

export interface DatasetEpisode {
  id: string;
  index: number;
  durationSec: number;
  recordedAt: string;
  arms: 'left' | 'right' | 'dual';
  vr: boolean;
  cameras: number;
  quality: 'good' | 'review' | 'discarded';
  notes: string;
}

export interface Dataset {
  id: string;
  name: string;
  repoId: string | null;
  type: 'Single Arm' | 'Dual Arm';
  episodes: number;
  durationMin: number;
  cameras: number;
  sizeGb: number;
  uploadStatus: 'local-only' | 'uploaded' | 'uploading' | 'failed';
  vrRecorded: boolean;
  lastModified: string;
  trainingReady: boolean;
  episodeList: DatasetEpisode[];
}

export interface TrainingConfiguration {
  datasetId: string;
  policy: string;
  compute: string;
  steps: number;
  batchSize: number;
  learningRate: string;
  checkpointInterval: number;
  tracking: boolean;
}

export interface TrainingJob {
  id: string;
  name: string;
  datasetName: string;
  policy: string;
  compute: string;
  status: 'running' | 'queued' | 'completed' | 'failed' | 'stopped';
  step: number;
  totalSteps: number;
  loss: number;
  etaMin: number | null;
  gpuUtilPct: number | null;
  memoryGb: number | null;
  startedAt: string;
  location: 'local' | 'cloud';
  losses: {step: number;loss: number;}[];
  logs: string[];
}

export interface TrainedModel {
  id: string;
  name: string;
  policy: string;
  dataset: string;
  arms: 'Single Arm' | 'Dual Arm';
  robot: 'SO-101';
  trainedAt: string;
  checkpoints: number;
  location: string;
  uploaded: boolean;
  cameras: number;
}

export interface ActivityEvent {
  id: string;
  at: string;
  kind: 'device' | 'calibration' | 'recording' | 'dataset' | 'training' | 'vr' | 'model';
  message: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
}

export type AlertSeverity = 'critical' | 'optional';

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
}

export type WorkflowStepState =
'not-started' |
'complete' |
'ready' |
'active' |
'blocked' |
'attention';

export interface WorkflowStep {
  id: string;
  label: string;
  state: WorkflowStepState;
  detail: string;
  to: string;
}
