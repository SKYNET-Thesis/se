// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionState: { session: null as null | { access_token: string; expires_at?: number; user: { id: string } }, loading: true, sessionRevision: 0 },
  myLearning: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.sessionState }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, learnerApi: { ...actual.learnerApi, myLearning: mocks.myLearning } };
});

import { MyLearning } from './MyLearning';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const published = [{ classroom_assignment_id: 'delivery-1', title: 'Published gripper task', lesson_id: 'lesson-1', lesson_title: 'Gripper', classroom_name: 'Robotics Class A', course_title: 'Robotics', attempt_id: null, attempt_status: null, learning_status: 'assigned' as const }];

describe('My Learning auth and route lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  const renderRoute = async () => {
    await act(async () => {
      root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/my-learning']}><Routes><Route path="/my-learning" element={<MyLearning />} /></Routes></MemoryRouter></QueryClientProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.sessionState = { session: null, loading: true, sessionRevision: 0 };
    mocks.myLearning.mockReset();
  });
  afterEach(() => { act(() => root.unmount()); client.clear(); container.remove(); });

  it('executes the backend query when auth is already ready on direct route load', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();
    expect(mocks.myLearning).toHaveBeenCalledWith('ready-token');
    expect(container.textContent).toContain('Published gripper task');
  });

  it('waits during hydration and executes when the session becomes available', async () => {
    mocks.myLearning.mockResolvedValue(published);
    await renderRoute();
    expect(container.textContent).toContain('Restoring your learning');
    expect(mocks.myLearning).not.toHaveBeenCalled();

    mocks.sessionState = { session: { access_token: 'hydrated-token', expires_at: 20, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    await renderRoute();
    expect(mocks.myLearning).toHaveBeenCalledWith('hydrated-token');
    expect(container.textContent).toContain('Published gripper task');
  });

  it('retries with the refreshed session instead of retaining a failed old-token query', async () => {
    mocks.sessionState = { session: { access_token: 'old-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.myLearning.mockRejectedValueOnce(new Error('Expired token')).mockResolvedValueOnce(published);
    await renderRoute();
    expect(container.textContent).toContain('Expired token');

    mocks.sessionState = { session: { access_token: 'fresh-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 2 };
    await renderRoute();
    expect(mocks.myLearning).toHaveBeenLastCalledWith('fresh-token');
    expect(container.textContent).toContain('Published gripper task');
  });

  it('does not present an API error as an empty assignment list', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.myLearning.mockRejectedValue(new Error('Unable to load learning.'));
    await renderRoute();
    expect(container.textContent).toContain('Unable to load learning.');
    expect(container.textContent).not.toContain('No assigned learning');
  });

  it('renders the genuine empty state only after a successful zero-result response', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.myLearning.mockResolvedValue([]);
    await renderRoute();
    expect(container.textContent).toContain('No assigned learning');
    expect(container.textContent).not.toContain('Restoring your learning');
  });

  it('does not render stale assignments beside a failed background refresh', async () => {
    mocks.sessionState = { session: { access_token: 'ready-token', expires_at: 10, user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    mocks.myLearning.mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('Refresh failed'));
    await renderRoute();
    expect(container.textContent).toContain('Published gripper task');
    await act(async () => { await client.invalidateQueries({ queryKey: ['student-learning'] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('Refresh failed');
    expect(container.textContent).not.toContain('Published gripper task');
  });
});
