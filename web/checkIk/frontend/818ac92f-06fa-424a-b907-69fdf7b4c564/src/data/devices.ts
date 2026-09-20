import type {
  CameraDevice,
  RobotDevice,
  SerialPort,
  ServiceHealth,
  JointReading,
  BackendCapabilities,
  OperatorDevice,
  VRHeadset } from
'../types';

const joints = (vals: (number | null)[]): JointReading[] => [
{ name: 'shoulder_pan', label: 'Shoulder pan', value: vals[0], unit: '°', min: -110, max: 110 },
{ name: 'shoulder_lift', label: 'Shoulder lift', value: vals[1], unit: '°', min: -90, max: 90 },
{ name: 'elbow_flex', label: 'Elbow flex', value: vals[2], unit: '°', min: -120, max: 120 },
{ name: 'wrist_flex', label: 'Wrist flex', value: vals[3], unit: '°', min: -90, max: 90 },
{ name: 'wrist_roll', label: 'Wrist roll', value: vals[4], unit: '°', min: -180, max: 180 },
{ name: 'gripper', label: 'Gripper', value: vals[5], unit: '%', min: 0, max: 100 }];


export const initialDevices: RobotDevice[] = [
{
  id: 'left-leader',
  name: 'Left Leader Arm',
  side: 'left',
  role: 'leader',
  model: 'SO-101',
  serialPort: null,
  connection: 'unconfigured',
  calibration: 'unknown',
  calibrationProfile: null,
  torqueEnabled: null,
  temperatureC: null,
  firmware: null,
  gripper: null,
  joints: joints([null, null, null, null, null, null])
},
{
  id: 'left-follower',
  name: 'Left Follower Arm',
  side: 'left',
  role: 'follower',
  model: 'SO-101',
  serialPort: null,
  connection: 'unconfigured',
  calibration: 'unknown',
  calibrationProfile: null,
  torqueEnabled: null,
  temperatureC: null,
  firmware: null,
  gripper: null,
  joints: joints([null, null, null, null, null, null])
},
{
  id: 'right-leader',
  name: 'Right Leader Arm',
  side: 'right',
  role: 'leader',
  model: 'SO-101',
  serialPort: null,
  connection: 'unconfigured',
  calibration: 'unknown',
  calibrationProfile: null,
  torqueEnabled: null,
  temperatureC: null,
  firmware: null,
  gripper: null,
  joints: joints([null, null, null, null, null, null])
},
{
  id: 'right-follower',
  name: 'Right Follower Arm',
  side: 'right',
  role: 'follower',
  model: 'SO-101',
  serialPort: null,
  connection: 'unconfigured',
  calibration: 'unknown',
  calibrationProfile: null,
  torqueEnabled: null,
  temperatureC: null,
  firmware: null,
  gripper: null,
  joints: joints([null, null, null, null, null, null])
}];


export const initialPorts: SerialPort[] = [];


export const initialCameras: CameraDevice[] = [
{
  id: 'cam-overhead',
  name: 'Overhead',
  source: '',
  connection: 'unconfigured',
  resolution: null,
  fps: null,
  recording: false,
  role: 'overhead'
},
{
  id: 'cam-left-wrist',
  name: 'Left Wrist',
  source: '',
  connection: 'unconfigured',
  resolution: null,
  fps: null,
  recording: false,
  role: 'left-wrist'
},
{
  id: 'cam-right-wrist',
  name: 'Right Wrist',
  source: '',
  connection: 'unconfigured',
  resolution: null,
  fps: null,
  recording: false,
  role: 'right-wrist'
},
{
  id: 'cam-front',
  name: 'Front Scene',
  source: '',
  connection: 'unconfigured',
  resolution: null,
  fps: null,
  recording: false,
  role: 'front'
}];


export const initialServices: ServiceHealth[] = [
{
  id: 'api',
  name: 'LeLab API',
  address: 'http://localhost:8000',
  status: 'offline',
  latencyMs: null,
  lastCheck: 'not checked',
  critical: true
},
{
  id: 'ws',
  name: 'VR Teleop WebSocket',
  address: 'ws://localhost:8000/ws/teleop',
  status: 'offline',
  latencyMs: null,
  lastCheck: 'not checked',
  // The socket exists only while a VR teleop task is running. Leader teleop
  // talks to the local worker directly and must not be blocked by this.
  critical: false
},
{
  id: 'trainer',
  name: 'Training Worker',
  address: 'http://localhost:8000/train',
  status: 'offline',
  latencyMs: null,
  lastCheck: 'not checked',
  critical: false
},
{
  id: 'hf',
  name: 'Hugging Face Hub Sync',
  address: 'https://huggingface.co',
  status: 'offline',
  latencyMs: null,
  lastCheck: '2 min ago',
  critical: false
}];


export const capabilities: BackendCapabilities = {
  backendName: 'leLab-extended',
  backendVersion: '0.4.1',
  supportsSingleArmTeleoperation: true,
  supportsDualArmTeleoperation: true,
  supportsVRControl: true,
  supportsMultiCameraRecording: true,
  supportsCloudTraining: false,
  supportsMobilePairing: true,
  supportsTorqueControl: true,
  supportsDeviceTemperature: true,
  supportsFirmwareReporting: true
};

export const initialHeadset: VRHeadset = {
  id: 'quest3',
  name: 'Meta Quest 3',
  connected: false,
  batteryPct: null,
  refreshHz: null,
  wifiQuality: null,
  trackingQuality: null,
  latencyMs: null,
  controllers: [
  { side: 'left', connected: false, batteryPct: null, trackingConfidence: null, grip: null, trigger: null },
  { side: 'right', connected: false, batteryPct: null, trackingConfidence: null, grip: null, trigger: null }]

};

export const initialOperatorDevices: OperatorDevice[] = [
{
  id: 'quest3',
  name: 'Meta Quest 3',
  role: 'VR operator headset',
  connected: false,
  batteryPct: null,
  detail: 'Open the WebXR client on Quest to connect'
},
{
  id: 'ipad',
  name: 'iPad Pro · Bench A',
  role: 'Monitoring companion',
  connected: false,
  batteryPct: null,
  detail: 'Not configured'
},
{
  id: 'pixel',
  name: 'Pixel 8 · Companion app',
  role: 'Phone camera / alerts',
  connected: false,
  batteryPct: null,
  detail: 'Not on the lab network'
}];
