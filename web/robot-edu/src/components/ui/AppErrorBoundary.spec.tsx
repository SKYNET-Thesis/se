// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutedErrorBoundary } from './AppErrorBoundary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const Broken = () => { throw new Error('secret internal detail: db password=hunter2'); };

describe('AppErrorBoundary', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('replaces a crashed page with a recoverable message that leaks no error details, and recovers on navigation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/broken']}><Link to="/fine">go</Link><RoutedErrorBoundary><Routes><Route path="/broken" element={<Broken />} /><Route path="/fine" element={<p>healthy page</p>} /></Routes></RoutedErrorBoundary></MemoryRouter>);
    });
    const alert = container.querySelector('[data-testid="app-error-boundary"]');
    expect(alert?.textContent).toContain('Something went wrong');
    expect(alert?.textContent).not.toContain('hunter2');
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    await act(async () => { (container.querySelector('a[href="/fine"]') as HTMLAnchorElement).click(); });
    expect(container.textContent).toContain('healthy page');
    expect(container.querySelector('[data-testid="app-error-boundary"]')).toBeNull();
    await act(async () => { root.unmount(); }); container.remove();
  });
});
