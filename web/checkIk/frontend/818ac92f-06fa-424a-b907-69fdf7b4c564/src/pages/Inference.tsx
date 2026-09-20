import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleAlertIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { Select, Slider } from '../components/ui/Field';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { ObservationRail } from '../components/cameras/ObservationRail';
import { JointTelemetryList } from '../components/robotics/JointTelemetryList';
import { EmergencyStopButton } from '../components/shell/EmergencyStopButton';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness } from '../hooks/useLabDerived';
import { cx } from '../lib/format';

type Mode = 'simulation' | 'preview' | 'hardware';

export function Inference() {
  const [searchParams] = useSearchParams();
  const { models, workspaces, workspace, cameras, estop, devices, toast } = useLab();
  const pairs = useArmPairReadiness();
  const requestedModel = searchParams.get('model');
  const [modelId, setModelId] = useState(models.some((model) => model.id === requestedModel) ? requestedModel! : models[0].id);
  const [checkpoint, setCheckpoint] = useState(searchParams.get('checkpoint') ?? 'latest');
  const duration = Math.max(1, Number(searchParams.get('duration')) || 60);
  const [mode, setMode] = useState<Mode>('simulation');
  const [speed, setSpeed] = useState(40);
  const [running, setRunning] = useState(false);

  const model = models.find((m) => m.id === modelId)!;
  const onlineCameras = cameras.filter((c) => c.connection === 'connected').length;
  const overhead = cameras.find((c) => c.role === 'overhead')!;

  const blockers: string[] = [];
  if (mode === 'hardware') {
    if (model.arms === 'Dual Arm' && !(pairs.left.ready && pairs.right.ready))
    blockers.push('This dual-arm policy requires both pairs ready. ' + (pairs.right.reason ?? pairs.left.reason ?? ''));
    if (model.arms === 'Single Arm' && !pairs.left.ready && !pairs.right.ready)
    blockers.push('No arm pair is connected and calibrated.');
    if (model.cameras > onlineCameras)
    blockers.push(`The policy expects ${model.cameras} camera streams; ${onlineCameras} are available.`);
    if (estop !== 'ready') blockers.push('Emergency stop must be reset before hardware execution.');
  }

  const canRun = blockers.length === 0;
  const follower = devices.find((d) => d.side === 'left' && d.role === 'follower')!;

  return (
    <div className="training-page inference-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Inference"
        description="Run a trained policy in simulation, as a dry-run preview, or on physical hardware."
        meta={<SimulatedBadge />}
        actions={<EmergencyStopButton />} />
      

      <div className="grid gap-4 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Policy & workspace" />
            <div className="space-y-4 p-5">
              <Select
                label="Model"
                mono
                value={modelId}
                onChange={setModelId}
                options={models.map((m) => ({ value: m.id, label: `${m.name} · ${m.arms}` }))} />
              
              <Select
                label="Checkpoint"
                mono
                value={checkpoint}
                onChange={setCheckpoint}
                options={Array.from({ length: model.checkpoints }, (_, i) => {
                  const s = (i + 1) * 2000;
                  return { value: `step_${s}`, label: `step_${s}` };
                })} />
              
              <Select
                label="Workspace"
                value={workspace.id}
                onChange={() => undefined}
                options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
                hint="Robot and camera configuration come from the selected workspace." />
              
              <Slider label="Execution speed limit" min={10} max={100} step={5} unit="%" value={speed} onChange={setSpeed} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Execution mode" />
            <div className="space-y-2 p-5">
              {([
              ['simulation', 'Simulation', 'Replays policy output against a kinematic model. No hardware motion.'],
              ['preview', 'Preview (dry run)', 'Streams real camera input, computes actions, but does not command the arms.'],
              ['hardware', 'Real hardware', 'Commands the physical follower arms at the configured speed limit.']] as
              const).map(([value, label, detail]) =>
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cx(
                  'w-full rounded-xl border p-3.5 text-left transition-colors duration-150 ease-smooth',
                  mode === value ? 'border-brand/50 bg-brand/[0.07]' : 'border-line bg-elev/60 hover:border-faint/40'
                )}>
                
                  <span className="text-base text-ink">{label}</span>
                  <span className="mt-0.5 block text-sm text-ink2">{detail}</span>
                </button>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Execution"
              description={`${model.name} · ${checkpoint} · ${mode === 'hardware' ? 'physical hardware' : mode === 'preview' ? 'dry run' : 'simulation'}`}
              actions={
              running ?
              <Badge tone="brand" withIcon={false}>
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Running
                  </Badge> :

              <Badge tone={canRun ? 'ok' : 'warn'}>{canRun ? 'Ready' : 'Blocked'}</Badge>

              } />
            
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <CameraFeedCard camera={overhead} />
              <div className="rounded-xl border border-line bg-elev/60 p-4">
                <p className="mb-3 text-sm font-medium text-ink2">Live action output</p>
                {running ?
                <JointTelemetryList joints={follower.joints} accent="#ff7a32" columns={1} /> :

                <p className="text-sm text-faint">
                    Action output appears here once inference starts. Values are produced by the policy, not read from
                    hardware.
                  </p>
                }
              </div>
            </div>
            <div className="px-5 pb-5">
              <ObservationRail cameras={cameras} title="Inference observation" />
            </div>

            {blockers.length ?
            <div className="mx-5 mb-5 space-y-1.5 rounded-xl border border-warn/40 bg-warn/[0.07] p-4">
                <p className="flex items-center gap-2 text-base font-medium text-warn">
                  <CircleAlertIcon className="h-4 w-4" /> Hardware execution is disabled
                </p>
                <ul className="space-y-1 text-sm text-warn">
                  {blockers.map((b) =>
                <li key={b}>• {b}</li>
                )}
                </ul>
              </div> :
            null}

            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
              {running ?
              <Button variant="danger" icon={SquareIcon} onClick={() => setRunning(false)}>
                  Stop inference
                </Button> :

              <Button
                variant="primary"
                icon={PlayIcon}
                disabled={!canRun}
                onClick={() => {
                  setRunning(true);
                  toast({
                    title: mode === 'hardware' ? 'Inference running on hardware' : 'Inference running',
                    detail: `${model.name} · ${checkpoint}`,
                    tone: mode === 'hardware' ? 'warning' : 'info'
                  });
                }}>
                
                  Start inference
                </Button>
              }
              <span className="ml-auto self-center text-sm text-ink2">
                Max {duration}s · Speed limit {speed}% · {mode === 'hardware' ? 'motion enabled' : 'no hardware motion'}
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Backend logs" />
            <ul className="space-y-1 p-5 font-mono text-xs text-ink2">
              <li>[policy] loaded {model.name}/{checkpoint}</li>
              <li>[obs] camera inputs: {onlineCameras} streams @ 30 fps</li>
              <li>[safety] execution speed clamped to {speed}%</li>
              <li>[run] maximum duration: {duration} seconds</li>
              <li>[mode] {mode} — {mode === 'hardware' ? 'commands will be sent to followers' : 'no commands sent to hardware'}</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>);

}
