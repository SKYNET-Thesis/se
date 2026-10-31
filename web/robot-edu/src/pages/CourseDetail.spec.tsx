// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionState: { session: null as null | { access_token: string; expires_at?: number; user: { id: string } }, loading: true, sessionRevision: 0 },
  coursePath: vi.fn(),
  course: vi.fn(),
}));

vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => mocks.sessionState }));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    progressionApi: { ...actual.progressionApi, coursePath: mocks.coursePath },
    catalogApi: { ...actual.catalogApi, course: mocks.course },
  };
});

import { CourseDetail } from './CourseDetail';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const coursePathFixture = {
  course: { id: 'c1-uuid', title: 'Robotics Fundamentals', status: 'published' },
  progressPercent: 40,
  currentLessonId: 'lesson-3-uuid',
  lessons: [
    {
      id: 'lesson-1-uuid',
      ordinal: 1,
      title: 'Meet Your Robot',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [],
      lockReason: null,
      completedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'lesson-2-uuid',
      ordinal: 2,
      title: 'Move the Robot',
      status: 'completed' as const,
      progressPercent: 100,
      prerequisite: [{ lessonId: 'lesson-1-uuid', title: 'Meet Your Robot', required: true, minimumScore: null }],
      lockReason: null,
      completedAt: '2026-10-31T01:00:00Z',
    },
    {
      id: 'lesson-3-uuid',
      ordinal: 3,
      title: 'Grab & Release',
      status: 'current' as const,
      progressPercent: 0,
      prerequisite: [{ lessonId: 'lesson-2-uuid', title: 'Move the Robot', required: true, minimumScore: null }],
      lockReason: null,
      completedAt: null,
    },
    {
      id: 'lesson-4-uuid',
      ordinal: 4,
      title: 'Pick & Place',
      status: 'locked' as const,
      progressPercent: 0,
      prerequisite: [{ lessonId: 'lesson-3-uuid', title: 'Grab & Release', required: true, minimumScore: null }],
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED' as const,
        prerequisiteLessonId: 'lesson-3-uuid',
        prerequisiteLessonTitle: 'Grab & Release',
        message: 'Complete Grab & Release to unlock this lesson.',
      },
      completedAt: null,
    },
    {
      id: 'lesson-5-uuid',
      ordinal: 5,
      title: 'Physical Robot Lab',
      status: 'locked' as const,
      progressPercent: 0,
      prerequisite: [{ lessonId: 'lesson-4-uuid', title: 'Pick & Place', required: true, minimumScore: null }],
      lockReason: {
        code: 'PREREQUISITE_NOT_COMPLETED' as const,
        prerequisiteLessonId: 'lesson-4-uuid',
        prerequisiteLessonTitle: 'Pick & Place',
        message: 'Complete Pick & Place to unlock this lesson.',
      },
      completedAt: null,
    },
  ],
};

describe('CourseDetail / Course Path', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  const renderRoute = async (courseId = 'c1-uuid') => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
            <Routes>
              <Route path="/courses/:courseId" element={<CourseDetail />} />
              <Route path="/courses/:courseId/lessons/:lessonId" element={<div data-testid="lesson-viewer">Lesson Viewer</div>} />
              <Route path="/my-learning" element={<div data-testid="my-learning">My Learning</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.sessionState = {
      session: { access_token: 'valid-token', expires_at: 10, user: { id: 'student-1' } },
      loading: false,
      sessionRevision: 1,
    };
    mocks.coursePath.mockReset().mockResolvedValue(coursePathFixture);
    mocks.course.mockReset().mockResolvedValue({
      id: 'c1-uuid',
      title: 'Robotics Fundamentals',
      description: 'Course 1: five-lesson foundation.',
      status: 'published',
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
  });

  it('renders all returned lessons in ordinal order', async () => {
    await renderRoute();

    expect(mocks.coursePath).toHaveBeenCalledWith('c1-uuid', 'valid-token');
    expect(container.textContent).toContain('Robotics Fundamentals');
    expect(container.textContent).toContain('2 / 5 lessons completed');
    expect(container.textContent).toContain('40%');

    const text = container.textContent ?? '';
    const l1Index = text.indexOf('Meet Your Robot');
    const l2Index = text.indexOf('Move the Robot');
    const l3Index = text.indexOf('Grab & Release');
    const l4Index = text.indexOf('Pick & Place');
    const l5Index = text.indexOf('Physical Robot Lab');

    expect(l1Index).toBeGreaterThan(-1);
    expect(l2Index).toBeGreaterThan(l1Index);
    expect(l3Index).toBeGreaterThan(l2Index);
    expect(l4Index).toBeGreaterThan(l3Index);
    expect(l5Index).toBeGreaterThan(l4Index);
  });

  it('completed lesson displays completed state and review button', async () => {
    await renderRoute();

    const lesson1Item = container.querySelectorAll('li')[0];
    expect(lesson1Item.textContent).toContain('Meet Your Robot');
    expect(lesson1Item.textContent).toContain('✓ Completed');
    expect(lesson1Item.textContent).toContain('Review lesson');

    const reviewLink = lesson1Item.querySelector('a');
    expect(reviewLink?.getAttribute('href')).toBe('/courses/c1-uuid/lessons/lesson-1-uuid');
  });

  it('current lesson displays current state and primary start/continue button', async () => {
    await renderRoute();

    const lesson3Item = container.querySelectorAll('li')[2];
    expect(lesson3Item.textContent).toContain('Grab & Release');
    expect(lesson3Item.textContent).toContain('▶ Current');
    expect(lesson3Item.textContent).toContain('Start lesson');

    const startLink = lesson3Item.querySelector('a');
    expect(startLink?.getAttribute('href')).toBe('/courses/c1-uuid/lessons/lesson-3-uuid');
  });

  it('in-progress lesson displays in-progress state', async () => {
    const withInProgress = {
      ...coursePathFixture,
      lessons: coursePathFixture.lessons.map((l) =>
        l.id === 'lesson-3-uuid' ? { ...l, status: 'in_progress' as const } : l
      ),
    };
    mocks.coursePath.mockResolvedValue(withInProgress);
    await renderRoute();

    const lesson3Item = container.querySelectorAll('li')[2];
    expect(lesson3Item.textContent).toContain('Grab & Release');
    expect(lesson3Item.textContent).toContain('• In Progress');
    expect(lesson3Item.textContent).toContain('Continue lesson');
  });

  it('locked lesson displays locked state with server lock reason and disabled button', async () => {
    await renderRoute();

    const lesson4Item = container.querySelectorAll('li')[3];
    expect(lesson4Item.textContent).toContain('Pick & Place');
    expect(lesson4Item.textContent).toContain('🔒 Locked');
    expect(lesson4Item.textContent).toContain('Complete Grab & Release to unlock this lesson.');

    const lockedButton = lesson4Item.querySelector('button');
    expect(lockedButton).toBeDefined();
    expect(lockedButton?.disabled).toBe(true);
    expect(lockedButton?.getAttribute('aria-disabled')).toBe('true');
    expect(lesson4Item.querySelector('a')).toBeNull();
  });

  it('top Continue Learning CTA navigates to currentLessonId', async () => {
    await renderRoute();

    const topContinue = container.querySelector('header a');
    expect(topContinue?.textContent).toContain('Continue Learning');
    expect(topContinue?.getAttribute('href')).toBe('/courses/c1-uuid/lessons/lesson-3-uuid');

    await act(async () => {
      topContinue?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Lesson Viewer');
  });

  it('course-complete state displays completed state and no continue button', async () => {
    const completeFixture = {
      ...coursePathFixture,
      progressPercent: 100,
      currentLessonId: null,
      lessons: coursePathFixture.lessons.map((l) => ({ ...l, status: 'completed' as const, progressPercent: 100 })),
    };
    mocks.coursePath.mockResolvedValue(completeFixture);
    await renderRoute();

    expect(container.textContent).toContain('5 / 5 lessons completed');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('✓ Course Completed');
    expect(container.querySelector('header')?.textContent).not.toContain('Continue Learning');
  });

  it('refresh/re-query preserves identical progression state', async () => {
    await renderRoute();
    expect(container.textContent).toContain('Grab & Release');

    await act(async () => {
      await client.invalidateQueries({ queryKey: ['student-learning'] });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.coursePath).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Grab & Release');
    expect(container.textContent).toContain('2 / 5 lessons completed');
  });

  it('renders error state on API failure and provides retry', async () => {
    mocks.coursePath.mockRejectedValueOnce(new Error('Course path not found')).mockResolvedValueOnce(coursePathFixture);
    await renderRoute();

    expect(container.textContent).toContain('Course path unavailable');
    expect(container.textContent).toContain('Course path not found');

    const retryButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'));
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.coursePath).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Robotics Fundamentals');
  });
});
