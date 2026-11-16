// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(), students: vi.fn(), list: vi.fn(), submissions: vi.fn(), teachingClassrooms: vi.fn(), deliveryOptions: vi.fn(), publishedQuizzes: vi.fn(), schoolClassrooms: vi.fn(),
}));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: 'school_admin', loading: false, error: null, memberships: [{ organizationId: 'org1', roleCode: 'school_admin', status: 'active' }] }) }));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok', user: { id: 't1' } }, loading: false, sessionRevision: 0 }) }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    classroomApi: { ...actual.classroomApi, detail: mocks.detail, students: mocks.students },
    instructorApi: { ...actual.instructorApi, submissions: mocks.submissions, teachingClassrooms: mocks.teachingClassrooms },
    assignmentApi: { ...actual.assignmentApi, list: mocks.list, deliveryOptions: mocks.deliveryOptions, publishedQuizzes: mocks.publishedQuizzes },
    educationAdminApi: { ...actual.educationAdminApi, classrooms: mocks.schoolClassrooms },
  };
});

import { QuizDeliveries } from './QuizDeliveries';
import { TeacherAssignmentEditor } from './TeacherAssignmentEditor';
import { TeacherClassDetail } from './TeacherClassDetail';
import { TeacherClasses } from './TeacherClasses';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
let container: HTMLDivElement; let root: Root;
const mount = async (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/teacher/classes" element={<TeacherClasses />} />
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
  mocks.schoolClassrooms.mockResolvedValue([
    { id: 'c2', organization_id: 'org1', offering_id: 'f1', name: 'Coding 9B', code: 'COD-9B', status: 'archived', offering_title: 'Robotics Foundations', student_count: 18, teaching_staff_count: 1 },
    { id: 'c1', organization_id: 'org1', offering_id: 'f1', name: 'Robotics Class A', code: 'RCA-1', status: 'active', offering_title: 'Robotics Foundations', student_count: 1, teaching_staff_count: 1 },
  ]);
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
    expect(container.textContent).toContain('Assign a quiz');
    expect(mocks.publishedQuizzes).toHaveBeenCalledWith('c1', 'tok');
    expect(container.textContent).toContain('Safety quiz'); // only the quiz delivery is listed here
    expect(container.textContent).not.toContain('Gripper task');
    expect(links()).toEqual(expect.arrayContaining([['Assignments', '/teacher/assignments']]));
  });

  it('school administrators reach quiz delivery for a specific classroom, and choose from their school’s classrooms otherwise', async () => {
    await mount('/school/quizzes?classroomId=c1');
    expect(container.textContent).toContain('Assign a quiz'); expect(mocks.schoolClassrooms).toHaveBeenCalledWith('org1', 'tok');
    expect(mocks.detail).not.toHaveBeenCalled(); // identity comes from the school’s authorized classroom list (shared with Classrooms)
    await act(async () => root.unmount()); root = createRoot(container);
    await mount('/school/quizzes');
    expect(container.querySelector('#quiz-classrooms-heading')?.textContent).toBe('Classrooms'); expect(container.textContent).not.toContain('Assign a quiz');
  });
});

describe('Quizzes page classroom states (A04)', () => {
  const rowLinks = () => [...container.querySelectorAll('section[aria-labelledby="quiz-classrooms-heading"] li a')] as HTMLAnchorElement[];
  it('lists the school’s classrooms with code, course and status, active first, linking to each classroom’s quizzes', async () => {
    await mount('/school/quizzes');
    const rows = rowLinks();
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/school/quizzes?classroomId=c1', '/school/quizzes?classroomId=c2']);
    expect(rows[0].textContent).toContain('Robotics Class AClassroom code RCA-1'); expect(rows[0].textContent).toContain('Robotics Foundations'); expect(rows[0].textContent).toContain('1 student');
    expect(rows[1].textContent).toContain('Archived'); expect(rows[1].textContent).toContain('18 students');
    expect(container.textContent).toContain('Archived classrooms are view-only.');
    expect(mocks.list).not.toHaveBeenCalled(); // no quiz data is loaded or invented before a classroom is chosen
    await act(async () => { rows[0].click(); }); await flush();
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('c1');
    expect(container.textContent).toContain('Assigned quizzes');
  });

  it('says when the school has no classrooms, and explains load failures with a retry', async () => {
    mocks.schoolClassrooms.mockResolvedValueOnce([]);
    await mount('/school/quizzes');
    expect(container.textContent).toContain('Your school has no classrooms yet.');
    expect(links()).toEqual(expect.arrayContaining([['Create one in Classrooms', '/school/classrooms']]));
    await act(async () => root.unmount()); root = createRoot(container);
    mocks.schoolClassrooms.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await mount('/school/quizzes');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('VISTA couldn’t be reached.');
    await act(async () => { ([...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Try again')) as HTMLButtonElement).click(); }); await flush();
    expect(rowLinks()).toHaveLength(2);
  });

  it('explains a permission refusal without offering a pointless retry', async () => {
    mocks.schoolClassrooms.mockRejectedValueOnce(new (await import('../../lib/api')).ApiError(403, 'Forbidden resource'));
    await mount('/school/quizzes');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Your account isn’t allowed to view this school’s classrooms.');
    expect(container.querySelector('[role="alert"] button')).toBeNull();
  });

  it('shows the classroom’s identity and status from a direct link, and blocks delivery when it is archived', async () => {
    mocks.teachingClassrooms.mockResolvedValue([{ id: 'c1', name: 'Robotics Class A', code: 'RCA-1', status: 'archived', student_count: 1 }]);
    await mount('/teacher/quizzes?classroomId=c1');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('c1'); expect(select.selectedOptions[0].textContent).toBe('Robotics Class A (RCA-1), archived');
    expect(container.querySelector('h2')?.textContent).toContain('Assigned quizzes');
    expect(container.textContent).toContain('Archived'); expect(container.textContent).toContain('This classroom is archived');
    expect(mocks.publishedQuizzes).not.toHaveBeenCalled();
    expect(links()).toEqual(expect.arrayContaining([['Open classroom', '/teacher/classes/c1']]));
  });

  it('says when a linked classroom is not one the teacher teaches instead of loading its quizzes', async () => {
    await mount('/teacher/quizzes?classroomId=gone');
    expect(container.textContent).toContain('This classroom isn’t available');
    expect(container.textContent).toContain('isn’t one you teach');
    expect(links()).toEqual(expect.arrayContaining([['Choose another classroom', '/teacher/quizzes']]));
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.publishedQuizzes).not.toHaveBeenCalled();
  });

  it('keeps a listed classroom selected and explains missing quiz access when the quiz endpoints answer 404 (regression)', async () => {
    const { ApiError } = await import('../../lib/api');
    mocks.list.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    mocks.publishedQuizzes.mockRejectedValue(new ApiError(404, 'Classroom was not found.'));
    await mount('/school/quizzes?classroomId=c1');
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('c1');
    expect(container.textContent).toContain('Course: Robotics Foundations');
    expect(container.textContent).toContain('Your account can’t manage quizzes for this classroom.');
    expect(container.textContent).not.toMatch(/wasn’t found|may have been removed|isn’t available/);
    expect(mocks.schoolClassrooms.mock.calls.length).toBeGreaterThan(1); // the authorized list is checked again
  });

  it('explains a school classroom that was not found', async () => {
    await mount('/school/quizzes?classroomId=gone');
    expect(container.textContent).toContain('It wasn’t found in your school.');
    expect(links()).toEqual(expect.arrayContaining([['Choose another classroom', '/school/quizzes']]));
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

describe('My classes (unified VISTA list)', () => {
  it('lists taught classrooms compactly, active first, with correct singular and plural counts', async () => {
    mocks.teachingClassrooms.mockResolvedValue([
      { id: 'c2', name: 'Coding 9B', code: 'COD-9B', status: 'archived', organization_name: 'Lake View', student_count: 18, assignment_count: 2 },
      { id: 'c1', name: 'Robotics Class A', code: 'RCA-1', status: 'active', organization_name: 'Lake View', student_count: 1, assignment_count: 1 },
    ]);
    await mount('/teacher/classes');
    const rows = [...container.querySelectorAll('main li a')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/teacher/classes/c1', '/teacher/classes/c2']);
    expect(rows[0].textContent).toContain('1 student'); expect(rows[0].textContent).not.toContain('1 students');
    expect(rows[0].textContent).toContain('1 assigned item'); expect(rows[1].textContent).toContain('18 students');
    expect(rows[1].textContent).toContain('Archived'); expect(rows[0].textContent).not.toContain('Active');
    expect(rows[0].textContent).not.toContain('Lake View'); // one school: no repeated school name
    expect(container.textContent).not.toContain('active teaching assignment');
  });
});
