import React from 'react';
import { EmergencyStopButton } from '../shell/EmergencyStopButton';

export function CommandDock({
  status,
  children
}: {status: React.ReactNode;children: React.ReactNode;}) {
  return (
    <section className="command-dock" aria-label="Robot command dock">
      <div className="command-dock__status">{status}</div>
      <div className="command-dock__actions">{children}</div>
      <div className="command-dock__safety">
        <EmergencyStopButton />
      </div>
    </section>);
}
