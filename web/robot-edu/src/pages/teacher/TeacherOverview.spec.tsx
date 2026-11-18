// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ teachingClassrooms: vi.fn() }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok' }, loading: false }) }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, instructorApi: { ...actual.instructorApi, teachingClassrooms: mocks.teachingClassrooms } };
});

import { ApiError } from '../../lib/api';
import { TeacherOverview } from './TeacherOverview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
let container: HTMLDivElement; let root: Root;
const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><TeacherOverview /></MemoryRouter></QueryClientProvider>); });
  await flush();
};
const classroom = (over: Record<string, unknown>) => ({ id: 'c1', organization_id: 'o1', name: 'Robotics 8A', code: 'ROB-8A', status: 'active', organization_name: 'Lake View School', student_count: 24, assignment_count: 5, ...over });

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe('Teaching overview (A07)', () => {
  it('marks an archived classroom so it is not mistaken for one still being taught', async () => {
    mocks.teachingClassrooms.mockResolvedValue([classroom({}), classroom({ id: 'c2', name: 'Coding 9B', status: 'archived', student_count: 1, assignment_count: 1 })]);
    await mount();
    const cards = [...container.querySelectorAll('article')].filter((card) => card.querySelector('h3'));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).not.toContain('Archived');
    expect(cards[1].textContent).toContain('Archived');
    expect(cards[1].textContent).toContain('1 student · 1 assignment');
    expect(container.textContent).not.toContain('Education API');
  });

  it('shows a plain-language error with Try again instead of the raw API message', async () => {
    mocks.teachingClassrooms.mockRejectedValue(new ApiError(500, 'relation "learning_classrooms" does not exist'));
    await mount();
    const alert = container.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Your teaching overview couldn’t be loaded. Try again.');
    expect(alert.textContent).not.toContain('relation');
    expect([...alert.querySelectorAll('button')].some((button) => button.textContent?.includes('Try again'))).toBe(true);
  });
});
