import React, { useEffect, useState } from 'react';
import { CircleIcon, PauseIcon, SaveIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SideBadge, SimulatedBadge } from '../components/ui/Badge';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { ObservationRail } from '../components/cameras/ObservationRail';
import { JointTelemetryList } from '../components/robotics/JointTelemetryList';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness } from '../hooks/useLabDerived';
import { formatDuration } from '../lib/format';

type ArmConfig = 'left' | 'right' | 'dual' | 'vr';

export function Recording() {
  const { datasets, activeDatasetId, setActiveDatasetId, cameras, pushActivity, toast, capabilities, saveRecordedEpisode } = useLab();
  const pairs = useArmPairReadiness();
  const [armConfig, setArmConfig] = useState<ArmConfig>('dual');
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [ms, setMs] = useState(0);
  const [notes, setNotes] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [episodeTarget, setEpisodeTarget] = useState('5');
  const [episodeDuration, setEpisodeDuration] = useState('60');
  const [resetDuration, setResetDuration] = useState('15');
  const [vrRecorded, setVrRecorded] = useState(false);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(() => cameras.filter((camera) => camera.connection === 'connected').map((camera) => camera.id));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('lelab.recordingDraft');
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<{autoStart: boolean;taskDescription: string;episodeTarget: string;episodeDuration: string;resetDuration: string;vrRecorded: boolean;armConfig: ArmConfig;selectedCameraIds: string[];}>;
      if (draft.taskDescription) setTaskDescription(draft.taskDescription);
      if (draft.episodeTarget) setEpisodeTarget(draft.episodeTarget);
      if (draft.episodeDuration) setEpisodeDuration(draft.episodeDuration);
      if (draft.resetDuration) setResetDuration(draft.resetDuration);
      if (typeof draft.vrRecorded === 'boolean') setVrRecorded(draft.vrRecorded);
      if (draft.armConfig) setArmConfig(draft.armConfig);
      if (draft.selectedCameraIds) setSelectedCameraIds(draft.selectedCameraIds);
      if (draft.autoStart) {
        setMs(0);
        setState('recording');
      }
      window.localStorage.removeItem('lelab.recordingDraft');
    } catch {
      window.localStorage.removeItem('lelab.recordingDraft');
    }
  }, []);

  const dataset = datasets.find((d) => d.id === activeDatasetId)!;
  const onlineCams = cameras.filter((c) => c.connection === 'connected' && selectedCameraIds.includes(c.id));

  useEffect(() => {
    if (state !== 'recording') return;
    const i = window.setInterval(() => setMs((m) => m + 1000), 1000);
    return () => window.clearInterval(i);
  }, [state]);

  const robotReady =
  armConfig === 'dual' ?
  pairs.left.ready && pairs.right.ready :
  armConfig === 'vr' ?
  capabilities.supportsVRControl :
  pairs[armConfig === 'left' ? 'left' : 'right'].ready;

  const robotBlockedReason =
  armConfig === 'vr' ?
  'VR-driven recording requires a backend VR bridge, which this build does not provide.' :
  armConfig === 'dual' ?
  pairs.left.reason ?? pairs.right.reason :
  pairs[armConfig === 'left' ? 'left' : 'right'].reason;

  const formReady = Boolean(taskDescription.trim()) && Number(episodeTarget) > 0 && Number(episodeDuration) > 0;
  const configReady = robotReady && formReady;
  const blockedReason = !robotReady ? robotBlockedReason : !taskDescription.trim() ? 'Enter a task description before recording.' : 'Check the episode parameters.';
  const estStorageMb = Math.round(ms / 1000 * onlineCams.length * 1.8 + ms / 1000 * 0.2);

  return (
    <div className="data-page recording-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Recording"
        description="Capture synchronized camera and joint streams as episodes in a dataset."
        meta={<SimulatedBadge />} />
      

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Live capture"
              description={`${onlineCams.length} camera streams · ${armConfig === 'dual' ? 'both arms' : armConfig === 'vr' ? 'VR input' : `${armConfig} arm`}`}
              actions={
              state === 'recording' ?
              <Badge tone="danger" withIcon={false}>
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-danger" aria-hidden /> Recording
                  </Badge> :

              <Badge tone="neutral">{state === 'paused' ? 'Paused' : 'Idle'}</Badge>

              } />
            
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {onlineCams.map((c) =>
              <CameraFeedCard key={c.id} camera={c} />
              )}
            </div>
            <div className="grid gap-4 border-t border-line p-5 lg:grid-cols-2">
              {(['left', 'right'] as const).map((side) =>
              <div key={side} className="rounded-xl border border-line bg-elev/60 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <SideBadge side={side} />
                    <span className="text-sm text-ink2">
                      {pairs[side].follower.connection === 'connected' ? 'follower telemetry' : 'offline'}
                    </span>
                  </div>
                  {pairs[side].follower.connection === 'connected' ?
                <JointTelemetryList
                  joints={pairs[side].follower.joints}
                  accent={side === 'left' ? '#35c9d0' : '#a78bfa'} /> :


                <p className="text-sm text-faint">{pairs[side].reason}</p>
                }
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <ObservationRail cameras={cameras} title="Recording observation" />
          <Card>
            <CardHeader title="Recorder" />
            <div className="p-5">
              <p className="font-mono text-3xl text-ink tabular-nums">{formatDuration(ms)}</p>
              <p className="mt-1 text-sm text-ink2">
                Episode #{dataset.episodes + 1} · estimated storage{' '}
                <span className="font-mono text-ink">{estStorageMb} MB</span>
              </p>
              <p className="mt-2 text-xs text-faint">Target {episodeTarget} episodes · {episodeDuration}s capture · {resetDuration}s reset</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {state === 'idle' ?
                <Button
                  variant="primary"
                  icon={CircleIcon}
                  disabled={!configReady}
                  title={configReady ? undefined : blockedReason ?? undefined}
                  onClick={() => {
                    setState('recording');
                    setMs(0);
                  }}>
                  
                    Start recording
                  </Button> :

                <>
                    <Button icon={PauseIcon} onClick={() => setState(state === 'paused' ? 'recording' : 'paused')}>
                      {state === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                    <Button variant="danger" icon={SquareIcon} onClick={() => setState('idle')}>
                      Stop
                    </Button>
                    <Button
                    icon={SaveIcon}
                    onClick={() => {
                      setState('idle');
                      saveRecordedEpisode(dataset.id, {
                        durationSec: Math.max(1, Math.round(ms / 1000)),
                        cameras: onlineCams.length,
                        vr: vrRecorded || armConfig === 'vr',
                        arms: armConfig === 'left' || armConfig === 'right' ? armConfig : 'dual',
                        notes: `${taskDescription}${notes ? ` — ${notes}` : ''}`
                      });
                      pushActivity({
                        kind: 'recording',
                        message: `Episode ${dataset.episodes + 1} saved to ${dataset.name} (${formatDuration(ms)})`,
                        severity: 'success'
                      });
                      toast({ title: 'Episode saved', detail: dataset.name, tone: 'success' });
                    }}>
                    
                      Save episode
                    </Button>
                    <Button variant="ghost" icon={Trash2Icon} onClick={() => setState('idle')}>
                      Discard
                    </Button>
                  </>
                }
              </div>
              <p className="mt-4 text-sm text-ink2">
                This episode records{' '}
                <span className="text-ink">
                  {armConfig === 'dual' ? 'both arms' : armConfig === 'vr' ? 'VR control input' : `${armConfig} arm only`}
                </span>{' '}
                plus <span className="text-ink">{onlineCams.length} camera streams</span>.
              </p>
              <div className="mt-4 space-y-1.5">
                <label htmlFor="notes" className="block text-sm font-medium text-ink2">Session notes</label>
                <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Task variation, object placement, operator…" className="w-full rounded-lg border border-line bg-subtle p-3 text-base text-ink placeholder:text-faint" />
              </div>
            </div>
          </Card>
        </div>
      </div>

    </div>);

}
