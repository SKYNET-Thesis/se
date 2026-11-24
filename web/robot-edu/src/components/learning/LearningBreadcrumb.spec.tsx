// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LearningBreadcrumb } from './LearningBreadcrumb';

describe('LearningBreadcrumb', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('links every ancestor, marks the last item as the current page and never links it', async () => {
    await act(async () => { root.render(<MemoryRouter><LearningBreadcrumb items={[{ label: 'My learning', to: '/my-learning' }, { label: 'Course', to: '/courses/c' }, { label: 'A very long module title that has to wrap on a phone instead of being cut off' }]} /></MemoryRouter>); });
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')!;
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/my-learning', '/courses/c']);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain('A very long module title');
    expect(nav.querySelector('[aria-current="page"]')?.closest('a')).toBeNull();
    expect(nav.querySelector('li')?.className).toContain('break-words');
  });
});
