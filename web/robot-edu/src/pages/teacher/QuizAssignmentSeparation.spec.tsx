// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(), students: vi.fn(), list: vi.fn(), submissions: vi.fn(), teachingClassrooms: vi.fn(), deliveryOptions: vi.fn(), publishedQuizzes: vi.fn(),
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok', user: { id: 't1' } }, loading: false, sessionRevision: 0 }) }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    classroomApi: { ...actual.classroomApi, detail: mocks.detail, students: mocks.students },
    instructorApi: { ...actual.instructorApi, submissions: mocks.submissions, teachingClassrooms: mocks.teachingClassrooms },
    assignmentApi: { ...actual.assignmentApi, list: mocks.list, deliveryOptions: mocks.deliveryOptions, publishedQuizzes: mocks.publishedQuizzes },
  };
});

import { QuizDeliveries } from './QuizDeliveries';
import { TeacherAssignmentEditor } from './TeacherAssignmentEditor';
import { TeacherClassDetail } from './TeacherClassDetail';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
let container: HTMLDivElement; let root: Root;
const mount = async (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/teacher/classes/:classroomId" element={<TeacherClassDetail />} />
    <Route path="/teacher/quizzes" element={<QuizDeliveries audience="teacher" />} />
    <Route path="/school/quizzes" element={<QuizDeliveries audience="school" />} />
    <Route path="/teacher/assignments/new" element={<TeacherAssignmentEditor />} />
  </Routes></MemoryRouter></QueryClientProvider>); }); await flush();
};
const links = () => [...container.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.detail.mockResolvedValue({ id: 'c1', name: 'Robotics Class A', allocated_robot: null }); mocks.students.mockResolvedValue([]); mocks.submissions.mockResolvedValue([]);
  mocks.teachingClassrooms.mockResolvedValue([{ id: 'c1', name: 'Robotics Class A', student_count: 1, enrolled_student_count: 1 }]);
  mocks.list.mockResolvedValue([
    { id: 'd1', assignment_id: 'a1', title: 'Gripper task', status: 'published', constraints: {}, lesson_title: 'L1' },
    { id: 'd2', assignment_id: 'a2', title: 'Safety quiz', status: 'draft', constraints: { kind: 'knowledge_check' }, lesson_title: 'L1' },
  ]);
  mocks.deliveryOptions.mockResolvedValue([]); mocks.publishedQuizzes.mockResolvedValue([]);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe('Quiz and Assignment are separate workflows', () => {
  it('Classroom Detail has no inline authoring form, offers two labelled actions, and distinguishes the delivery types', async () => {
    await mount('/teacher/classes/c1');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('Create assignment draft'); expect(container.textContent).not.toContain('Assign a published quiz');
    expect(links()).toEqual(expect.arrayContaining([['New assignment', '/teacher/assignments/new?classroomId=c1'], ['Assign a quiz', '/teacher/quizzes?classroomId=c1']]));
    const text = container.textContent ?? '';
    expect(text).toContain('Gripper task'); expect(text).toContain('Safety quiz');
    expect(text.match(/Quiz/g)?.length).toBeGreaterThan(0); expect(text).toContain('Assignment');
  });

  it('the Assignment page offers Blockly only and points to Quizzes instead of embedding quiz delivery', async () => {
    await mount('/teacher/assignments/new?classroomId=c1');
    expect(container.textContent).toContain('Blockly programming');
    expect(container.textContent).not.toContain('Assign a published quiz'); // no embedded quiz delivery form
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(links()).toEqual(expect.arrayContaining([['Quizzes', '/teacher/quizzes?classroomId=c1']]));
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('c1'); // classroom preselected from the Classroom page
  });

  it('the Quizzes page owns quiz delivery, scoped to the chosen classroom, without assignment authoring', async () => {
    await mount('/teacher/quizzes?classroomId=c1');
    expect(container.textContent).toContain('Assign a published quiz');
    expect(mocks.publishedQuizzes).toHaveBeenCalledWith('c1', 'tok');
    expect(container.textContent).toContain('Safety quiz'); // only the quiz delivery is listed here
    expect(container.textContent).not.toContain('Gripper task');
    expect(links()).toEqual(expect.arrayContaining([['Assignments', '/teacher/assignments']]));
  });

  it('school administrators reach quiz delivery for a specific classroom, and are asked to choose one otherwise', async () => {
    await mount('/school/quizzes?classroomId=c1');
    expect(container.textContent).toContain('Assign a published quiz'); expect(mocks.detail).toHaveBeenCalledWith('c1', 'tok');
    await act(async () => root.unmount()); root = createRoot(container);
    await mount('/school/quizzes');
    expect(container.textContent).toContain('Choose a classroom'); expect(container.textContent).not.toContain('Assign a published quiz');
  });
});
