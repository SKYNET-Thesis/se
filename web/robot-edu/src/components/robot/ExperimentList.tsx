import React from 'react';
import { Link } from 'react-router-dom';
import { FlaskConicalIcon } from 'lucide-react';
import type { ExperimentRecord, ExecutionOutcome } from '../../types/robot';
import { Badge, type BadgeTone } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { formatDuration, formatRelative } from '../../utils/format';

const OUTCOME: Record<ExecutionOutcome, {label: string;tone: BadgeTone;}> = {
  completed: { label: 'Completed', tone: 'ok' },
  stopped: { label: 'Stopped', tone: 'warn' },
  failed: { label: 'Failed', tone: 'danger' }
};

interface ExperimentListProps {
  experiments: ExperimentRecord[];
  limit?: number;
  detailed?: boolean;
}

export function ExperimentList({ experiments, limit, detailed = false }: ExperimentListProps) {
  const items = limit ? experiments.slice(0, limit) : experiments;
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={<FlaskConicalIcon />}
        title="No runs recorded yet"
        description="Each simulation you run in the Studio is logged here, in this browser." />);


  }
  if (!detailed) {
    return (
      <ul className="divide-y divide-line border-y border-line">
        {items.map((e) =>
        <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link to={`/studio/${e.programId}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                {e.programName}
              </Link>
              <p className="text-xs text-ink-subtle">
                Simulation · {e.steps} steps · {formatRelative(e.startedAt)}
              </p>
            </div>
            <Badge tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Badge>
          </li>
        )}
      </ul>);

  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-subtle">
            <th className="py-2 pr-4 font-medium">Program</th>
            <th className="py-2 pr-4 font-medium">Target</th>
            <th className="py-2 pr-4 font-medium">Outcome</th>
            <th className="py-2 pr-4 text-right font-medium">Steps</th>
            <th className="py-2 pr-4 text-right font-medium">Duration</th>
            <th className="py-2 text-right font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((e) =>
          <tr key={e.id}>
              <td className="py-2.5 pr-4">
                <Link to={`/studio/${e.programId}`} className="font-medium text-ink hover:text-accent">
                  {e.programName}
                </Link>
                {e.note && <p className="max-w-xs truncate text-xs text-danger">{e.note}</p>}
              </td>
              <td className="py-2.5 pr-4 text-ink-muted">Simulator</td>
              <td className="py-2.5 pr-4">
                <Badge tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Badge>
              </td>
              <td className="tabular py-2.5 pr-4 text-right text-ink-muted">{e.steps}</td>
              <td className="tabular py-2.5 pr-4 text-right text-ink-muted">{formatDuration(e.durationMs)}</td>
              <td className="py-2.5 text-right text-ink-muted">{formatRelative(e.startedAt)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}