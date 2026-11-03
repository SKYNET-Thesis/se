// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonViewer } from './LessonViewer';
import type { LessonDetailResponse } from '../lib/api';

const mocks = vi.hoisted(() => ({ session: { access_token: 'token', user: { id: 'student' } }, lessonDetail: vi.fn() }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: mocks.session, loading: false, sessionRevision: 0 }) }));
vi.mock('../lib/api', async (original) => { const actual = await original<typeof import('../lib/api')>(); return { ...actual, catalogApi: { ...actual.catalogApi, lessonDetail: (...args: unknown[]) => mocks.lessonDetail(...args) } }; });

const lesson: LessonDetailResponse = { id: 'lesson-2', course_id: 'course-1', course_title: 'Robotics Fundamentals', title: 'Move the Robot', ordinal: 2, status: 'current', progressPercent: 0, lockReason: null, prerequisites: [], objectives: [], created_at: '', activeAttempt: null, priorAttempt: null, qualification: null, content: { version: 1, summary: 'Learn deterministic motion sequencing.', learningObjectives: [], conceptSections: [{ title: 'Deterministic Sequencing', content: 'Robots execute one step at a time.' }], robotConcept: 'The robot interprets a target in its workspace.', taskPreview: 'Program the left arm to home, move to Target A, and wait.', estimatedMinutes: 20, safetyNotes: ['Keep the workspace clear.'], completionCriteria: 'Complete the target-position simulation.' }, assignment: { id: 'a2', classroomAssignmentId: 'ca2', title: 'Reach Target A', instructions: 'Build a safe sequence.', allowedBlocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'], constraints: { kind: 'symbolic_program' } } };

describe('LessonViewer activity-map boundary', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.lessonDetail.mockResolvedValue(lesson); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
  async function render() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/courses/course-1/lessons/lesson-2']}><Routes><Route path="/courses/:courseId/lessons/:lessonId" element={<LessonViewer />} /></Routes></MemoryRouter></QueryClientProvider>); }); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
  it('renders an activity map rather than the instructional article', async () => {
    await render();
    expect(container.textContent).toContain('Learning activities');
    expect(container.textContent).toContain('Movement Fundamentals');
    expect(container.textContent).toContain('Understanding Robot Movement');
    expect(container.textContent).toContain('Reading • 4 min');
    expect(container.textContent).toContain('Robot Concept in Action');
    expect(container.textContent).toContain('Demonstration • 3 min');
    expect(container.textContent).toContain('Practice');
    expect(container.textContent).toContain('Build Your Move the Robot Sequence');
    expect(container.textContent).toContain('Reach Target A');
    expect(container.textContent).toContain('Simulation Feedback');

    // Instructional content must NOT be dumped into overview
    expect(container.textContent).not.toContain('Learn the Concepts');
    expect(container.textContent).not.toContain('Safety Protocols');
    expect(container.textContent).not.toContain('Your Practice Mission');
    expect(container.textContent).not.toContain('Deterministic Sequencing');
    expect(container.textContent).not.toContain('Target Positioning');

    // Activity links point to focused activity workspace
    const readingLink = container.querySelector('a[href*="/activities/lesson-2-reading-1"]');
    expect(readingLink).not.toBeNull();
  });

  it('does not render Practice Quiz questions on the module overview', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...lesson,
      id: 'lesson-1',
      ordinal: 1,
      title: 'Meet Your Robot',
      assignment: {
        id: 'a1',
        classroomAssignmentId: 'ca1',
        title: 'Safety Knowledge Check',
        instructions: 'Check your knowledge before operating the robot.',
        allowedBlocks: [],
        constraints: {
          kind: 'knowledge_check',
          questions: [
            { id: 'q1', prompt: 'Which command homes the robot?', options: ['home', 'stop', 'power'] },
          ],
        },
      },
    });
    await render();
    expect(container.textContent).toContain('Safety Knowledge Check');
    expect(container.textContent).toContain('Practice Quiz • 8 min');
    // Quiz questions must not be rendered on the overview
    expect(container.textContent).not.toContain('Which command homes the robot?');
    expect(container.textContent).not.toContain('Question 1 of 1');
  });

  it('keeps locked lessons non-navigable with their server reason', async () => {
    mocks.lessonDetail.mockResolvedValueOnce({
      ...lesson,
      status: 'locked',
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED',
        prerequisiteLessonId: 'l1',
        prerequisiteLessonTitle: 'Meet Your Robot',
        message: 'Complete Meet Your Robot first.',
      },
    });
    await render();
    expect(container.textContent).toContain('Complete Meet Your Robot first.');
    expect(container.querySelectorAll('a').length).toBeGreaterThan(0);
  });
});
