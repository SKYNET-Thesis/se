import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  PlayIcon,
  ShieldCheckIcon,
  SquareIcon } from
'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge, SideBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { useArmPairReadiness, useDualArmAvailability, useSessionClock } from '../../hooks/useLabDerived';
import { cx, formatDuration } from '../../lib/format';

function ReadinessRow({
  label,
  ok,
  detail




}: {label: string;ok: boolean;detail: string;}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {ok ?
      <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> :

      <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      }
      <div className="min-w-0">
        <p className="text-base text-ink">{label}</p>
        <p className="text-sm text-ink2">{detail}</p>
      </div>
    </div>);

}

export function TeleoperationReadinessCard() {
  const { session, startSession, stopSession, capabilities, estop, workspace } = useLab();
  const pairs = useArmPairReadiness();
  const dual = useDualArmAvailability();
  const navigate = useNavigate();
  const elapsed = useSessionClock();

  const active = session?.state === 'active';

  return (
    <Card accent={dual.available ? 'brand' : undefined}>
      <CardHeader
        title="Teleoperation Session"
        description={
        active ?
        `${session.mode === 'dual' ? 'Dual-arm' : session.mode === 'vr' ? 'VR' : 'Single-arm'} session running · ${formatDuration(elapsed)} · ${session.latencyMs} ms` :
        'Leader arms drive their paired followers over the backend teleoperation socket.'
        }
        icon={PlayIcon}
        actions={
        active ?
        <Badge tone="brand" withIcon={false}>
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Live
            </Badge> :

        <Badge tone={dual.available ? 'ok' : 'warn'}>
              {dual.available ? 'Dual-arm ready' : 'Dual-arm blocked'}
            </Badge>

        } />
      

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr_minmax(0,18rem)]">
        {(['left', 'right'] as const).map((side) => {
          const pair = pairs[side];
          return (
            <div key={side} className="min-w-0">
              <div className="flex items-center gap-2">
                <SideBadge side={side} />
                <span
                  className={cx(
                    'text-sm font-medium',
                    pair.ready ? 'text-ok' : 'text-warn'
                  )}>
                  
                  {pair.state === 'active' ? 'Active' : pair.ready ? 'Ready' : 'Not ready'}
                </span>
              </div>
              <div className="mt-2 divide-y divide-line/70">
                <ReadinessRow
                  label="Leader / follower link"
                  ok={pair.leader.connection === 'connected' && pair.follower.connection === 'connected'}
                  detail={`${pair.leader.serialPort ?? 'no port'} → ${pair.follower.serialPort ?? 'no port'}`} />
                
                <ReadinessRow
                  label="Calibration"
                  ok={pair.leader.calibration === 'calibrated' && pair.follower.calibration === 'calibrated'}
                  detail={
                  pair.leader.calibration === 'calibrated' && pair.follower.calibration === 'calibrated' ?
                  'Both profiles loaded' :
                  'A saved calibration profile is required for both arms'
                  } />
                
              </div>
              {pair.reason ?
              <p className="mt-2 rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-sm text-warn">
                  {pair.reason}
                </p> :
              null}
            </div>);

        })}

        <div className="min-w-0 rounded-xl border border-line bg-elev/60 p-4">
          <p className="text-sm font-medium text-ink2">Mode & safety</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-ink2">Preferred mode</dt>
              <dd className="font-mono text-ink capitalize">{workspace.preferredMode}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink2">Speed limit</dt>
              <dd className="font-mono text-ink">{workspace.safety.maxSpeedPct}%</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink2">E-stop</dt>
              <dd className={cx('font-mono', estop === 'ready' ? 'text-ok' : 'text-danger')}>
                {estop === 'ready' ? 'READY' : 'ACTIVE'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink2">Backend</dt>
              <dd className="font-mono text-ink">
                {capabilities.supportsDualArmTeleoperation ? 'dual capable' : 'single only'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-start gap-2 text-xs text-faint">
            <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Motion is disabled for any arm the backend reports as offline or uncalibrated.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
        {active ?
        <Button variant="danger" icon={SquareIcon} onClick={stopSession}>
            Stop session
          </Button> :

        <>
            <Button
            variant={dual.available ? 'primary' : 'secondary'}
            icon={PlayIcon}
            disabled={!dual.available}
            title={dual.reason ?? undefined}
            onClick={() => {
              startSession('dual', ['left', 'right']);
              navigate('/dual-arm');
            }}>
            
              Start Dual-Arm Teleoperation
            </Button>
            <Button
            variant="accent-left"
            disabled={!pairs.left.ready || estop !== 'ready'}
            onClick={() => {
              startSession('single', ['left']);
              navigate('/teleoperation');
            }}>
            
              Start Left Arm
            </Button>
            <Button
            variant="accent-right"
            disabled={!pairs.right.ready || estop !== 'ready'}
            onClick={() => {
              startSession('single', ['right']);
              navigate('/teleoperation');
            }}>
            
              Start Right Arm
            </Button>
          </>
        }
        {!active && dual.reason ?
        <p className="text-sm text-ink2 basis-full sm:basis-auto">{dual.reason}</p> :
        null}
      </div>
    </Card>);

}