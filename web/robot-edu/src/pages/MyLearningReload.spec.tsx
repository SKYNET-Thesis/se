// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionState: { session: null as null | { access_token: string; user: { id: string } }, loading: true, sessionRevision: 0 },
  coursePaths: vi.fn(),
  quizzes: vi.fn(),
  roles: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.sessionState }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    progressionApi: { ...actual.progressionApi, coursePaths: mocks.coursePaths, quizzes: mocks.quizzes },
    identityApi: { ...actual.identityApi, roles: mocks.roles },
  };
});

import { RequireSession } from '../components/auth/RequireSession';
import { RoleProvider } from '../contexts/RoleContext';
import { SchoolQueryProvider } from '../queries/SchoolQueryProvider';
import { MyLearning } from './MyLearning';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const course = {
  course: { id: 'c1', title: 'Robotics Reloaded', status: 'published', level: 'Intro', recommendedGrades: '6-8' },
  progressPercent: 30,
  currentLessonId: 'l-1',
  lessons: [{ id: 'l-1', ordinal: 1, title: 'L1', status: 'current' as const, progressPercent: 0, prerequisite: [] }],
};

describe('My Learning full hard-reload provider lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderApp = async () => {
    await act(async () => {
      root.render(<SchoolQueryProvider><MemoryRouter><RoleProvider><RequireSession><MyLearning /></RequireSession></RoleProvider></MemoryRouter></SchoolQueryProvider>);
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.sessionState = { session: null, loading: true, sessionRevision: 0 };
    mocks.coursePaths.mockReset().mockResolvedValue([course]);
    mocks.quizzes.mockReset().mockResolvedValue([]);
    mocks.roles.mockReset().mockResolvedValue({ systemRoleCodes: [], memberships: [{ organizationId: 'org-1', roleCode: 'student', status: 'active', permissionCodes: [] }] });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('leaves restoring and renders the HTTP-200 learning result after auth and roles hydrate', async () => {
    await renderApp();
    expect(container.textContent).toContain('Restoring secure session');

    mocks.sessionState = { session: { access_token: 'student-token', user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    await renderApp();

    expect(mocks.coursePaths).toHaveBeenCalledWith('student-token');
    expect(mocks.roles).toHaveBeenCalledWith('student-token');
    expect(container.textContent).not.toContain('Restoring your learning');
    expect(container.textContent).toContain('Robotics Reloaded');
  });

  it('does not restart learning for repeated equivalent authenticated events', async () => {
    mocks.sessionState = { session: { access_token: 'student-token', user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    await renderApp();
    mocks.sessionState = { session: { access_token: 'student-token', user: { id: 'student-1' } }, loading: false, sessionRevision: 1 };
    await renderApp();

    expect(mocks.coursePaths).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Robotics Reloaded');
  });
});
