import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, CheckIcon, CpuIcon, PlayIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { Select, TextInput, Toggle } from '../components/ui/Field';
import { useLab } from '../contexts/LabContext';
import { policies } from '../data/training';
import { cx } from '../lib/format';
import { ObservationRail } from '../components/cameras/ObservationRail';

const computeTargets = [
{ id: 'local-gpu', label: 'Local GPU · RTX 4090', detail: 'CUDA 12.4 · 24 GB VRAM · ~11 GB required for ACT at batch 8', available: true },
{ id: 'local-cpu', label: 'Local CPU', detail: '16 cores · training will take roughly 20× longer', available: true },
{ id: 'cloud', label: 'Cloud compute', detail: 'No cloud provider is configured on this backend', available: false }];


export function TrainingSetup() {
  const { datasets, activeDatasetId, setActiveDatasetId, startJob, capabilities, cameras } = useLab();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState('act');
  const [compute, setCompute] = useState('local-gpu');
  const [steps, setSteps] = useState('10000');
  const [batch, setBatch] = useState('8');
  const [lr, setLr] = useState('1e-5');
  const [ckpt, setCkpt] = useState('1000');
  const [tracking, setTracking] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const dataset = datasets.find((d) => d.id === activeDatasetId)!;
  const selectedCompute = computeTargets.find((c) => c.id === compute)!;
  const warnings: string[] = [];
  if (!dataset.trainingReady) warnings.push(`${dataset.name} is not marked ready for training — record more episodes first.`);
  if (compute === 'local-cpu') warnings.push('CPU training on 62 dual-arm episodes will take several days.');
  if (Number(batch) > 16) warnings.push('Batch sizes above 16 may exceed the reported 24 GB of GPU memory.');

  const launch = () => {
    startJob({
      name: `act_${dataset.name}_v${Math.floor(Math.random() * 5) + 4}`,
      datasetName: dataset.name,
      policy: policies.find((p) => p.id === policy)!.name,
      compute: selectedCompute.label,
      status: 'running',
      step: 0,
      totalSteps: Number(steps),
      loss: 1.42,
      etaMin: 92,
      gpuUtilPct: compute === 'local-gpu' ? 84 : null,
      memoryGb: compute === 'local-gpu' ? 11.4 : null,
      startedAt: 'Just now',
      location: 'local'
    });
    navigate('/training/jobs');
  };

  return (
    <div className="training-page mx-auto max-w-[80rem] space-y-6">
      <PageHeader
        title="Training setup"
        description="Configure a policy training run against a recorded dataset."
        meta={<SimulatedBadge />} />

      <div className="training-workspace-grid">
        <div className="training-form-column">

      <Step index={1} title="Select dataset">
        <Select
          label="Dataset"
          mono
          value={activeDatasetId}
          onChange={setActiveDatasetId}
          options={datasets.map((d) => ({ value: d.id, label: `${d.name} · ${d.episodes} episodes · ${d.type}` }))} />
        
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Episodes" value={String(dataset.episodes)} />
          <Field label="Arm configuration" value={dataset.type} />
          <Field label="Cameras" value={`${dataset.cameras} streams`} />
          <Field label="Readiness" value={dataset.trainingReady ? 'Ready' : 'Not ready'} />
        </dl>
      </Step>

      <Step index={2} title="Select policy">
        <ul className="space-y-2">
          {policies.map((p) =>
          <li key={p.id}>
              <button
              type="button"
              disabled={!p.supported}
              onClick={() => setPolicy(p.id)}
              aria-pressed={policy === p.id}
              className={cx(
                'w-full rounded-xl border p-4 text-left transition-colors duration-150 ease-smooth disabled:opacity-50 disabled:cursor-not-allowed',
                policy === p.id ? 'border-brand/50 bg-brand/[0.07]' : 'border-line bg-elev/60 hover:border-faint/40'
              )}>
              
                <span className="flex items-center gap-2">
                  <span className="font-mono text-base text-ink">{p.name}</span>
                  <span className="text-sm text-ink2">— {p.title}</span>
                  {p.supported ?
                policy === p.id ?
                <CheckIcon className="ml-auto h-4 w-4 text-brand" /> :
                null :

                <Badge tone="neutral" className="ml-auto">
                      Not offered by backend
                    </Badge>
                }
                </span>
                <span className="mt-1 block text-sm text-ink2">{p.blurb}</span>
              </button>
            </li>
          )}
        </ul>
      </Step>

      <Step index={3} title="Compute target">
        <ul className="grid gap-2 sm:grid-cols-3">
          {computeTargets.map((c) =>
          <li key={c.id}>
              <button
              type="button"
              disabled={!c.available}
              onClick={() => setCompute(c.id)}
              aria-pressed={compute === c.id}
              className={cx(
                'h-full w-full rounded-xl border p-4 text-left transition-colors duration-150 ease-smooth disabled:opacity-50 disabled:cursor-not-allowed',
                compute === c.id ? 'border-brand/50 bg-brand/[0.07]' : 'border-line bg-elev/60 hover:border-faint/40'
              )}>
              
                <span className="block text-base text-ink">{c.label}</span>
                <span className="mt-1 block text-sm text-ink2">{c.detail}</span>
              </button>
            </li>
          )}
        </ul>
        <p className="mt-3 text-sm text-faint">
          Local training does not require a Hugging Face token. Authentication is only needed to push datasets or
          models to the Hub.
        </p>
      </Step>

      <Step index={4} title="Training parameters">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Training steps" mono value={steps} onChange={setSteps} />
          <TextInput label="Batch size" mono value={batch} onChange={setBatch} />
        </div>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-hover">
          
          <ChevronDownIcon className={cx('h-4 w-4 transition-transform duration-150 ease-smooth', advanced && 'rotate-180')} />
          Advanced settings
        </button>
        {advanced ?
        <div className="mt-3 grid gap-4 rounded-xl border border-line bg-elev/60 p-4 sm:grid-cols-2">
            <TextInput label="Learning rate" mono value={lr} onChange={setLr} />
            <TextInput label="Checkpoint interval (steps)" mono value={ckpt} onChange={setCkpt} />
            <div className="sm:col-span-2">
              <Toggle
              label="Experiment tracking"
              description="Stream metrics to the configured tracker. Requires a tracker URL in Settings."
              checked={tracking}
              onChange={setTracking} />
            
            </div>
          </div> :
        null}
      </Step>

      <Step index={5} title="Review and launch">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dataset" value={dataset.name} />
          <Field label="Policy" value={policies.find((p) => p.id === policy)!.name} />
          <Field label="Compute" value={selectedCompute.label} />
          <Field label="Steps × batch" value={`${steps} × ${batch}`} />
        </dl>
        {warnings.length ?
        <ul className="mt-4 space-y-1.5 rounded-xl border border-warn/40 bg-warn/[0.07] p-4 text-sm text-warn">
            {warnings.map((w) =>
          <li key={w}>• {w}</li>
          )}
          </ul> :
        null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={PlayIcon} disabled={!dataset.trainingReady} onClick={launch}>
            Start training
          </Button>
          <Button icon={CpuIcon} onClick={() => navigate('/training/jobs')}>
            View running jobs
          </Button>
        </div>
        {!capabilities.supportsCloudTraining ?
        <p className="mt-3 text-sm text-faint">
            Cloud training is not configured — this run executes on the local training worker.
          </p> :
        null}
      </Step>
        </div>
        <aside className="training-observation-column">
          <ObservationRail cameras={cameras} title="Training observation" />
          <p className="training-observation-note">Verify overhead and wrist framing before launching a run. Camera metadata is kept with the selected dataset.</p>
        </aside>
      </div>
    </div>);

}

function Step({ index, title, children }: {index: number;title: string;children: React.ReactNode;}) {
  return (
    <Card>
      <CardHeader
        title={
        <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-subtle font-mono text-xs text-ink2">
              {index}
            </span>
            {title}
          </span>
        } />
      
      <div className="p-5">{children}</div>
    </Card>);

}

function Field({ label, value }: {label: string;value: string;}) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono text-sm text-ink truncate">{value}</dd>
    </div>);

}
