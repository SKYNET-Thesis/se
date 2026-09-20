import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudIcon, CpuIcon, FileTextIcon, LayersIcon, SquareIcon } from 'lucide-react';
import { PageHeader, Section } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { TrainingLossChart } from '../components/training/TrainingLossChart';
import { useLab } from '../contexts/LabContext';
import { cx } from '../lib/format';
import type { TrainingJob } from '../types';

export function TrainingJobs() {
  const { jobs, stopJob, capabilities } = useLab();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(jobs[0]?.id);
  const local = jobs.filter((j) => j.location === 'local');
  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0];

  if (!jobs.length) {
    return (
      <Card className="mx-auto max-w-3xl">
        <EmptyState
          icon={CpuIcon}
          title="No training jobs yet"
          description="Launch a run from Training setup to train a policy on one of your recorded datasets."
          actionLabel="Open training setup"
          onAction={() => navigate('/training')} />
        
      </Card>);

  }

  return (
    <div className="training-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Training jobs"
        description="Local and cloud policy training runs reported by the backend training worker."
        meta={<SimulatedBadge />}
        actions={<Button variant="primary" onClick={() => navigate('/training')}>New training run</Button>} />
      

      <Section title="Local jobs" description={`${local.length} runs on the local training worker`}>
        <div className="grid gap-3 lg:grid-cols-2">
          {local.map((j) =>
          <JobCard key={j.id} job={j} selected={j.id === selected.id} onSelect={() => setSelectedId(j.id)} />
          )}
        </div>
      </Section>

      {!capabilities.supportsCloudTraining ?
      <Card className="flex items-start gap-3 p-4">
          <CloudIcon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
          <p className="text-sm text-ink2">
            Cloud training is not configured on this backend, so no remote jobs are listed. Local runs are unaffected.
          </p>
        </Card> :
      null}

      <Card>
        <CardHeader
          title={selected.name}
          description={`${selected.policy} · ${selected.datasetName} · ${selected.compute}`}
          icon={CpuIcon}
          actions={<StatusBadge job={selected} />} />
        
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <div className="h-56">
              <TrainingLossChart data={selected.losses} />
            </div>
            <div className="mt-4 rounded-xl border border-line bg-elev/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-faint">
                <FileTextIcon className="h-3.5 w-3.5" /> Live logs
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs text-ink2">
                {selected.logs.map((l) =>
                <li key={l}>{l}</li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={selected.status} />
              <Row label="Step" value={`${selected.step.toLocaleString()} / ${selected.totalSteps.toLocaleString()}`} />
              <Row label="Loss" value={selected.loss.toFixed(3)} />
              <Row label="ETA" value={selected.etaMin ? `${selected.etaMin} min` : '—'} />
              <Row label="GPU utilisation" value={selected.gpuUtilPct !== null ? `${selected.gpuUtilPct}%` : 'Not available'} />
              <Row label="GPU memory" value={selected.memoryGb !== null ? `${selected.memoryGb} GB` : 'Not available'} />
              <Row label="Started" value={selected.startedAt} />
            </dl>
            <div className="rounded-xl border border-line bg-elev/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-faint">
                <LayersIcon className="h-3.5 w-3.5" /> Checkpoints
              </p>
              <ul className="space-y-1 font-mono text-xs text-ink2">
                {[1000, 2000, 3000, 4000].
                filter((s) => s <= selected.step).
                map((s) =>
                <li key={s}>outputs/{selected.name}/step_{s}</li>
                )}
                {selected.step < 1000 ? <li className="text-faint">No checkpoints written yet</li> : null}
              </ul>
            </div>
            {selected.status === 'running' ?
            <Button variant="danger" icon={SquareIcon} onClick={() => stopJob(selected.id)}>
                Stop training
              </Button> :
            null}
          </div>
        </div>
      </Card>
    </div>);

}

function JobCard({
  job,
  selected,
  onSelect




}: {job: TrainingJob;selected: boolean;onSelect: () => void;}) {
  const pct = Math.round(job.step / job.totalSteps * 100);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'rounded-2xl border bg-card p-4 text-left transition-colors duration-150 ease-smooth',
        selected ? 'border-brand/45' : 'border-line hover:border-faint/40'
      )}>
      
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base text-ink truncate">{job.name}</p>
          <p className="text-sm text-ink2">
            {job.policy} · {job.datasetName}
          </p>
        </div>
        <span className="ml-auto shrink-0">
          <StatusBadge job={job} />
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div
          className={cx('h-full rounded-full', job.status === 'running' ? 'bg-brand' : 'bg-ok')}
          style={{ width: `${pct}%` }} />
        
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-xs text-ink2">
        <span>
          step {job.step.toLocaleString()} / {job.totalSteps.toLocaleString()}
        </span>
        <span>loss {job.loss.toFixed(3)}</span>
      </div>
    </button>);

}

function StatusBadge({ job }: {job: TrainingJob;}) {
  if (job.status === 'running')
  return (
    <Badge tone="brand" withIcon={false}>
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Running
      </Badge>);

  if (job.status === 'completed') return <Badge tone="ok">Completed</Badge>;
  if (job.status === 'failed') return <Badge tone="danger">Failed</Badge>;
  if (job.status === 'stopped') return <Badge tone="warn">Stopped</Badge>;
  return <Badge tone="neutral">Queued</Badge>;
}

function Row({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink2">{label}</dt>
      <dd className="font-mono text-ink capitalize">{value}</dd>
    </div>);

}
