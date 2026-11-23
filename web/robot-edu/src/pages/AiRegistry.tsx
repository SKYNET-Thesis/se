import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DatabaseIcon, RotateCwIcon } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { datasetApi, evaluationRunApi, modelApi, type ApiRecord } from '../lib/api';
import { metricsSummary, registryState, sourceLabel, statusTone, successRate } from '../queries/aiRegistryModel';

type TabId = 'models' | 'datasets' | 'runs';
const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
const when = (value: unknown) => { const text = str(value); return text ? new Date(text).toLocaleDateString() : null; };
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : '—');
const keys = (name: string, userId?: string) => ['ai-registry', name, userId] as const;

/**
 * Model / Dataset Registry (SRS FR-08, UC-08): read-only, traceable metadata for AI models, datasets and evaluations that the API says
 * this account may see. It shows what is stored and nothing else: no inference, no training, no invented metrics.
 */
export function AiRegistry() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? ''; const userId = session?.user.id;
  const [tab, setTab] = useState<TabId>('models');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const enabled = Boolean(token);
  const models = useQuery({ queryKey: keys('models', userId), queryFn: () => modelApi.models(token), enabled: enabled && tab === 'models', retry: false });
  const datasets = useQuery({ queryKey: keys('datasets', userId), queryFn: () => datasetApi.mine(token), enabled: enabled && tab === 'datasets', retry: false });
  const training = useQuery({ queryKey: keys('training', userId), queryFn: () => modelApi.trainingRuns(token), enabled: enabled && tab === 'runs', retry: false });
  const evaluations = useQuery({ queryKey: keys('evaluations', userId), queryFn: () => evaluationRunApi.mine(token), enabled: enabled && tab === 'runs', retry: false });

  return <div className="mx-auto max-w-6xl p-4 sm:p-6">
    <PageHeader eyebrow="Read-only" title="AI models & data" description="Where each AI model, dataset and evaluation came from. This page shows stored metadata only; VISTA does not run model inference here." />
    <Tabs label="AI registry sections" className="mt-6" value={tab} onChange={setTab} items={[{ id: 'models', label: 'Models' }, { id: 'datasets', label: 'Datasets' }, { id: 'runs', label: 'Training & evaluation' }]} />
    <div id={`panel-${tab}`} role="tabpanel" className="mt-6">
      {tab === 'models' && <Models query={models} token={token} selected={selectedModel} onSelect={setSelectedModel} />}
      {tab === 'datasets' && <Datasets query={datasets} />}
      {tab === 'runs' && <Runs training={training} evaluations={evaluations} />}
    </div>
  </div>;
}

type ListQuery = { isLoading: boolean; error: unknown; data?: { items: ApiRecord[] }; refetch: () => unknown };
function Retry({ onRetry, what }: { onRetry: () => unknown; what: string }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger"><span>{what} could not be loaded. Check your connection, then try again.</span><Button size="sm" variant="secondary" icon={<RotateCwIcon className="h-3.5 w-3.5" />} onClick={() => void onRetry()}>Try again</Button></div>;
}
function List({ query, what, unavailable, empty, render }: { query: ListQuery; what: string; unavailable: string; empty: string; render: (items: ApiRecord[]) => React.ReactNode }) {
  if (query.isLoading) return <p className="text-sm text-ink-muted">Loading {what.toLowerCase()}…</p>;
  const state = registryState(query.error);
  if (state === 'error') return <Retry onRetry={query.refetch} what={what} />;
  if (state === 'unavailable') return <EmptyState compact icon={<DatabaseIcon className="h-5 w-5" />} title={`${what} are not available to your account`} description={unavailable} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) return <EmptyState compact icon={<DatabaseIcon className="h-5 w-5" />} title={`No ${what.toLowerCase()} yet`} description={empty} />;
  return <>{render(items)}</>;
}

function Models({ query, token, selected, onSelect }: { query: ListQuery; token: string; selected: string | null; onSelect: (id: string | null) => void }) {
  return <List query={query} what="AI models" unavailable="Your role has no access to the model registry. Ask a School Admin or a System Admin if you need it." empty="No model has been registered for your account."
    render={(items) => <ul className="grid gap-3 lg:grid-cols-2">{items.map((model) => {
      const id = String(model.id); const open = selected === id;
      return <li key={id} className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="truncate text-base font-semibold text-ink">{str(model.name) ?? 'Unnamed model'}</h3>
            <p className="mt-1 text-xs text-ink-subtle">Registered {when(model.created_at) ?? '—'} · {str(model.owner_type) ?? 'owner not recorded'} · {str(model.visibility) ?? 'visibility not recorded'}</p></div>
          {str(model.status) && <Badge tone={statusTone(str(model.status))}>{str(model.status)}</Badge>}
        </div>
        {str(model.description) && <p className="mt-3 text-sm text-ink-muted">{str(model.description)}</p>}
        <Button className="mt-3" size="sm" variant="secondary" aria-expanded={open} onClick={() => onSelect(open ? null : id)}>{open ? 'Hide versions' : 'Show versions and lineage'}</Button>
        {open && <Checkpoints modelId={id} token={token} />}
      </li>;
    })}</ul>} />;
}

function Checkpoints({ modelId, token }: { modelId: string; token: string }) {
  const query = useQuery({ queryKey: ['ai-registry', 'checkpoints', modelId], queryFn: () => modelApi.checkpoints(modelId, token), retry: false });
  const [lineage, setLineage] = useState<string | null>(null);
  if (query.isLoading) return <p className="mt-3 text-sm text-ink-muted">Loading versions…</p>;
  if (query.error) return <div className="mt-3"><Retry onRetry={query.refetch} what="Model versions" /></div>;
  const rows = query.data ?? [];
  if (rows.length === 0) return <p className="mt-3 text-sm text-ink-muted">No version has been recorded for this model.</p>;
  return <ul aria-label="Model versions" className="mt-3 divide-y divide-line border-t border-line">{rows.map((row) => {
    const id = String(row.id); const source = sourceLabel(str(row.huggingface_repo), str(row.huggingface_revision)); const metrics = metricsSummary(row.metrics); const run = str(row.training_run_id);
    return <li key={id} className="py-3 text-sm">
      <p className="font-medium text-ink">Version {str(row.version) ?? '—'}{typeof row.step === 'number' ? ` · step ${row.step}` : ''}<span className="ml-2 text-xs font-normal text-ink-subtle">{when(row.created_at)}</span></p>
      <p className="mt-1 text-xs text-ink-muted">{source ? `Source ${source}` : 'No source recorded'}</p>
      <p className="mt-1 text-xs text-ink-muted">{metrics.length ? metrics.join(' · ') : 'No metrics recorded'}</p>
      {run ? <><Button className="mt-2" size="sm" variant="ghost" aria-expanded={lineage === id} onClick={() => setLineage(lineage === id ? null : id)}>{lineage === id ? 'Hide training data' : 'Show training data'}</Button>{lineage === id && <Lineage runId={run} token={token} />}</>
        : <p className="mt-1 text-xs text-ink-subtle">No training run is linked to this version.</p>}
    </li>;
  })}</ul>;
}

function Lineage({ runId, token }: { runId: string; token: string }) {
  const query = useQuery({ queryKey: ['ai-registry', 'lineage', runId], queryFn: () => modelApi.trainingDataset(runId, token), retry: false });
  if (query.isLoading) return <p className="mt-2 text-xs text-ink-muted">Loading training data…</p>;
  if (registryState(query.error) === 'unavailable') return <p className="mt-2 text-xs text-ink-muted">The training data of this version is not visible to your account.</p>;
  if (query.error) return <div className="mt-2"><Retry onRetry={query.refetch} what="Training data" /></div>;
  const dataset = query.data ?? {}; const source = sourceLabel(str(dataset.huggingface_repo), str(dataset.huggingface_revision));
  return <p className="mt-2 rounded-md bg-sunken/50 p-2 text-xs text-ink-muted">Trained on dataset <span className="font-medium text-ink">{str(dataset.name) ?? 'unnamed'} {str(dataset.version) ?? ''}</span>{source ? ` · ${source}` : ''}{dataset.is_frozen === true ? ' · frozen' : ''}</p>;
}

function Datasets({ query }: { query: ListQuery }) {
  return <List query={query} what="Datasets" unavailable="Dataset versions are not available to your account." empty="No dataset version has been created by your account."
    render={(items) => <ul className="grid gap-3 lg:grid-cols-2">{items.map((dataset) => {
      const source = sourceLabel(str(dataset.huggingface_repo), str(dataset.huggingface_revision));
      return <li key={String(dataset.id)} className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-semibold text-ink">{str(dataset.name) ?? 'Unnamed dataset'} <span className="text-sm font-normal text-ink-muted">{str(dataset.version)}</span></h3>
          <Badge tone={dataset.is_frozen === true ? 'ok' : 'neutral'}>{dataset.is_frozen === true ? 'Frozen' : 'Not frozen'}</Badge></div>
        <p className="mt-1 text-xs text-ink-subtle">Created {when(dataset.created_at) ?? '—'}</p>
        <p className="mt-2 text-xs text-ink-muted">{source ? `Source ${source}` : 'No source recorded'}</p>
        <p className="mt-1 text-xs text-ink-muted">{metricsSummary(dataset.provenance).join(' · ') || 'No provenance recorded'}</p>
      </li>;
    })}</ul>} />;
}

function Runs({ training, evaluations }: { training: ListQuery; evaluations: ListQuery }) {
  return <div className="space-y-8">
    <section aria-label="Training runs"><h2 className="text-lg font-semibold text-ink">Training runs</h2><div className="mt-3">
      <List query={training} what="Training runs" unavailable="Training runs are not available to your account." empty="Your account has not requested a training run."
        render={(items) => <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{items.map((run) => <li key={String(run.id)} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <div><p className="font-medium text-ink">{str(run.policy_name) ?? 'Training run'} <span className="text-xs font-normal text-ink-subtle">#{short(run.id)}</span></p>
            <p className="mt-1 text-xs text-ink-muted">Dataset {str(run.dataset_name) ?? '—'} {str(run.dataset_version) ?? ''} · {str(run.compute_source) ?? 'compute not recorded'} · {metricsSummary(run.metrics).join(' · ') || 'No metrics recorded'}</p></div>
          {str(run.status) && <Badge tone={statusTone(str(run.status))}>{str(run.status)}</Badge>}
        </li>)}</ul>} /></div></section>
    <section aria-label="Evaluation runs"><h2 className="text-lg font-semibold text-ink">Evaluation runs</h2><div className="mt-3">
      <List query={evaluations} what="Evaluation runs" unavailable="Evaluation runs are not available to your account." empty="Your account has not requested an evaluation run."
        render={(items) => <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{items.map((run) => {
          const rate = successRate(run.trial_count as number | null, run.success_count as number | null);
          return <li key={String(run.id)} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div><p className="font-medium text-ink">Evaluation #{short(run.id)} <span className="text-xs font-normal text-ink-subtle">{str(run.target_mode) ?? 'mode not recorded'}</span></p>
              <p className="mt-1 text-xs text-ink-muted">{rate ?? 'No trial count recorded'} · {metricsSummary(run.metrics).join(' · ') || 'No metrics recorded'}</p></div>
            <div className="flex gap-2">{str(run.outcome) && <Badge tone={statusTone(str(run.outcome))}>{str(run.outcome)}</Badge>}{str(run.status) && <Badge tone="outline">{str(run.status)}</Badge>}</div>
          </li>;
        })}</ul>} /></div></section>
  </div>;
}
