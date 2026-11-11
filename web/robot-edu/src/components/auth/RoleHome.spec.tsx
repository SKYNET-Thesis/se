// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoleHome } from './RoleHome';
import { RequireRole } from './RequireRole';
import type { Role } from '../../types/user';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const useRole = vi.hoisted(() => vi.fn());
vi.mock('../../contexts/RoleContext', () => ({ useRole }));

describe('role-aware workspace routing', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  async function renderAt(path: string) {
    await act(async () => root.render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/my-learning" element={<RequireRole roles={['student']}><h1>Student My Learning</h1></RequireRole>} />
          <Route path="/admin/users" element={<h1>Admin home</h1>} />
          <Route path="/school/classrooms" element={<h1>School home</h1>} />
          <Route path="/teacher" element={<h1>Teacher home</h1>} />
        </Routes>
      </MemoryRouter>));
  }

  it.each<[Role, string]>([
    ['student', 'Student My Learning'], ['teacher', 'Teacher home'], ['teaching_assistant', 'Teacher home'],
    ['school_admin', 'School home'], ['admin', 'Admin home'],
  ])('sends %s to its own home', async (role, heading) => {
    useRole.mockReturnValue({ role, loading: false, error: null });
    await renderAt('/');
    expect(container.textContent).toContain(heading);
  });

  it.each<Role>(['admin', 'school_admin', 'teacher', 'teaching_assistant'])('does not show student My Learning to %s', async (role) => {
    useRole.mockReturnValue({ role, loading: false, error: null });
    await renderAt('/my-learning');
    expect(container.textContent).not.toContain('Student My Learning');
  });
});
