// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCandidatePicker } from './MemberCandidatePicker';
import { candidateMutationBody, candidatePageCount, candidateSearchChange, useDebouncedValue } from './memberCandidateState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const teacher = { userId: 'teacher-1', displayName: 'VISTA Demo Teacher', organizationRole: 'instructor', schoolCode: 'VISTA-TEA-001', accountState: 'active', alreadyMember: false };
const student = { userId: 'student-1', displayName: 'VISTA Demo Student', organizationRole: 'student', schoolCode: 'VISTA-STU-001', accountState: 'account_setup_pending', alreadyMember: false };

describe('member candidate state', () => {
  it('resets page and selection when search changes', () => {
    expect(candidateSearchChange('Vista Demo Teacher')).toEqual({ searchInput: 'Vista Demo Teacher', page: 1, selectedUserId: '' });
  });

  it('debounces server-side search by 300 ms', () => {
    vi.useFakeTimers();
    function Harness({ value }: { value: string }) { return <span>{useDebouncedValue(value, 300)}</span>; }
    const container = document.createElement('div'); const root = createRoot(container);
    act(() => root.render(<Harness value="old" />));
    act(() => root.render(<Harness value="teacher" />));
    expect(container.textContent).toBe('old');
    act(() => vi.advanceTimersByTime(299)); expect(container.textContent).toBe('old');
    act(() => vi.advanceTimersByTime(1)); expect(container.textContent).toBe('teacher');
    act(() => root.unmount()); vi.useRealTimers();
  });

  it('builds an Add Member mutation body containing userId only', () => {
    expect(candidateMutationBody('teacher-1')).toEqual({ userId: 'teacher-1' });
  });

  it('calculates real page count without an extra trailing page', () => {
    expect(candidatePageCount(20, 20)).toBe(1);
    expect(candidatePageCount(21, 20)).toBe(2);
  });
});
describe('MemberCandidatePicker', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = (overrides: Partial<React.ComponentProps<typeof MemberCandidatePicker>> = {}) => act(() => root.render(<MemberCandidatePicker
    candidates={[teacher]}
    total={1}
    page={1}
    pageSize={20}
    selectedUserId=""
    loading={false}
    onSelect={() => undefined}
    onPage={() => undefined}
    {...overrides}
  />));

  it('shows an explicit empty state and hides pagination for zero results', () => {
    render({ candidates: [], total: 0 });
    expect(container.textContent).toContain('No eligible members found.');
    expect(container.textContent).not.toContain('Previous');
  });

  it('hides pagination for a single result page', () => {
    render();
    expect(container.textContent).not.toContain('Page 1 of 1');
  });

  it('disables Previous on the first page and Next on the last page', () => {
    render({ total: 21, page: 1 });
    expect((container.querySelector('button[data-page="previous"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('button[data-page="next"]') as HTMLButtonElement).disabled).toBe(false);
    render({ total: 21, page: 2 });
    expect((container.querySelector('button[data-page="previous"]') as HTMLButtonElement).disabled).toBe(false);
    expect((container.querySelector('button[data-page="next"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects a candidate and displays Teacher and Student role previews', () => {
    const onSelect = vi.fn();
    render({ candidates: [teacher, student], total: 2, onSelect });
    act(() => (container.querySelector('input[value="teacher-1"]') as HTMLInputElement).click());
    expect(onSelect).toHaveBeenCalledWith('teacher-1');
    render({ candidates: [teacher, student], total: 2, selectedUserId: 'teacher-1', onSelect });
    expect(container.textContent).toContain('Classroom roleTeacher');
    render({ candidates: [teacher, student], total: 2, selectedUserId: 'student-1', onSelect });
    expect(container.textContent).toContain('Classroom roleStudent');
  });
});
