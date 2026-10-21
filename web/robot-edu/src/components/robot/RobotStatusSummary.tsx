import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { useRobotStatus } from '../../hooks/useRobotStatus';
import type { ConnectionState } from '../../types/robot';
import { StatusDot, type StatusTone } from '../ui/StatusDot';

export const connectionMeta: Record<ConnectionState, {label: string;tone: StatusTone;}> = {
  connected: { label: 'Available', tone: 'ok' },
  disconnected: { label: 'Disconnected', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'unknown' },
  not_configured: { label: 'Not configured', tone: 'unknown' }
};

export function RobotStatusSummary() {
  const { loading, simulation, hardware, error } = useRobotStatus();
  const rows = [
  { key: 'hw', name: 'Dual-arm robot', detail: 'Physical hardware', status: hardware },
  { key: 'sim', name: 'Schematic simulator', detail: 'Runs in your browser', status: simulation }];

  return (
    <div>
      {error && <p className="mb-2 text-[13px] text-danger">Status check failed: {error}</p>}
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const meta = r.status ? connectionMeta[r.status.connection] : null;
          return (
            <li key={r.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{r.name}</p>
                <p className="text-xs text-ink-subtle">{r.detail}</p>
              </div>
              {loading || !meta ?
              <span className="h-4 w-20 animate-pulse rounded bg-sunken" aria-label="Checking status" /> :

              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                  <StatusDot tone={meta.tone} />
                  {meta.label}
                </span>
              }
            </li>);

        })}
      </ul>
      <Link to="/lab" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover">
        Robot Lab <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>);

}