// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GradebookTable } from './GradebookTable';

const mocks = vi.hoisted(() => ({ gradebook: vi.fn() }));
vi.mock('../../lib/api', () => ({ instructorApi: { gradebook: mocks.gradebook } }));
let root: Root; let host: HTMLDivElement;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); mocks.gradebook.mockReset(); });
const base = { learnerUserId: 'l', fullName: 'Ada', assignmentId: 'a', kind: null, status: 'submitted', submittedAt: null, rubric: null, passed: null, percentage: null, released: false, graded: 'none' as const };

it('shows quiz (auto) and rubric results side by side: weighted rubric text, partial drafts flagged, explicit zero counted', async () => {
  mocks.gradebook.mockResolvedValue([
    { ...base, attemptId: 'q', title: 'Safety quiz', kind: 'knowledge_check', resultKind: 'quiz', status: 'evaluated', percentage: 80, passed: true, released: true, graded: true },
    { ...base, attemptId: 'r', title: 'Blockly', resultKind: 'rubric', percentage: 60, graded: 'partial', rubric: { awarded: 12, max: 20, percentage: 60, scoreOutOf10: 6, rating: 'Needs Improvement', gradedCriteria: 1, totalCriteria: 2, complete: false } },
    { ...base, attemptId: 'z', title: 'Final', resultKind: 'rubric', percentage: 0, graded: 'complete', released: true, rubric: { awarded: 0, max: 10, percentage: 0, scoreOutOf10: 0, rating: 'Needs Review', gradedCriteria: 2, totalCriteria: 2, complete: true } },
    { ...base, attemptId: 'n', title: 'Plain', resultKind: 'other' },
  ]);
  await act(async () => root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GradebookTable classroomId="c" token="t" /></QueryClientProvider>));
  await vi.waitFor(() => expect(host.textContent).toContain('Safety quiz'));
  const cell = (id: string) => host.querySelector(`[data-testid="gradebook-result-${id}"]`)?.textContent;
  expect(cell('q')).toBe('80%');
  expect(cell('r')).toBe('12 / 20 · 60% · 6/10');
  expect(cell('z')).toBe('0 / 10 · 0% · 0/10');                       // explicit zero is a result, not "—"
  expect(cell('n')).toBe('—');
  expect(host.textContent).toContain('Draft · partly graded'); expect(host.textContent).toContain('Passed'); expect(host.textContent).toContain('Released');
});
