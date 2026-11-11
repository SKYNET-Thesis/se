// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassroomLifecyclePanel } from './ClassroomLifecyclePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ archiveClassroom: vi.fn(), reactivateClassroom: vi.fn(), assignClassroomOffering: vi.fn() }));
vi.mock('../../lib/api', () => ({ educationAdminApi: api }));

const offerings = [{ id: 'o1', code: 'A', title: 'Robotics A', status: 'active' }, { id: 'o2', code: 'B', title: 'Robotics B', status: 'active' }];
const classroom = (status: string) => ({ id: 'room-1', organization_id: 'org-1', offering_id: 'o1', name: 'Class 7A', code: '7A', status, offering_title: 'Robotics A', student_count: 3, teaching_staff_count: 1 });

describe('ClassroomLifecyclePanel', () => {
  let root: Root; let host: HTMLDivElement; const onChanged = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); api.archiveClassroom.mockResolvedValue({}); api.reactivateClassroom.mockResolvedValue({}); api.assignClassroomOffering.mockResolvedValue({}); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  const render = async (status: string) => act(async () => root.render(
    <QueryClientProvider client={new QueryClient()}><ClassroomLifecyclePanel organizationId="org-1" classroom={classroom(status) as never} offerings={offerings} token="t" onChanged={onChanged} /></QueryClientProvider>));
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it('archives an active classroom only after confirmation', async () => {
    await render('active');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => button('Archive classroom')!.click());
    expect(api.archiveClassroom).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => button('Archive classroom')!.click()); await flush();
    expect(api.archiveClassroom).toHaveBeenCalledWith('org-1', 'room-1', 't');
    expect(onChanged).toHaveBeenCalled();
  });

  it('offers reactivation, not archiving, for an archived classroom and locks the offering', async () => {
    await render('archived');
    expect(button('Archive classroom')).toBeUndefined();
    expect((host.querySelector('select') as HTMLSelectElement).disabled).toBe(true);
    await act(async () => button('Reactivate classroom')!.click()); await flush();
    expect(api.reactivateClassroom).toHaveBeenCalledWith('org-1', 'room-1', 't');
  });

  it('changes the offering only when a different one is selected', async () => {
    await render('active');
    expect(button('Change offering')!.disabled).toBe(true);
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'o2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(button('Change offering')!.disabled).toBe(false);
    await act(async () => button('Change offering')!.click()); await flush();
    expect(api.assignClassroomOffering).toHaveBeenCalledWith('org-1', 'room-1', 'o2', 't');
  });

  it('shows the server error and does not report success', async () => {
    api.reactivateClassroom.mockRejectedValue(new Error('Classroom was not found.'));
    await render('archived');
    await act(async () => button('Reactivate classroom')!.click()); await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Classroom was not found.');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
