import React from 'react';
import { Badge, SideBadge } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { JointTelemetryList } from '../robotics/JointTelemetryList';
import { useLab } from '../../contexts/LabContext';
import { NOT_AVAILABLE } from '../../lib/format';
import type { PairReadiness } from '../../lib/readiness';

export function ArmControlPanel({ pair }: {pair: PairReadiness;}) {
  const { session, workspace, capabilities } = useLab();
  const accent = pair.side === 'left' ? '#35c9d0' : '#a78bfa';
  const online = pair.follower.connection === 'connected' && pair.leader.connection === 'connected';

  return (
    <Card accent={pair.side} className="arm-control-card flex flex-col">
      <CardHeader
        title={pair.side === 'left' ? 'Left arm' : 'Right arm'}
        actions={<SideBadge side={pair.side} />}
        description={`${pair.leader.serialPort ?? '—'} → ${pair.follower.serialPort ?? '—'}`} />
      

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <State label="Leader" ok={pair.leader.connection === 'connected'} />
          <State label="Follower" ok={pair.follower.connection === 'connected'} />
          <State
            label="Calibration"
            ok={pair.leader.calibration === 'calibrated' && pair.follower.calibration === 'calibrated'} />
          
          <State
            label="Torque"
            ok={Boolean(pair.follower.torqueEnabled)}
            offLabel={capabilities.supportsTorqueControl ? 'Off' : NOT_AVAILABLE}
            onLabel="Engaged" />
          
        </div>

        <div className="telemetry-panel rounded-xl border border-line bg-elev/60 p-3">
          <p className="mb-2.5 text-sm font-medium text-ink2">Joint telemetry</p>
          {online ?
          <JointTelemetryList joints={pair.follower.joints} accent={accent} columns={1} /> :

          <p className="text-sm text-faint">{pair.reason}</p>
          }
        </div>

        <dl className="space-y-1.5 text-sm">
          <Row
            label="Gripper"
            value={pair.follower.gripper === null ? NOT_AVAILABLE : `${pair.follower.gripper}%`} />
          
          <Row label="Movement speed" value={`${workspace.safety.maxSpeedPct}%`} />
          <Row
            label="Latency"
            value={session?.state === 'active' ? `${session.latencyMs} ms` : NOT_AVAILABLE} />
          
          <Row
            label="Temperature"
            value={pair.follower.temperatureC === null ? NOT_AVAILABLE : `${pair.follower.temperatureC}°C`} />
          
        </dl>
      </div>
    </Card>);

}

function State({
  label,
  ok,
  onLabel = 'Connected',
  offLabel = 'Not ready'





}: {label: string;ok: boolean;onLabel?: string;offLabel?: string;}) {
  return (
    <div className="rounded-lg border border-line bg-subtle px-2.5 py-2">
      <p className="text-xs text-faint">{label}</p>
      <Badge tone={ok ? 'ok' : 'warn'} className="mt-1">
        {ok ? onLabel : offLabel}
      </Badge>
    </div>);

}

function Row({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink2">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>);

}
