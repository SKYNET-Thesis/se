import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrainCircuitIcon, CameraIcon, ChevronDownIcon, DatabaseIcon, MoreHorizontalIcon, PlusIcon, VideoIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Select, TextInput, Toggle } from '../components/ui/Field';
import { useLab } from '../contexts/LabContext';
import { cx } from '../lib/format';
import { useArmPairReadiness } from '../hooks/useLabDerived';

const filters = [
{ id: 'all', label: 'All datasets' },
{ id: 'single', label: 'Single arm' },
{ id: 'dual', label: 'Dual arm' },
{ id: 'vr', label: 'VR recorded' },
{ id: 'local', label: 'Local only' },
{ id: 'uploaded', label: 'Uploaded' },
{ id: 'ready', label: 'Ready for training' }] as
const;

export function DatasetLibrary() {
  const { datasets, cameras, toast, setActiveDatasetId, activeDatasetId, createDataset } = useLab();
  const pairs = useArmPairReadiness();
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [repoId, setRepoId] = useState('');
  const [type, setType] = useState<'Single Arm' | 'Dual Arm'>('Dual Arm');
  const [vrRecorded, setVrRecorded] = useState(true);
  const [createIntent, setCreateIntent] = useState<'create' | 'record'>('create');
  const [taskDescription, setTaskDescription] = useState('');
  const [episodeTarget, setEpisodeTarget] = useState('5');
  const [episodeDuration, setEpisodeDuration] = useState('60');
  const [resetDuration, setResetDuration] = useState('15');
  const [advanced, setAdvanced] = useState(false);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(() => cameras.filter((camera) => camera.connection === 'connected').map((camera) => camera.id));
  const navigate = useNavigate();

  const visible = datasets.filter((d) => {
    switch (filter) {
      case 'single':
        return d.type === 'Single Arm';
      case 'dual':
        return d.type === 'Dual Arm';
      case 'vr':
        return d.vrRecorded;
      case 'local':
        return d.uploadStatus === 'local-only';
      case 'uploaded':
        return d.uploadStatus === 'uploaded';
      case 'ready':
        return d.trainingReady;
      default:
        return true;
    }
  });

  return (
    <div className="data-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Dataset library"
        description="Recorded episodes grouped into LeRobot-format datasets, ready for policy training."
        meta={<SimulatedBadge />}
        actions={
        <Button variant="primary" icon={PlusIcon} onClick={() => setCreateOpen(true)}>
            Create dataset
          </Button>
        } />
      

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dataset filters">
        {filters.map((f) =>
        <button
          key={f.id}
          type="button"
          onClick={() => setFilter(f.id)}
          aria-pressed={filter === f.id}
          className={cx(
            'h-8 rounded-lg border px-3 text-sm transition-colors duration-150 ease-smooth',
            filter === f.id ?
            'border-brand/45 bg-brand/10 text-brand' :
            'border-line bg-card text-ink2 hover:text-ink'
          )}>
          
            {f.label}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Select
                label="Active dataset"
                mono
                value={activeDatasetId}
                onChange={setActiveDatasetId}
                options={datasets.map((dataset) => ({ value: dataset.id, label: `${dataset.name} · ${dataset.episodes} episodes` }))}
              />
            </div>
            <Button icon={PlusIcon} onClick={() => { setCreateIntent('create'); setCreateOpen(true); }}>Create dataset</Button>
          </div>
        </Card>
        <Card accent="brand" className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-ink">Create a model</p>
            <p className="mt-1 text-sm text-ink2">Train the active dataset with ACT.</p>
          </div>
          <Button variant="primary" icon={BrainCircuitIcon} onClick={() => navigate('/training')}>Training</Button>
        </Card>
      </div>

      <Card>
        {visible.length ?
        <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                  <th scope="col" className="px-5 py-3 font-medium">Dataset</th>
                  <th scope="col" className="px-3 py-3 font-medium">Type</th>
                  <th scope="col" className="px-3 py-3 font-medium">Episodes</th>
                  <th scope="col" className="px-3 py-3 font-medium">Duration</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {visible.map((d) =>
              <tr key={d.id} className="transition-colors duration-150 ease-smooth hover:bg-subtle/60">
                    <td className="px-5 py-3.5">
                      <Link to={`/datasets/${d.id}`} className="font-mono text-sm text-ink hover:text-brand">
                        {d.name}
                      </Link>
                      <p className="font-mono text-xs text-faint">{d.repoId ?? 'no hub repository'}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge tone={d.type === 'Dual Arm' ? 'info' : 'neutral'} withIcon={false}>
                        {d.type}
                      </Badge>
                      {d.vrRecorded ?
                  <Badge tone="neutral" withIcon={false} className="ml-1">
                          VR
                        </Badge> :
                  null}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-sm text-ink">{d.episodes}</td>
                    <td className="px-3 py-3.5 font-mono text-sm text-ink2">{d.durationMin} min</td>
                    <td className="px-3 py-3.5">
                      {d.uploadStatus === 'uploaded' ?
                  <Badge tone="ok">Uploaded</Badge> :

                  <Badge tone="neutral">Local only</Badge>
                  }
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                      to={`/datasets/${d.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-ink hover:bg-elev">
                      
                          Open
                        </Link>
                        <details className="relative">
                          <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-subtle text-ink2 hover:text-ink" aria-label={`More actions for ${d.name}`}>
                            <MoreHorizontalIcon className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-line bg-card p-1 shadow-xl">
                            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-ink2 hover:bg-elev hover:text-ink" onClick={() => { setActiveDatasetId(d.id); navigate('/recording'); }}>Record episode</button>
                            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-ink2 hover:bg-elev hover:text-ink" disabled={!d.trainingReady} onClick={() => { setActiveDatasetId(d.id); navigate('/training'); }}>Train model</button>
                            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-ink2 hover:bg-elev hover:text-ink" onClick={() => toast({ title: 'Hugging Face Hub is unavailable', detail: 'Connect an access token in Settings to upload.', tone: 'warning' })}>Upload to Hub</button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div> :

        <EmptyState
          icon={DatabaseIcon}
          title="No datasets match this filter"
          description="Change the filter, or record a first episode to create a dataset for this workspace."
          actionLabel="Record episode"
          onAction={() => navigate('/recording')} />

        }
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a dataset"
        description="Create an empty LeRobot dataset, then record episodes into it.">
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const intent = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
              ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value
              : createIntent;
            createDataset({ name, repoId: repoId || null, type, vrRecorded });
            if (intent === 'record') {
              window.localStorage.setItem('lelab.recordingDraft', JSON.stringify({
                autoStart: true,
                taskDescription,
                episodeTarget,
                episodeDuration,
                resetDuration,
                vrRecorded,
                armConfig: type === 'Dual Arm' ? (vrRecorded ? 'vr' : 'dual') : 'left',
                selectedCameraIds
              }));
            }
            setCreateOpen(false);
            setName('');
            setRepoId('');
            if (intent === 'record') navigate('/recording');
          }}>
          <section>
            <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Robot Configuration</h3>
            <div className="mt-4">
              <Select label="Arm configuration" value={type} onChange={(value) => setType(value as 'Single Arm' | 'Dual Arm')} options={[
                { value: 'Dual Arm', label: 'Dual SO-101 arms' },
                { value: 'Single Arm', label: 'Single SO-101 arm' }
              ]} />
            </div>
            {type === 'Dual Arm' && !(pairs.left.ready && pairs.right.ready) ? <div className="mt-3 rounded-xl border border-warn/45 bg-warn/[0.08] p-3 text-sm text-warn">⚠ Both follower arms must be connected and calibrated before recording.</div> : null}
            {type === 'Single Arm' && !pairs.left.ready ? <div className="mt-3 rounded-xl border border-warn/45 bg-warn/[0.08] p-3 text-sm text-warn">⚠ The selected follower arm is not ready or calibrated.</div> : null}
          </section>

          <section className="space-y-4">
            <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Dataset Configuration</h3>
            <TextInput label="Dataset name *" value={name} onChange={setName} mono placeholder="fold_towel_bimanual" hint="Letters, numbers, underscore and hyphen are recommended." />
            <TextInput label="Hugging Face repository ID (optional)" value={repoId} onChange={setRepoId} mono placeholder="username/dataset-name" />
            <TextInput label="Task description *" value={taskDescription} onChange={setTaskDescription} placeholder="e.g. pick up the red block and place it on the blue square" />
            <TextInput label="Number of episodes" type="number" mono value={episodeTarget} onChange={setEpisodeTarget} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Episode duration (seconds)" type="number" mono value={episodeDuration} onChange={setEpisodeDuration} />
              <TextInput label="Reset duration (seconds)" type="number" mono value={resetDuration} onChange={setResetDuration} />
            </div>
          </section>

          <section>
            <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">Cameras</h3>
            {cameras.length ? <ul className="mt-3 space-y-2">{cameras.map((camera) => <li key={camera.id} className="flex items-center justify-between rounded-lg border border-line bg-elev/60 p-3 text-sm"><span className="flex items-center gap-2 text-ink"><CameraIcon className="h-4 w-4 text-faint" />{camera.name}</span>{camera.connection === 'connected' ? <input type="checkbox" checked={selectedCameraIds.includes(camera.id)} onChange={(event) => setSelectedCameraIds((current) => event.target.checked ? Array.from(new Set([...current, camera.id])) : current.filter((id) => id !== camera.id))} className="h-4 w-4 accent-brand" /> : <span className="text-faint">No signal</span>}</li>)}</ul> : <div className="mt-3 rounded-xl border border-dashed border-line p-7 text-center"><CameraIcon className="mx-auto h-8 w-8 text-faint" /><p className="mt-2 text-sm text-faint">No cameras are configured for this robot.</p></div>}
          </section>

          <Toggle label="Recorded with VR controllers" description="Use Quest controller poses as the teleoperation source." checked={vrRecorded} onChange={setVrRecorded} />
          <button type="button" onClick={() => setAdvanced((value) => !value)} className="flex w-full items-center justify-between border-y border-line py-3 text-left font-semibold text-ink">Advanced Parameters<ChevronDownIcon className={cx('h-4 w-4 transition-transform', advanced && 'rotate-180')} /></button>
          {advanced ? <div className="rounded-xl border border-line bg-elev/60 p-4 text-sm text-ink2">Dataset will be created locally. Hugging Face upload can be configured later from Integrations.</div> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" name="intent" value="create" icon={PlusIcon} disabled={!name.trim()}>Create only</Button>
            <Button type="submit" name="intent" value="record" variant="primary" icon={VideoIcon} disabled={!name.trim() || !taskDescription.trim() || Number(episodeTarget) < 1 || Number(episodeDuration) < 1}>Create & record</Button>
          </div>
        </form>
      </Modal>
    </div>);

}
