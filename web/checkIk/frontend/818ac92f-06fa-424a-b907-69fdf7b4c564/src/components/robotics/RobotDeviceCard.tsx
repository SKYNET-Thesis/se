import React from 'react';
import { Link } from 'react-router-dom';
import { CpuIcon, PlugIcon, PlugZapIcon, TargetIcon, ThermometerIcon, ZapIcon, ZapOffIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { JointTelemetryList } from './JointTelemetryList';
import { cx, NOT_AVAILABLE } from '../../lib/format';
import type { RobotDevice } from '../../types';

const accentFor = (side: 'left' | 'right') => side === 'left' ? '#35c9d0' : '#a78bfa';

function ConnectionBadge({ device }: {device: RobotDevice;}) {
  switch (device.connection) {
    case 'connected':
      return <Badge tone="ok">Connected</Badge>;
    case 'connecting':
      return <Badge tone="warn">Connecting…</Badge>;
    case 'reconnecting':
      return <Badge tone="warn">Reconnecting…</Badge>;
    case 'error':
      return <Badge tone="danger">Error</Badge>;
    case 'unconfigured':
      return <Badge tone="neutral">Not configured</Badge>;
    default:
      return <Badge tone="danger">Offline</Badge>;
  }
}

export function CalibrationStatusBadge({ device }: {device: RobotDevice;}) {
  if (device.calibration === 'calibrated') return <Badge tone="ok">Calibrated</Badge>;
  if (device.calibration === 'calibrating') return <Badge tone="warn">Calibrating…</Badge>;
  if (device.calibration === 'stale') return <Badge tone="warn">Calibration stale</Badge>;
  if (device.calibration === 'unknown') return <Badge tone="neutral">Calibration unknown</Badge>;
  return <Badge tone="warn">Calibration required</Badge>;
}

export function TorqueStatusBadge({ device }: {device: RobotDevice;}) {
  const { capabilities } = useLab();
  if (!capabilities.supportsTorqueControl)
  return <Badge tone="neutral">Torque not reported</Badge>;
  if (device.torqueEnabled === null) return <Badge tone="neutral">Torque {NOT_AVAILABLE.toLowerCase()}</Badge>;
  return device.torqueEnabled ?
  <Badge tone="warn" icon={ZapIcon}>
      Torque on
    </Badge> :

  <Badge tone="neutral" icon={ZapOffIcon}>
      Torque off
    </Badge>;

}

export function RobotDeviceCard({
  device,
  detailed



}: {device: RobotDevice;detailed: boolean;}) {
  const { connectDevice, disconnectDevice, toggleTorque, capabilities } = useLab();
  const accent = accentFor(device.side);
  const online = device.connection === 'connected';

  return (
    <Card className="flex flex-col" accent={device.side}>
      {/* Zone 1 — identity */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{ color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}14` }}>
          
          <CpuIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink truncate">{device.name}</h3>
          <p className="text-sm text-ink2 capitalize">
            SO-101 {device.role} · {device.side} side
          </p>
        </div>
      </div>

      {/* Zone 2 — connection */}
      <div className="mt-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-2 py-0.5">
            <PlugIcon className="h-3.5 w-3.5 text-faint" />
            <span className="font-mono text-xs text-ink2">{device.serialPort ?? 'No port assigned'}</span>
          </span>
          <ConnectionBadge device={device} />
        </div>
      </div>

      {/* Zone 3 — operational state */}
      <div className="mt-2.5 px-4 flex flex-wrap items-center gap-2">
        <CalibrationStatusBadge device={device} />
        <TorqueStatusBadge device={device} />
        <span className="inline-flex items-center gap-1.5 text-xs text-ink2">
          <ThermometerIcon className="h-3.5 w-3.5 text-faint" />
          <span className="font-mono">
            {capabilities.supportsDeviceTemperature && device.temperatureC !== null ?
            `${device.temperatureC}°C` :
            NOT_AVAILABLE}
          </span>
        </span>
      </div>

      {/* Zone 4 — telemetry */}
      <div className="mt-3.5 mx-4 rounded-xl border border-line bg-elev/70 p-3">
        {!online ?
        <p className="text-sm text-faint">
            Joint telemetry is unavailable while the device is offline.
          </p> :
        detailed ?
        <JointTelemetryList joints={device.joints} accent={accent} /> :

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Metric label="Gripper" value={device.gripper === null ? NOT_AVAILABLE : `${device.gripper}%`} />
            <Metric
            label="Firmware"
            value={capabilities.supportsFirmwareReporting && device.firmware ? `v${device.firmware}` : NOT_AVAILABLE} />
          
            <Metric
            label="Motion"
            value={
            device.joints[0].value === null ?
            NOT_AVAILABLE :
            `pan ${device.joints[0].value.toFixed(1)}° · lift ${device.joints[1].value?.toFixed(1)}°`
            }
            wide />
          
          </div>
        }
      </div>

      {/* Zone 5 — actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 px-4 py-3.5">
        {online ?
        <Button size="sm" icon={PlugIcon} onClick={() => disconnectDevice(device.id)}>
            Disconnect
          </Button> :

        <Button size="sm" variant="primary" icon={PlugZapIcon} onClick={() => connectDevice(device.id)}>
            Connect
          </Button>
        }
        <Button
          size="sm"
          icon={device.torqueEnabled ? ZapOffIcon : ZapIcon}
          disabled={!online || !capabilities.supportsTorqueControl}
          onClick={() => toggleTorque(device.id)}
          title={
          capabilities.supportsTorqueControl ?
          undefined :
          'Torque control is not exposed by the connected backend'
          }>
          
          {device.torqueEnabled ? 'Release torque' : 'Engage torque'}
        </Button>
        <Link
          to="/calibration"
          className={cx(
            'inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm transition-colors duration-150 ease-smooth',
            device.calibration === 'calibrated' ?
            'border-line bg-subtle text-ink2 hover:text-ink' :
            'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20'
          )}>
          
          <TargetIcon className="h-4 w-4" />
          {device.calibration === 'calibrated' ? 'Calibration' : 'Calibrate'}
        </Link>
      </div>
    </Card>);

}

function Metric({ label, value, wide }: {label: string;value: string;wide?: boolean;}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <p className="text-xs text-faint">{label}</p>
      <p className="font-mono text-sm text-ink truncate">{value}</p>
    </div>);

}