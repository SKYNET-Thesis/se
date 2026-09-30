import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CloudUploadIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  PlayIcon,
  Trash2Icon } from
'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { JointTelemetryList } from '../components/robotics/JointTelemetryList';
import { useLab } from '../contexts/LabContext';
import { cx } from '../lib/format';

export function DatasetDetail() {
  const { datasetId } = useParams();
  const { datasets, devices, cameras, setActiveDatasetId, toast } = useLab();
  const navigate = useNavigate();
  const dataset = datasets.find((d) => d.id === datasetId);
  const [episodeId, setEpisodeId] = useState(dataset?.episodeList[0]?.id);

  if (!dataset) {
    return (
      <Card className="mx-auto max-w-3xl">
        <EmptyState
          icon={DatabaseIcon}
          title="Dataset not found"
          description="This dataset is no longer in the library. It may have been renamed or deleted."
          actionLabel="Back to library"
          onAction={() => navigate('/datasets')} />
        
      </Card>);

  }

  const episode = dataset.episodeList.find((e) => e.id === episodeId) ?? dataset.episodeList[0];
  const overhead = cameras.find((c) => c.role === 'overhead')!;

  return (
    <div className="data-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title={dataset.name}
        description={dataset.repoId ? `Hub repository ${dataset.repoId}` : 'Local dataset — no Hub repository configured'}
        meta={
        <>
            <SimulatedBadge />
            <Badge tone={dataset.type === 'Dual Arm' ? 'info' : 'neutral'} withIcon={false}>
              {dataset.type}
            </Badge>
            {dataset.vrRecorded ? <Badge tone="neutral" withIcon={false}>VR recorded</Badge> : null}
            <Badge tone="neutral" withIcon={false}>{dataset.cameras} cameras</Badge>
            {dataset.trainingReady ? <Badge tone="ok">Ready for training</Badge> : <Badge tone="warn">Not ready</Badge>}
          </>
        }
        actions={
        <>
            <Link to="/datasets" className="inline-flex h-10 items-center rounded-lg border border-line bg-subtle px-4 text-base text-ink hover:bg-elev">
              Back to library
            </Link>
            <Button icon={DownloadIcon} onClick={() => toast({ title: 'Export queued', detail: dataset.name, tone: 'info' })}>
              Export
            </Button>
            <Button
            variant="primary"
            icon={CpuIcon}
            disabled={!dataset.trainingReady}
            onClick={() => {
              setActiveDatasetId(dataset.id);
              navigate('/training');
            }}>
            
              Start training
            </Button>
          </>
        } />
      

      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Episodes" description={`${dataset.episodes} recorded · showing latest ${dataset.episodeList.length}`} />
          <ul className="max-h-[34rem] overflow-y-auto p-2">
            {dataset.episodeList.map((e) =>
            <li key={e.id}>
                <button
                type="button"
                onClick={() => setEpisodeId(e.id)}
                aria-current={e.id === episode.id}
                className={cx(
                  'w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-smooth',
                  e.id === episode.id ? 'bg-subtle' : 'hover:bg-subtle/70'
                )}>
                
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm text-ink">episode_{String(e.index).padStart(3, '0')}</span>
                    <span className="ml-auto font-mono text-xs text-ink2">{e.durationSec}s</span>
                    {e.quality === 'review' ? <Badge tone="warn">Review</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">
                    {e.recordedAt} · {e.arms === 'dual' ? 'dual arm' : `${e.arms} arm`} · {e.cameras} cameras
                    {e.vr ? ' · VR' : ''}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={`episode_${String(episode.index).padStart(3, '0')}`}
              description={`${episode.recordedAt} · ${episode.durationSec}s · ${episode.cameras} camera streams`}
              actions={
              <div className="flex gap-2">
                  <Button size="sm" icon={PlayIcon} onClick={() => toast({ title: 'Playback started', tone: 'info' })}>
                    Play
                  </Button>
                  <Button size="sm" variant="ghost" icon={Trash2Icon} onClick={() => toast({ title: 'Delete requires backend confirmation', tone: 'warning' })}>
                    Delete
                  </Button>
                </div>
              } />
            
            <div className="p-5 space-y-4">
              <CameraFeedCard camera={overhead} large />
              <div>
                <div className="flex items-center justify-between text-xs text-faint">
                  <span>0s</span>
                  <span>Timeline</span>
                  <span>{episode.durationSec}s</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-subtle">
                  <div className="h-full w-1/3 rounded-full bg-brand" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink2">
                  <span>Approach</span>
                  <span className="text-center">Grasp / handoff</span>
                  <span className="text-right">Release</span>
                </div>
              </div>
              <p className="text-sm text-ink2">{episode.notes}</p>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {(['left', 'right'] as const).map((side) => {
              const follower = devices.find((d) => d.side === side && d.role === 'follower')!;
              return (
                <Card key={side} accent={side}>
                  <CardHeader title={`${side === 'left' ? 'Left' : 'Right'} joint telemetry`} />
                  <div className="p-5">
                    {follower.joints[0].value !== null ?
                    <JointTelemetryList joints={follower.joints} accent={side === 'left' ? '#35c9d0' : '#a78bfa'} /> :

                    <p className="text-sm text-faint">
                        Recorded telemetry for this arm is available in the dataset, but the live device is offline so
                        the current pose cannot be shown.
                      </p>
                    }
                  </div>
                </Card>);

            })}
          </div>

          <Card>
            <CardHeader title="Dataset quality & export" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Metric label="Episodes flagged for review" value={String(dataset.episodeList.filter((e) => e.quality === 'review').length)} />
              <Metric label="Average episode length" value={`${Math.round(dataset.episodeList.reduce((a, e) => a + e.durationSec, 0) / dataset.episodeList.length)}s`} />
              <Metric label="Storage" value={`${dataset.sizeGb.toFixed(1)} GB`} />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
              <Button size="sm" icon={DownloadIcon}>Export dataset</Button>
              <Button
                size="sm"
                variant="ghost"
                icon={CloudUploadIcon}
                onClick={() => toast({ title: 'Hub sync unavailable', detail: 'Authenticate in Integrations to upload.', tone: 'warning' })}>
                
                Upload to Hub
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>);

}

function Metric({ label, value }: {label: string;value: string;}) {
  return (
    <div className="rounded-xl border border-line bg-elev/60 p-3.5">
      <p className="text-sm text-ink2">{label}</p>
      <p className="mt-1 font-mono text-lg text-ink">{value}</p>
    </div>);

}
