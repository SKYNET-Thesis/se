import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  VideoIcon } from
'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SideBadge } from '../components/ui/Badge';
import { JointTelemetryList } from '../components/robotics/JointTelemetryList';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { CommandDock } from '../components/teleoperation/CommandDock';
import { SO101DigitalTwin } from '../components/teleoperation/SO101DigitalTwin';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness, useSessionClock } from '../hooks/useLabDerived';
import { cx, formatDuration } from '../lib/format';
import type { ArmSide } from '../types';

export function Teleoperation() {
  const {
    session, startSession, pauseSession, stopSession, recoverSingleSession,
    operationProfile, setOperationProfile, cameras, workspace, estop, motionEnabled
  } = useLab();
  const pairs = useArmPairReadiness();
  const navigate = useNavigate();
  const [side, setSide] = useState<ArmSide>(pairs.left.ready ? 'left' : 'right');
  const elapsed = useSessionClock();
  const pair = pairs[side];
  const accent = side === 'left' ? '#35c9d0' : '#a78bfa';
  const active = session?.state === 'active' && session.sides.includes(side);
  const singleSession = session?.mode === 'single' && session.sides.includes(side);
  const recovering = singleSession && session?.state === 'starting';
  const wristCam = cameras.find((c) => c.role === `${side}-wrist`)!;

  const checklist = [
  { label: 'Leader connected', ok: pair.leader.connection === 'connected', detail: pair.leader.serialPort ?? 'no port' },
  { label: 'Follower connected', ok: pair.follower.connection === 'connected', detail: pair.follower.serialPort ?? 'no port' },
  {
    label: 'Both arms calibrated',
    ok: pair.leader.calibration === 'calibrated' && pair.follower.calibration === 'calibrated',
    detail: pair.leader.calibrationProfile?.name ?? 'profile missing'
  },
  { label: 'Emergency stop ready', ok: estop === 'ready', detail: estop === 'ready' ? 'E-STOP READY' : 'RESET REQUIRED' },
  { label: 'Speed limit applied', ok: true, detail: `${workspace.safety.maxSpeedPct}% of maximum` }];


  return (
    <div className="control-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Single-arm teleoperation"
        description="Drive one follower arm from its paired leader. Dual-arm and VR modes have their own workspaces."
        meta={<Badge tone={motionEnabled ? 'ok' : 'warn'}>{motionEnabled ? 'Real motion unlocked' : 'Motion locked'}</Badge>}
        actions={<Button onClick={() => navigate('/dual-arm')}>Open dual-arm workspace</Button>} />
      

      <div className="control-switcher inline-flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Select arm pair">
        {(['left', 'right'] as ArmSide[]).map((s) =>
        <button
          key={s}
          type="button"
          onClick={() => setSide(s)}
          aria-pressed={side === s}
          className={cx(
            'flex h-9 items-center gap-2 rounded-lg px-3.5 text-base transition-colors duration-150 ease-smooth',
            side === s ? 'bg-subtle text-ink' : 'text-ink2 hover:text-ink'
          )}>
          
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s === 'left' ? '#35c9d0' : '#a78bfa' }} />
            {s === 'left' ? 'Left arm pair' : 'Right arm pair'}
            <Badge tone={pairs[s].ready ? 'ok' : 'warn'} withIcon={false}>
              {pairs[s].ready ? 'Ready' : 'Not ready'}
            </Badge>
          </button>
        )}
      </div>

      <Card className="control-profile-card">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-ink">Operating profile</p>
            <p className="mt-1 text-sm text-ink2">
              {operationProfile === 'exhibition'
                ? 'Exhibition: safer 2° command envelope and zero-jump recovery from the follower’s held pose.'
                : 'Project: direct calibrated leader/follower mirroring for experiments and data collection.'}
            </p>
          </div>
          <div className="inline-flex shrink-0 rounded-xl border border-line bg-elev p-1" role="group" aria-label="Operating profile">
            {(['exhibition', 'project'] as const).map((profile) =>
              <button
                key={profile}
                type="button"
                disabled={Boolean(singleSession)}
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

      <div className="control-center-layout grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Card accent={side} className="control-session-card control-canvas-panel">
          <CardHeader
            title={`${side === 'left' ? 'Left' : 'Right'} pair session`}
            description={
            active ?
            `Live · ${formatDuration(elapsed)} · ${session?.latencyMs} ms · ${session?.commandRateHz} Hz` :
            pair.reason ?? 'Ready to start. The follower will mirror the leader once motion is enabled.'
            }
            actions={<SideBadge side={side} />} />
          
          <SO101DigitalTwin
            left={pairs.left.follower}
            right={pairs.right.follower}
            visibleSide={side}
            live={Boolean(active)} />

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div className="telemetry-panel rounded-xl border border-line bg-elev/60 p-4">
              <p className="mb-3 text-sm font-medium text-ink2">Leader joints</p>
              <JointTelemetryList joints={pair.leader.joints} accent={accent} columns={1} />
            </div>
            <div className="telemetry-panel rounded-xl border border-line bg-elev/60 p-4">
              <p className="mb-3 text-sm font-medium text-ink2">Follower joints</p>
              {pair.follower.connection === 'connected' ?
              <JointTelemetryList joints={pair.follower.joints} accent={accent} columns={1} /> :

              <p className="text-sm text-faint">Follower is offline — no telemetry available.</p>
              }
            </div>
          </div>
        </Card>

        <aside className="control-side-rail space-y-4">
          <Card className="control-checklist">
            <CardHeader title="Pre-session checklist" />
            <ul className="divide-y divide-line/70 px-5">
              {checklist.map((c) =>
              <li key={c.label} className="flex items-start gap-2.5 py-2.5">
                  {c.ok ?
                <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> :

                <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                }
                  <div className="min-w-0">
                    <p className="text-base text-ink">{c.label}</p>
                    <p className="font-mono text-xs text-faint truncate">{c.detail}</p>
                  </div>
                </li>
              )}
            </ul>
          </Card>

          <CameraFeedCard camera={wristCam} />
        </aside>
      </div>

      <CommandDock
        status={<><span className={active ? 'status-live' : 'status-idle'} /> {active ? `Live ${formatDuration(elapsed)}` : 'Single-arm session idle'} <span className="command-dock__status-detail">{pair.reason ?? `${side === 'left' ? 'Left' : 'Right'} pair ready state`}</span></>}
      >
        {singleSession ?
          <>
            <Button icon={PauseIcon} onClick={pauseSession}>{session?.state === 'paused' ? 'Resume' : 'Pause'}</Button>
            <Button icon={RotateCcwIcon} disabled={recovering || estop !== 'ready' || !motionEnabled} onClick={() => recoverSingleSession(side)}>{recovering ? 'Recovering…' : 'Recover'}</Button>
            <Button icon={VideoIcon} onClick={() => navigate('/recording')}>Record</Button>
            <Button variant="danger" icon={SquareIcon} onClick={stopSession}>Stop</Button>
          </> :
          <Button variant="primary" icon={PlayIcon} disabled={!pair.ready || estop !== 'ready' || !motionEnabled || session?.state === 'starting'} title={!motionEnabled ? 'Restart dashboard_server.py with --enable-motion' : pair.reason ?? undefined} onClick={() => startSession('single', [side])}>Start teleoperation</Button>}
      </CommandDock>
    </div>);

}
