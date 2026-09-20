import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BoxesIcon, DownloadIcon, ImportIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Select, TextInput } from '../components/ui/Field';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness } from '../hooks/useLabDerived';
import type { CameraDevice, TrainedModel } from '../types';

type InferenceCameraSlot = 'cam_head' | 'cam_left' | 'cam_right';

export function Models() {
  const { models, cameras, workspace, toast, importModel } = useLab();
  const [importOpen, setImportOpen] = useState(false);
  const [source, setSource] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [runModel, setRunModel] = useState<TrainedModel | null>(null);
  const [checkpoint, setCheckpoint] = useState('latest');
  const [duration, setDuration] = useState('60');
  const [cardCheckpoints, setCardCheckpoints] = useState<Record<string, string>>({});
  const [cameraBindings, setCameraBindings] = useState<Record<InferenceCameraSlot, string>>({
    cam_head: '',
    cam_left: '',
    cam_right: ''
  });
  const pairs = useArmPairReadiness();
  const navigate = useNavigate();
  const onlineCameras = cameras.filter((c) => c.connection === 'connected').length;

  const cameraSlots: InferenceCameraSlot[] = workspace.preferredMode === 'dual'
    ? ['cam_head', 'cam_left', 'cam_right']
    : ['cam_head', 'cam_left'];

  const openInference = (model: TrainedModel, selectedCheckpoint = 'latest') => {
    setRunModel(model);
    setCheckpoint(selectedCheckpoint);
    setDuration('60');
    setCameraBindings({
      cam_head: cameraForSlot(cameras, 'cam_head')?.id ?? '',
      cam_left: cameraForSlot(cameras, 'cam_left')?.id ?? '',
      cam_right: cameraForSlot(cameras, 'cam_right')?.id ?? ''
    });
  };

  const incompatibility = (arms: string, needCams: number) => {
    if (arms === 'Dual Arm' && !(pairs.left.ready && pairs.right.ready))
    return 'Requires both arm pairs ready — the right pair is not available in this workspace.';
    if (needCams > onlineCameras)
    return `Trained with ${needCams} camera streams; only ${onlineCameras} are currently streaming.`;
    return null;
  };

  return (
    <div className="training-page mx-auto max-w-[92rem] space-y-6">
      <PageHeader
        title="Models"
        description="Trained policies available to this workspace, with compatibility against the current rig."
        meta={<SimulatedBadge />}
        actions={
        <Button variant="primary" icon={ImportIcon} onClick={() => setImportOpen(true)}>
            Import model
          </Button>
        } />
      

      {models.length ? <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {models.map((m) => {
          const reason = incompatibility(m.arms, m.cameras);
          const checkpointOptions = makeCheckpointOptions(m.checkpoints);
          return (
            <Card key={m.id} className="flex flex-col">
              <CardHeader
                title={<span className="font-mono">{m.name}</span>}
                description={`${m.policy} · trained ${m.trainedAt}`}
                icon={BoxesIcon}
                actions={reason ? <Badge tone="warn">Incompatible</Badge> : <Badge tone="ok">Compatible</Badge>} />
              
              <dl className="space-y-2 p-5 text-sm">
                <Row label="Dataset" value={m.dataset} />
                <Row label="Robot" value={m.robot} />
                <Row label="Arms" value={m.arms} />
                <Row label="Cameras" value={`${m.cameras} streams`} />
                <Row label="Checkpoints" value={String(m.checkpoints)} />
                <Row label="Location" value={m.location} />
                <Row label="Hub" value={m.uploaded ? 'Uploaded' : 'Local only'} />
              </dl>
              {reason ? <p className="mx-5 mb-4 rounded-lg border border-warn/35 bg-warn/[0.07] p-3 text-sm text-warn">{reason}</p> : null}
              <div className="mt-auto flex flex-wrap items-end gap-2 border-t border-line px-5 py-3.5">
                <div className="min-w-40 flex-1">
                  <Select
                    label="Checkpoint"
                    mono
                    value={cardCheckpoints[m.id] ?? 'latest'}
                    onChange={(value) => setCardCheckpoints((current) => ({ ...current, [m.id]: value }))}
                    options={checkpointOptions} />
                </div>
                <Button
                  size="sm"
                  icon={PlayIcon}
                  className="mb-1 h-10 w-10 bg-ok px-0 text-[#042016] hover:bg-ok/85"
                  disabled={Boolean(reason)}
                  title={reason ?? 'Configure and run inference'}
                  aria-label={`Configure inference for ${m.name}`}
                  onClick={() => openInference(m, cardCheckpoints[m.id] ?? 'latest')} />
                <Button size="sm" icon={DownloadIcon}>
                  Checkpoint
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2Icon} onClick={() => toast({ title: 'Delete requires backend confirmation', tone: 'warning' })}>
                  Delete
                </Button>
              </div>
            </Card>);

        })}
      </div> : <Card><EmptyState icon={BoxesIcon} title="No trained models" description="Train a policy on one of your datasets, or import an existing checkpoint directory." actionLabel="Open training setup" onAction={() => navigate('/training')} /></Card>}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import a model" description="Point at a local checkpoint directory or a Hugging Face repository.">
        <form className="space-y-4 p-5" onSubmit={(event) => {
          event.preventDefault();
          if (!source.trim()) return;
          importModel(source, displayName);
          setImportOpen(false);
          setSource('');
          setDisplayName('');
        }}>
          <TextInput label="Local path or Hugging Face repo ID" value={source} onChange={setSource} mono placeholder="/path/to/model or username/policy" />
          <TextInput label="Display name (optional)" value={displayName} onChange={setDisplayName} placeholder="My imported policy" />
          <p className="rounded-lg border border-warn/35 bg-warn/[0.07] p-3 text-sm text-warn">The dashboard records this model entry now. The backend will validate and load the checkpoint when inference starts.</p>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" icon={ImportIcon} disabled={!source.trim()}>Import</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(runModel)}
        onClose={() => setRunModel(null)}
        title="Configure Inference"
        description="Pick a checkpoint, set the run duration and bind the cameras used by this workspace.">
        {runModel ? (
          <form
            className="space-y-6 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const seconds = Number(duration);
              if (!Number.isFinite(seconds) || seconds <= 0) return;
              const params = new URLSearchParams({
                model: runModel.id,
                checkpoint,
                duration: String(seconds),
                ...Object.fromEntries(cameraSlots.map((slot) => [slot, cameraBindings[slot]]))
              });
              setRunModel(null);
              navigate(`/inference?${params.toString()}`);
            }}>
            <section className="space-y-3">
              <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Robot configuration</h3>
              <p className="text-sm text-ok">Running on {workspace.name} · {workspace.preferredMode === 'dual' ? '4 devices / bimanual' : '2 devices / single arm'}</p>
            </section>

            <section className="space-y-3">
              <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Checkpoint</h3>
              <Select label="Model checkpoint" mono value={checkpoint} onChange={setCheckpoint} options={makeCheckpointOptions(runModel.checkpoints)} />
            </section>

            <section className="space-y-3">
              <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Run parameters</h3>
              <TextInput label="Max duration (seconds)" type="number" value={duration} onChange={setDuration} hint="Inference stops automatically after this duration." />
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Cameras</h3>
                <p className="mt-2 text-xs text-faint">Bimanual mode uses head, left wrist and right wrist cameras. Single-arm mode only requests the applicable pair.</p>
              </div>
              {cameraSlots.map((slot) => {
                const bound = cameras.find((camera) => camera.id === cameraBindings[slot]);
                return (
                  <div key={slot} className="grid items-center gap-3 rounded-xl border border-line bg-elev/50 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_7rem]">
                    <div>
                      <p className="font-mono text-sm text-ink">{slot}</p>
                      <p className="text-xs text-faint">{bound?.resolution ?? '640×480'}</p>
                    </div>
                    <Select
                      label="Physical camera"
                      value={cameraBindings[slot]}
                      onChange={(value) => setCameraBindings((current) => ({ ...current, [slot]: value }))}
                      options={[
                        { value: '', label: 'Select a camera' },
                        ...cameras.map((camera) => ({ value: camera.id, label: `${camera.name} · ${camera.connection}` }))
                      ]} />
                    <div className="flex h-20 items-center justify-center rounded-lg border border-line bg-subtle text-center text-xs text-faint">
                      {bound ? `${bound.name}\n${bound.connection}` : 'No preview'}
                    </div>
                  </div>
                );
              })}
            </section>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button onClick={() => setRunModel(null)}>Cancel</Button>
              <Button
                type="submit"
                icon={PlayIcon}
                className="bg-ok text-[#042016] hover:bg-ok/85"
                disabled={!duration || Number(duration) <= 0}>
                Start inference
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>);

}

function makeCheckpointOptions(count: number) {
  return [
    { value: 'latest', label: 'latest' },
    ...Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
      const step = (index + 1) * 2000;
      return { value: `step_${step}`, label: `step_${step}` };
    })
  ];
}

function cameraForSlot(cameras: CameraDevice[], slot: InferenceCameraSlot) {
  const role = slot === 'cam_head' ? 'overhead' : slot === 'cam_left' ? 'left-wrist' : 'right-wrist';
  return cameras.find((camera) => camera.role === role);
}

function Row({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink2 shrink-0">{label}</dt>
      <dd className="font-mono text-ink truncate text-right">{value}</dd>
    </div>);

}
