// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireRole } from './RequireRole';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const useRole = vi.hoisted(() => vi.fn());
vi.mock('../../contexts/RoleContext', () => ({ useRole }));

describe('RequireRole administrative course route protection', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  async function renderRoute() {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/admin/courses']}><Routes><Route path="/admin/courses" element={<RequireRole roles={['admin']}><h1>Admin course management</h1></RequireRole>} /><Route path="/" element={<h1>Student workspace</h1>} /></Routes></MemoryRouter>));
  }

  it('allows the backend-resolved System Admin role', async () => {
    useRole.mockReturnValue({ role: 'admin', loading: false, error: null });
    await renderRoute();
    expect(container.textContent).toContain('Admin course management');
  });

  it('does not render the administrative route for a student', async () => {
    useRole.mockReturnValue({ role: 'student', loading: false, error: null });
    await renderRoute();
    expect(container.textContent).not.toContain('Admin course management');
    expect(container.textContent).toContain('Student workspace');
  });
});
