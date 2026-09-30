import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DatabaseIcon, VideoIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

export function DatasetSummaryCard() {
  const { datasets, activeDatasetId } = useLab();
  const navigate = useNavigate();
  const ds = datasets.find((d) => d.id === activeDatasetId);

  if (!ds) {
    return (
      <Card>
        <CardHeader title="Dataset" icon={DatabaseIcon} />
        <EmptyState
          icon={DatabaseIcon}
          title="No dataset created"
          description="Record a first episode to create a dataset. Datasets group episodes with their camera and joint streams for training."
          actionLabel="Record episode"
          onAction={() => navigate('/recording')} />
        
      </Card>);

  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Active dataset"
        icon={DatabaseIcon}
        actions={
        ds.trainingReady ? <Badge tone="ok">Ready for training</Badge> : <Badge tone="warn">Needs more episodes</Badge>
        } />
      
      <div className="p-5">
        <p className="font-mono text-lg text-ink">{ds.name}</p>
        <p className="mt-0.5 text-sm text-ink2">
          {ds.repoId ? `Hub repo ${ds.repoId}` : 'Local only — no Hub repository set'}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Type" value={ds.type} />
          <Field label="Episodes" value={String(ds.episodes)} />
          <Field label="Duration" value={`${ds.durationMin} min`} />
          <Field label="Cameras" value={`${ds.cameras} streams`} />
          <Field label="Size" value={`${ds.sizeGb.toFixed(1)} GB`} />
          <Field
            label="Upload"
            value={ds.uploadStatus === 'uploaded' ? 'Uploaded to Hub' : 'Local only'} />
          
        </dl>
        <p className="mt-4 text-sm text-ink2">
          Last recording {ds.lastModified}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
        <Link
          to={`/datasets/${ds.id}`}
          className="inline-flex h-8 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-ink hover:bg-elev transition-colors duration-150 ease-smooth">
          
          Open dataset
        </Link>
        <Button size="sm" icon={VideoIcon} onClick={() => navigate('/recording')}>
          Record episode
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/datasets')}>
          Browse datasets
        </Button>
      </div>
    </Card>);

}

function Field({ label, value }: {label: string;value: string;}) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono text-sm text-ink">{value}</dd>
    </div>);

}