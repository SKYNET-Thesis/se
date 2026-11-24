// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { AiRegistry } from './AiRegistry';

const api = vi.hoisted(() => ({
  modelApi: { models: vi.fn(), checkpoints: vi.fn(), trainingRuns: vi.fn() },
  modelLineageApi: { trainingData: vi.fn() },
  datasetApi: { mine: vi.fn() },
  evaluationRunApi: { mine: vi.fn() },
}));
vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/api')>()), ...api }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 't', user: { id: 'u1' } } }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function mount() {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AiRegistry /></QueryClientProvider>));
  await settle();
  return { container, unmount: () => act(() => root.unmount()) };
}
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await settle(); };
const byText = (root: ParentNode, selector: string, pattern: RegExp) => [...root.querySelectorAll(selector)].find((node) => pattern.test(node.textContent ?? ''));

const model = { id: 'm-1', name: 'Pick-and-place policy', description: 'Tabletop pick and place.', owner_type: 'organization', visibility: 'public', status: 'active', created_at: '2026-10-01T00:00:00Z' };
const checkpoint = { id: 'c-1', ai_model_id: 'm-1', training_run_id: 'tr-1', version: 'v2', step: 4000, huggingface_repo: 'vista/pnp', huggingface_revision: 'abc123', metrics: { success_rate: 0.8, nested: { x: 1 } }, created_at: '2026-10-10T00:00:00Z' };

describe('AiRegistry', () => {
  beforeEach(() => {
    api.modelApi.models.mockResolvedValue({ items: [model], page: 1, pageSize: 20 });
    api.modelApi.checkpoints.mockResolvedValue([checkpoint]);
    api.modelLineageApi.trainingData.mockResolvedValue({ name: 'tabletop-demos', version: 'v1', huggingface_repo: 'vista/demos', huggingface_revision: 'r9', is_frozen: true });
    api.modelApi.trainingRuns.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    api.datasetApi.mine.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    api.evaluationRunApi.mine.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
  });
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('says up front that it is read-only metadata and lists the models the API returns', async () => {
    const view = await mount();
    const text = view.container.textContent ?? '';
    expect(text).toContain('does not run model inference');
    expect(text).toContain('Pick-and-place policy'); expect(text).toContain('active');
    await view.unmount();
  });

  it('shows a model’s versions with stored metrics and source, and the training dataset on request, inventing nothing', async () => {
    const view = await mount();
    await click(byText(view.container, 'button', /Show versions and lineage/));
    expect(view.container.textContent).toContain('Version v2 · step 4000');
    expect(view.container.textContent).toContain('Source vista/pnp@abc123');
    expect(view.container.textContent).toContain('success rate: 0.8');
    expect(view.container.textContent).not.toContain('nested');          // nested values are not flattened or invented
    await click(byText(view.container, 'button', /Show training data/));
    expect(view.container.textContent).toContain('tabletop-demos');
    expect(view.container.textContent).toContain('vista/demos@r9');
    await view.unmount();
  });

  it('explains when the account has no access (404) instead of showing an error or an empty page', async () => {
    api.modelApi.models.mockRejectedValue(new ApiError(404, 'AI model was not found.'));
    const view = await mount();
    expect(view.container.textContent).toContain('AI models are not available to your account');
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    await view.unmount();
  });

  it('is honest about an empty registry', async () => {
    api.modelApi.models.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    const view = await mount();
    expect(view.container.textContent).toContain('No ai models yet');
    await view.unmount();
  });

  it('offers Try again when loading fails and recovers', async () => {
    api.modelApi.models.mockRejectedValueOnce(new ApiError(500, 'x'));
    const view = await mount();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    await click(byText(view.container, 'button', /Try again/));
    expect(view.container.textContent).toContain('Pick-and-place policy');
    await view.unmount();
  });

  it('lists datasets and the training and evaluation runs that belong to the account', async () => {
    api.datasetApi.mine.mockResolvedValue({ items: [{ id: 'd1', name: 'tabletop-demos', version: 'v1', is_frozen: true, huggingface_repo: 'vista/demos', huggingface_revision: 'r9', provenance: { source: 'simulation', episodes: 30 }, created_at: '2026-10-02T00:00:00Z' }], page: 1, pageSize: 20 });
    api.modelApi.trainingRuns.mockResolvedValue({ items: [{ id: 'abcdef12-0000', policy_name: 'act', status: 'completed', dataset_name: 'tabletop-demos', dataset_version: 'v1', compute_source: 'local', metrics: { loss: 0.12 } }], page: 1, pageSize: 20 });
    api.evaluationRunApi.mine.mockResolvedValue({ items: [{ id: '12345678-0000', target_mode: 'simulation', status: 'completed', outcome: 'passed', trial_count: 30, success_count: 24, metrics: { success_rate: 0.8 } }], page: 1, pageSize: 20 });
    const view = await mount();
    await click(byText(view.container, '[role="tab"]', /Datasets/));
    expect(view.container.textContent).toContain('tabletop-demos'); expect(view.container.textContent).toContain('Frozen'); expect(view.container.textContent).toContain('source: simulation · episodes: 30');
    await click(byText(view.container, '[role="tab"]', /Training & evaluation/));
    expect(view.container.textContent).toContain('act'); expect(view.container.textContent).toContain('loss: 0.12');
    expect(view.container.textContent).toContain('24 of 30 trials succeeded');
    await view.unmount();
  });

  it('asks for lineage by model version (not by training run) and says plainly when a version\u2019s dataset is not published', async () => {
    api.modelLineageApi.trainingData.mockRejectedValueOnce(new ApiError(404, 'Training data is not available for this version.'));
    const view = await mount();
    await click(byText(view.container, 'button', /Show versions and lineage/));
    await click(byText(view.container, 'button', /Show training data/));
    expect(api.modelLineageApi.trainingData).toHaveBeenCalledWith('c-1', 't');
    expect(view.container.textContent).toContain('only released (frozen) dataset versions are shown');
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    await view.unmount();
  });

  it('never shows owner references or artifact locations, even if a response carried them', async () => {
    api.modelApi.models.mockResolvedValue({ items: [{ ...model, owner_user_id: 'user-secret', owner_organization_id: 'org-secret' }], page: 1, pageSize: 20 });
    api.modelApi.checkpoints.mockResolvedValue([{ ...checkpoint, artifact_uri: 's3://private/weights.bin' }]);
    const view = await mount();
    await click(byText(view.container, 'button', /Show versions and lineage/));
    expect(view.container.textContent).not.toMatch(/user-secret|org-secret|s3:\/\/private|weights\.bin/);
    await view.unmount();
  });
});
