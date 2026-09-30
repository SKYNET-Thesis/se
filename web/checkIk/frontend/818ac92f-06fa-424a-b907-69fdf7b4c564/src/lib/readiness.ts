import type {
  ArmSide,
  BackendCapabilities,
  CameraDevice,
  Dataset,
  EStopState,
  OperationalAlert,
  PairState,
  RobotDevice,
  ServiceHealth,
  TeleoperationSession,
  TrainingJob,
  WorkflowStep } from
'../types';

export interface PairReadiness {
  side: ArmSide;
  leader: RobotDevice;
  follower: RobotDevice;
  state: PairState;
  ready: boolean;
  reason: string | null;
}

const label = (side: ArmSide) => side === 'left' ? 'Left' : 'Right';

export function getPair(devices: RobotDevice[], side: ArmSide): PairReadiness {
  const leader = devices.find((d) => d.side === side && d.role === 'leader')!;
  const follower = devices.find((d) => d.side === side && d.role === 'follower')!;

  const missingPort = [leader, follower].find((d) => !d.serialPort);
  if (missingPort) {
    return {
      side,
      leader,
      follower,
      state: 'configuration-incomplete',
      ready: false,
      reason: `${label(side)} ${missingPort.role} has no serial port assigned. Configure the workspace before starting.`
    };
  }

  const missingHardware = [leader, follower].filter((d) => d.portPresent === false);
  if (missingHardware.length === 2) {
    return {
      side,
      leader,
      follower,
      state: 'offline',
      ready: false,
      reason: `Both ${label(side).toLowerCase()} arms are offline. Reconnect the devices before starting.`
    };
  }
  if (missingHardware.length === 1) {
    return {
      side,
      leader,
      follower,
      state: 'link-incomplete',
      ready: false,
      reason: `${label(side)} ${missingHardware[0].role} port is absent. Reconnect the USB device before starting teleoperation.`
    };
  }

  const uncalibrated = [leader, follower].filter((d) => d.calibration !== 'calibrated');
  if (uncalibrated.length) {
    return {
      side,
      leader,
      follower,
      state: 'needs-calibration',
      ready: false,
      reason: `${label(side)} ${uncalibrated.map((d) => d.role).join(' and ')} calibration is required before starting teleoperation.`
    };
  }

  return { side, leader, follower, state: 'ready', ready: true, reason: null };
}

export function getPairs(devices: RobotDevice[]): Record<ArmSide, PairReadiness> {
  return { left: getPair(devices, 'left'), right: getPair(devices, 'right') };
}

export function withSession(
pair: PairReadiness,
session: TeleoperationSession | null)
: PairReadiness {
  if (session && session.state === 'active' && session.sides.includes(pair.side)) {
    return { ...pair, state: 'active' };
  }
  return pair;
}

export interface DualArmAvailability {
  available: boolean;
  reason: string | null;
}

export function dualArmAvailability(
pairs: Record<ArmSide, PairReadiness>,
caps: BackendCapabilities,
services: ServiceHealth[],
estop: EStopState)
: DualArmAvailability {
  void services;
  if (!caps.supportsDualArmTeleoperation) {
    return {
      available: false,
      reason: 'Dual-arm operation is not supported by the connected backend.'
    };
  }
  if (estop !== 'ready') {
    return { available: false, reason: 'Emergency stop is active. Reset it before starting motion.' };
  }
  // Leader teleop uses the local dashboard API and a latest-value telemetry
  // channel; the WebXR socket is independent and may legitimately be offline.
  if (!pairs.left.ready) return { available: false, reason: pairs.left.reason };
  if (!pairs.right.ready) return { available: false, reason: pairs.right.reason };
  return { available: true, reason: null };
}

export function buildAlerts(
devices: RobotDevice[],
pairs: Record<ArmSide, PairReadiness>,
services: ServiceHealth[],
cameras: CameraDevice[],
estop: EStopState,
caps: BackendCapabilities)
: OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (estop === 'active') {
    alerts.push({
      id: 'estop',
      severity: 'critical',
      title: 'Emergency stop is active',
      detail: 'Torque has been released on all connected arms. Verify the physical rig, then reset the stop to resume.',
      actionLabel: 'Review safety state',
      actionTo: '/settings'
    });
  }

  devices.
  filter((d) => d.connection === 'offline').
  forEach((d) =>
  alerts.push({
    id: `${d.id}-offline`,
    severity: 'critical',
    title: `${d.name} is offline`,
    detail: `${d.serialPort ?? 'No port assigned'} is not responding. Scan serial ports or reseat the USB connection.`,
    actionLabel: 'Scan ports',
    actionTo: '/workspace'
  })
  );

  devices.
  filter((d) => d.connection === 'connected' && d.calibration !== 'calibrated').
  forEach((d) =>
  alerts.push({
    id: `${d.id}-cal`,
    severity: 'critical',
    title: `${d.name} is not calibrated`,
    detail: 'Teleoperation and recording are blocked for this pair until a calibration profile is saved.',
    actionLabel: 'Open calibration',
    actionTo: '/calibration'
  })
  );

  services.
  filter((s) => s.critical && s.status !== 'connected').
  forEach((s) =>
  alerts.push({
    id: `${s.id}-down`,
    severity: 'critical',
    title: `${s.name} is unavailable`,
    detail: `${s.address} did not respond to the last health check.`,
    actionLabel: 'Reconnect',
    actionTo: '/settings'
  })
  );

  services.
  filter((s) => !s.critical && s.status !== 'connected').
  forEach((s) =>
  alerts.push({
    id: `${s.id}-optional`,
    severity: 'optional',
    title: `${s.name} is unavailable`,
    detail:
    s.id === 'hf' ?
    'Dataset and model upload are paused. Local teleoperation, recording and local training are unaffected.' :
    'This optional service is not reachable.',
    actionLabel: 'Review integration',
    actionTo: '/integrations'
  })
  );

  cameras.
  filter((c) => c.connection === 'offline').
  forEach((c) =>
  alerts.push({
    id: `${c.id}-offline`,
    severity: 'optional',
    title: `${c.name} camera has no signal`,
    detail: `${c.source} is not streaming. Multi-camera recording will save ${cameras.filter((x) => x.connection === 'connected').length} of ${cameras.length} feeds.`,
    actionLabel: 'Open cameras',
    actionTo: '/cameras'
  })
  );

  if (!caps.supportsVRControl) {
    alerts.push({
      id: 'vr-unsupported',
      severity: 'optional',
      title: 'VR control is not implemented by this backend',
      detail: `${caps.backendName} ${caps.backendVersion} does not expose Quest controller mapping. The VR Control page runs in labelled demonstration mode.`,
      actionLabel: 'Review integration',
      actionTo: '/vr'
    });
  }

  void pairs;
  return alerts;
}

export function buildWorkflow(
pairs: Record<ArmSide, PairReadiness>,
devices: RobotDevice[],
session: TeleoperationSession | null,
datasets: Dataset[],
jobs: TrainingJob[],
models: number)
: WorkflowStep[] {
  const configured = devices.every((d) => d.serialPort);
  const uncal = devices.filter((d) => d.calibration !== 'calibrated');
  const running = jobs.find((j) => j.status === 'running');
  const anyPairReady = pairs.left.ready || pairs.right.ready;
  const trainingReadyDs = datasets.find((d) => d.trainingReady);

  return [
  {
    id: 'configure',
    label: 'Configure',
    state: configured ? 'complete' : 'attention',
    detail: configured ? 'All four devices have assigned ports' : 'Port assignments missing',
    to: '/workspace'
  },
  {
    id: 'calibrate',
    label: 'Calibrate',
    state: uncal.length === 0 ? 'complete' : 'attention',
    detail:
    uncal.length === 0 ?
    'All four arms calibrated' :
    `${uncal.length} device${uncal.length > 1 ? 's' : ''} need calibration`,
    to: '/calibration'
  },
  {
    id: 'teleoperate',
    label: 'Teleoperate',
    state: session?.state === 'active' ? 'active' : anyPairReady ? 'ready' : 'blocked',
    detail:
    session?.state === 'active' ?
    'Session running' :
    anyPairReady ?
    pairs.left.ready && pairs.right.ready ?
    'Dual-arm available' :
    'Single-arm available' :
    'Blocked — no ready pair',
    to: '/teleoperation'
  },
  {
    id: 'record',
    label: 'Record',
    state: anyPairReady ? 'ready' : 'blocked',
    detail: anyPairReady ? 'Ready to capture episodes' : 'Needs a ready arm pair',
    to: '/recording'
  },
  {
    id: 'dataset',
    label: 'Dataset',
    state: datasets.length ? 'complete' : 'not-started',
    detail: `${datasets.length} datasets · ${datasets.reduce((a, d) => a + d.episodes, 0)} episodes`,
    to: '/datasets'
  },
  {
    id: 'train',
    label: 'Train',
    state: running ? 'active' : trainingReadyDs ? 'ready' : 'not-started',
    detail: running ?
    `${running.name} · step ${running.step.toLocaleString()}` :
    trainingReadyDs ?
    'Training available' :
    'No dataset ready',
    to: '/training'
  },
  {
    id: 'inference',
    label: 'Inference',
    state: models ? anyPairReady ? 'ready' : 'blocked' : 'not-started',
    detail: models ?
    anyPairReady ?
    `${models} models available` :
    'Blocked — hardware not ready' :
    'No trained models',
    to: '/inference'
  }];

}
