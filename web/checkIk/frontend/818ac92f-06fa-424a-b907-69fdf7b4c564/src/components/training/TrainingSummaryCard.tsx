import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CpuIcon, PlayIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { TrainingLossChart } from './TrainingLossChart';

export function TrainingSummaryCard() {
  const { jobs, datasets, activeDatasetId, capabilities } = useLab();
  const navigate = useNavigate();
  const running = jobs.find((j) => j.status === 'running');
  const dataset = datasets.find((d) => d.id === activeDatasetId);

  if (running) {
    const pct = Math.round(running.step / running.totalSteps * 100);
    return (
      <Card className="flex flex-col">
        <CardHeader
          title="Training"
          icon={CpuIcon}
          actions={
          <Badge tone="brand" withIcon={false}>
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Running
            </Badge>
          } />
        
        <div className="p-5">
          <p className="font-mono text-lg text-ink truncate">{running.name}</p>
          <p className="mt-0.5 text-sm text-ink2">
            {running.policy} · {running.compute}
          </p>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink2">
                Step <span className="font-mono text-ink">{running.step.toLocaleString()}</span> /{' '}
                <span className="font-mono">{running.totalSteps.toLocaleString()}</span>
              </span>
              <span className="font-mono text-ink">{pct}%</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Training progress">
              
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <Field label="Loss" value={running.loss.toFixed(3)} />
            <Field label="ETA" value={running.etaMin ? `${running.etaMin} min` : '—'} />
            <Field label="GPU" value={running.gpuUtilPct ? `${running.gpuUtilPct}%` : 'Not available'} />
          </div>

          <div className="mt-4 h-24">
            <TrainingLossChart data={running.losses} compact />
          </div>
        </div>
        <div className="mt-auto flex gap-2 border-t border-line px-5 py-3.5">
          <Button size="sm" variant="primary" onClick={() => navigate('/training/jobs')}>
            View job
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/training')}>
            New training run
          </Button>
        </div>
      </Card>);

  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Training"
        icon={CpuIcon}
        actions={<Badge tone={dataset?.trainingReady ? 'ok' : 'warn'}>{dataset?.trainingReady ? 'Ready' : 'Not ready'}</Badge>} />
      
      <div className="p-5">
        <p className="text-sm text-ink2">No job is running. Next run is pre-filled from the active dataset.</p>
        <dl className="mt-4 space-y-3">
          <Row label="Dataset" value={dataset?.name ?? 'None selected'} />
          <Row label="Suggested policy" value="ACT — Action Chunking Transformer" />
          <Row label="Compute target" value="Local GPU · RTX 4090 · 24 GB · CUDA 12.4" />
          <Row
            label="Cloud training"
            value={capabilities.supportsCloudTraining ? 'Configured' : 'Not configured on this backend'} />
          
        </dl>
      </div>
      <div className="mt-auto flex gap-2 border-t border-line px-5 py-3.5">
        <Button
          size="sm"
          variant="primary"
          icon={PlayIcon}
          disabled={!dataset?.trainingReady}
          title={dataset?.trainingReady ? undefined : 'The active dataset is not marked ready for training'}
          onClick={() => navigate('/training')}>
          
          Start training
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/training/jobs')}>
          Job history
        </Button>
      </div>
    </Card>);

}

function Field({ label, value }: {label: string;value: string;}) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className="font-mono text-sm text-ink">{value}</p>
    </div>);

}

function Row({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-ink2 shrink-0">{label}</dt>
      <dd className="font-mono text-sm text-ink text-right truncate">{value}</dd>
    </div>);

}