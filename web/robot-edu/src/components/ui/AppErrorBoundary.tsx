import React from 'react';
import { useLocation } from 'react-router-dom';

interface Props { children: React.ReactNode; resetKey?: string }
interface State { failed: boolean }

/**
 * Last line of defence: a render error in any page shows a recoverable message instead of a blank screen.
 * It never shows the error text or stack to the user (it may contain internal details); the error goes to the console only.
 * Navigating to another route resets it, so one broken page does not take the whole application down.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('VISTA page failed to render:', error, info.componentStack); }
  componentDidUpdate(previous: Props) { if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" data-testid="app-error-boundary" className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-6 py-16 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">This page could not be displayed. Your work on other pages is not affected. Try again, or return to the start page.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">Reload page</button>
            <a href="/" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken">Go to the start page</a>
          </div>
        </div>
      </main>
    );
  }
}

/** Resets automatically when the route changes. */
export function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <AppErrorBoundary resetKey={location.pathname}>{children}</AppErrorBoundary>;
}
