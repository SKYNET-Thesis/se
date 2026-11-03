// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ActivityCard } from './ActivityCard';
import { activityCompletionState } from './activityCompletionState';
import type { LessonActivity } from './lessonActivities';

const activity: LessonActivity = {
  id: 'lesson-1-reading-1', type: 'reading', title: 'Understanding Meet Your Robot',
  description: 'Read the introduction.', durationMinutes: 4, status: 'neutral',
  actionable: true, authoritative: false, action: 'reading',
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderCard(props: Partial<React.ComponentProps<typeof ActivityCard>> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ActivityCard activity={activity} href="/reading" {...props} /></MemoryRouter>));
  return { container, unmount: () => act(() => root.unmount()) };
}

describe('activity completion', () => {
  it('does not infer activity completion from a completed lesson or visiting the reading', () => {
    expect(activityCompletionState(activity.id, { lessonStatus: 'completed' })).toBe('incomplete');
    expect(activityCompletionState(activity.id, { visitedActivityIds: [activity.id] })).toBe('incomplete');
  });

  it('requires matching server-confirmed activity evidence for a green tick', () => {
    expect(activityCompletionState(activity.id, { completedActivityIds: ['another-activity'] })).toBe('incomplete');
    expect(activityCompletionState(activity.id, { completedActivityIds: [activity.id] })).toBe('completed');
  });

  it('keeps the active reading incomplete and gives its marker an accessible name', async () => {
    const view = await renderCard({ active: true });
    expect(view.container.querySelector('[aria-current="page"]')).not.toBeNull();
    expect(view.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Understanding Meet Your Robot: not completed');
    expect(view.container.querySelector('[data-completion="incomplete"]')).not.toBeNull();
    view.unmount();
  });

  it('does not turn a legacy presentation status into server-confirmed completion', async () => {
    const view = await renderCard({ activity: { ...activity, status: 'completed' as LessonActivity['status'] } });
    expect(view.container.querySelector('[data-completion="incomplete"]')).not.toBeNull();
    expect(view.container.querySelector('[data-completion="completed"]')).toBeNull();
    view.unmount();
  });

  it('shows confirmed completion and blocks navigation for locked activities', async () => {
    const completed = await renderCard({ completion: 'completed' });
    expect(completed.container.querySelector('[data-completion="completed"]')).not.toBeNull();
    expect(completed.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Understanding Meet Your Robot: completed');
    completed.unmount();

    const locked = await renderCard({ completion: 'locked' });
    expect(locked.container.querySelector('a')).toBeNull();
    expect(locked.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Understanding Meet Your Robot: locked');
    locked.unmount();
  });
});
