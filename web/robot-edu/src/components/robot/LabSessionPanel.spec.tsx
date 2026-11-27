// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LabSessionPanel } from './LabSessionPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const robot = (overrides: Record<string, unknown>) => ({ robotId: 'r1', name: 'Robot A', serialNo: 'SN-1', modelName: 'SO-101', operationalStatus: 'available', entitled: true, reservation: 'none', labSessionId: null, labSessionState: null, expiresAt: null, controllerActive: false, connectivity: 'online', status: 'available', ...overrides });
const session = { id: 's1', classroomId: 'c1', robotId: 'r1', state: 'active', startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), extensionCount: 0, endedAt: null, endReason: null, endedByRole: null };

async function render(role: 'instructor' | 'school_admin', robots: unknown[], sessions: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://x').pathname; calls.push(`${init?.method ?? 'GET'} ${path}`);
    const body = path.endsWith('/lab-robots') ? robots : path.endsWith('/lab-sessions') && (init?.method ?? 'GET') === 'GET' ? sessions : session;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LabSessionPanel classroomId="c1" token="t" role={role} /></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  return { container, root, calls };
}

describe('LabSessionPanel', () => {
  let root: Root | undefined;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { act(() => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.innerHTML = ''; });
  const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll('button')).map((b) => b.textContent);

  it('offers Start only to an Instructor for an unreserved robot and shows a plain-language status', async () => {
    const view = await render('instructor', [robot({})], []); root = view.root;
    expect(view.container.textContent).toContain('Available');
    expect(buttons(view.container)).toContain('Start Lab Session');
    expect(buttons(view.container)).not.toContain('Force end…');
  });

  it('shows Extend and End for the reserving Instructor', async () => {
    const view = await render('instructor', [robot({ reservation: 'this_classroom', labSessionId: 's1', labSessionState: 'active', status: 'reserved_for_this_classroom', expiresAt: session.expiresAt })], [session]); root = view.root;
    expect(view.container.textContent).toContain('Reserved for this classroom');
    expect(buttons(view.container)).toEqual(expect.arrayContaining(['Extend 30 min', 'End Lab Session']));
    expect(buttons(view.container)).not.toContain('Start Lab Session');
  });

  it('never exposes the other classroom and offers no Start for a robot reserved by another classroom', async () => {
    const view = await render('instructor', [robot({ reservation: 'other_classroom', status: 'reserved_by_another_classroom', controllerActive: null })], []); root = view.root;
    expect(view.container.textContent).toContain('Reserved by another classroom');
    expect(buttons(view.container)).not.toContain('Start Lab Session');
  });

  it('gives a School Admin only a controlled force end, and no Start/Extend/End', async () => {
    const view = await render('school_admin', [robot({ reservation: 'this_classroom', labSessionId: 's1', labSessionState: 'active', status: 'reserved_for_this_classroom', expiresAt: session.expiresAt })], [session]); root = view.root;
    expect(buttons(view.container)).toContain('Force end…');
    expect(buttons(view.container).filter((label) => /Start Lab|Extend|End Lab/.test(label ?? ''))).toEqual([]);
  });

  it('shows the actionable recovery state for a quarantined session', async () => {
    const view = await render('instructor', [robot({ reservation: 'this_classroom', labSessionId: 's1', labSessionState: 'quarantined', status: 'safety_blocked' })], [{ ...session, state: 'quarantined', recovery: 'The runtime could not confirm the stop.' }]); root = view.root;
    expect(view.container.textContent).toContain('Safety blocked');
    expect(view.container.textContent).toContain('could not confirm the stop');
    expect(buttons(view.container)).toContain('Retry release');
  });
});
