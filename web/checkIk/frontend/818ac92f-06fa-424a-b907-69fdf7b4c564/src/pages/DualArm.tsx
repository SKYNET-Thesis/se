import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CopyIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SplitIcon,
  SquareIcon,
  VideoIcon } from
'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { ArmControlPanel } from '../components/teleoperation/ArmControlPanel';
import { CommandDock } from '../components/teleoperation/CommandDock';
import { SO101DigitalTwin } from '../components/teleoperation/SO101DigitalTwin';
import { TelemetryDrawer } from '../components/teleoperation/TelemetryDrawer';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { ObservationRail } from '../components/cameras/ObservationRail';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness, useDualArmAvailability, useSessionClock } from '../hooks/useLabDerived';
import { cx, formatDuration } from '../lib/format';

export function DualArm() {
  const {
    session,
    startSession,
    pauseSession,
    stopSession,
    recoverDualSession,
    operationProfile,
    setOperationProfile,
    setSync,
    toggleSessionRecording,
    cameras,
    capabilities,
    motionEnabled,
    backendTask,
    stopBackendTask
  } = useLab();
  const pairs = useArmPairReadiness();
  const dual = useDualArmAvailability();
  const elapsed = useSessionClock();
  const navigate = useNavigate();
  const [cameraVisible, setCameraVisible] = React.useState({ overhead: false, left: false, right: false });

  const active = session?.state === 'active' && session.mode === 'dual';
  const dualSession = session?.mode === 'dual';
  const connecting = (session?.state === 'starting' && session.mode === 'dual') ||
    (backendTask?.kind === 'leader-teleop' && backendTask.running && !active);
  const overhead = cameras.find((c) => c.role === 'overhead')!;
  const leftWrist = cameras.find((c) => c.role === 'left-wrist')!;
  const rightWrist = cameras.find((c) => c.role === 'right-wrist')!;

  return (
    <div className="control-page mx-auto max-w-[112rem] space-y-5">
      <PageHeader
        title="Dual-arm teleoperation"
        description="Bimanual workspace — both leader arms drive their followers through a single synchronized session."
        meta={
        <>
            {!active ? <SimulatedBadge /> : null}
            <Badge tone={motionEnabled ? 'ok' : 'warn'}>{motionEnabled ? 'Real motion unlocked' : 'Real motion locked'}</Badge>
            <Badge tone={capabilities.supportsDualArmTeleoperation ? 'ok' : 'danger'}>
              {capabilities.supportsDualArmTeleoperation ?
            `Dual-arm supported by ${capabilities.backendName} ${capabilities.backendVersion}` :
            'Dual-arm not supported by this backend'}
            </Badge>
          </>
        }
        actions={<Button size="sm" onClick={() => navigate('/teleoperation')}>Open single-arm workspace</Button>} />
      

      <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink2 xl:hidden">
        This workspace is designed for a wide display. On a small screen you can monitor state, but start dual-arm
        motion from a desktop station.
      </p>

      <Card className="control-profile-card">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-ink">Operating profile</p>
            <p className="mt-1 text-sm text-ink2">
              {operationProfile === 'exhibition'
                ? 'Exhibition: both pairs run at 50 Hz, use 5 Hz telemetry, a 2° envelope, and zero-jump recovery.'
                : 'Project: both calibrated leaders mirror their followers directly at the higher experimental rate.'}
            </p>
          </div>
          <div className="inline-flex shrink-0 rounded-xl border border-line bg-elev p-1" role="group" aria-label="Operating profile">
            {(['exhibition', 'project'] as const).map((profile) =>
              <button
                key={profile}
                type="button"
                disabled={Boolean(dualSession)}
                onClick={() => setOperationProfile(profile)}
                aria-pressed={operationProfile === profile}
                className={cx(
                  'h-9 rounded-lg px-4 text-sm font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  operationProfile === profile ? 'bg-brand text-[#1a0d05]' : 'text-ink2 hover:text-ink'
                )}>
                {profile}
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="dual-control-grid control-center-layout grid gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <aside className="control-telemetry-rail"><ArmControlPanel pair={pairs.left} /></aside>

        <div className="space-y-4 order-first xl:order-none">
          <Card className="dual-workspace-card">
            <CardHeader
              title="Bimanual workspace"
              description={
              active ?
              `Session live · ${formatDuration(elapsed)} · ${session?.sync === 'mirror' ? 'mirror' : 'independent'} mode` :
              connecting ? 'Connecting both leaders and both followers…' :
              dual.reason ?? 'Both pairs ready — dual-arm teleoperation can start.'
              }
              actions={
              active ?
              <Badge tone="brand" withIcon={false}>
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Live
                  </Badge> :

              connecting ? <Badge tone="warn">Connecting…</Badge> :

              <Badge tone={dual.available ? 'ok' : 'warn'}>{dual.available ? 'Ready' : 'Blocked'}</Badge>

              } />
            
            <div className="p-4 space-y-4">
              <SO101DigitalTwin
                left={pairs.left.follower}
                right={pairs.right.follower}
                live={Boolean(active)} />
              
              <div className="control-camera-toggles flex flex-wrap gap-2">
                <Button size="sm" icon={VideoIcon} variant={cameraVisible.left ? 'primary' : 'secondary'} onClick={() => setCameraVisible((v) => ({ ...v, left: !v.left }))}>Left wrist camera {cameraVisible.left ? 'ON' : 'OFF'}</Button>
                <Button size="sm" icon={VideoIcon} variant={cameraVisible.right ? 'primary' : 'secondary'} onClick={() => setCameraVisible((v) => ({ ...v, right: !v.right }))}>Right wrist camera {cameraVisible.right ? 'ON' : 'OFF'}</Button>
                <Button size="sm" icon={VideoIcon} variant={cameraVisible.overhead ? 'primary' : 'secondary'} onClick={() => setCameraVisible((v) => ({ ...v, overhead: !v.overhead }))}>Overhead {cameraVisible.overhead ? 'ON' : 'OFF'}</Button>
              </div>
              <div className="control-camera-grid grid gap-3 sm:grid-cols-3">
                {cameraVisible.overhead ? <CameraFeedCard camera={overhead} /> : null}
                {cameraVisible.left ? <CameraFeedCard camera={leftWrist} /> : null}
                {cameraVisible.right ? <CameraFeedCard camera={rightWrist} /> : null}
              </div>
              <ObservationRail cameras={cameras} title="Live observation" />
            </div>

          </Card>
        </div>

        <aside className="control-telemetry-rail"><ArmControlPanel pair={pairs.right} /></aside>
      </div>

      <TelemetryDrawer />

      <CommandDock
        status={<><span className={active ? 'status-live' : connecting ? 'status-connecting' : 'status-idle'} /> {active ? `Dual-arm live ${formatDuration(elapsed)}` : connecting ? 'Connecting four boards' : 'Dual-arm session idle'} <span className="command-dock__status-detail">{dual.reason ?? 'Both arm pairs are available'}</span></>}
      >
        {active ?
          <>
            <Button icon={PauseIcon} onClick={pauseSession}>{session?.state === 'paused' ? 'Resume' : 'Pause'}</Button>
            <Button icon={RotateCcwIcon} onClick={recoverDualSession}>Recover both</Button>
            <Button icon={VideoIcon} variant={session?.recording ? 'danger' : 'secondary'} onClick={toggleSessionRecording}>{session?.recording ? 'Stop recording' : 'Record'}</Button>
            <div className="command-dock__mode-group" role="group" aria-label="Synchronization mode">
              <Button size="sm" variant={session?.sync === 'independent' ? 'secondary' : 'ghost'} icon={SplitIcon} onClick={() => setSync('independent')}>Independent</Button>
              <Button size="sm" variant={session?.sync === 'mirror' ? 'secondary' : 'ghost'} icon={CopyIcon} onClick={() => setSync('mirror')}>Mirror</Button>
            </div>
            <Button size="sm" icon={LinkIcon} onClick={() => setSync('mirror')}>Sync</Button>
            <Button variant="danger" icon={SquareIcon} onClick={stopSession}>Stop</Button>
          </> : connecting ?
          <>
            <Button variant="secondary" disabled>Connecting four SO-101 boards…</Button>
            <Button variant="danger" icon={SquareIcon} onClick={stopBackendTask}>Cancel connection</Button>
          </> :
          <Button variant="primary" icon={PlayIcon} disabled={!dual.available || !motionEnabled} title={!motionEnabled ? 'Restart the dashboard backend with --enable-motion' : dual.reason ?? undefined} onClick={() => startSession('dual', ['left', 'right'])}>Start dual teleoperation</Button>}
      </CommandDock>
    </div>);

}
