import React from 'react';

export class StudioViewerBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' };
  static getDerivedStateFromError(error: Error) { return { failed: true, message: error.message }; }
  componentDidCatch(error: Error) { console.error('SO-101 viewer failed to load:', error); }
  render() { return this.state.failed ? <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-muted">3D robot preview could not load.<br /><span className="mt-2 block text-xs">{this.state.message}</span></div> : this.props.children; }
}
