import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CircleIcon,
  DotIcon,
  PlayIcon } from
'lucide-react';
import { cx } from '../../lib/format';
import type { WorkflowStep, WorkflowStepState } from '../../types';

const stateMeta: Record<
  WorkflowStepState,
  {label: string;icon: React.ComponentType<{className?: string;}>;className: string;}> =
{
  complete: { label: 'Complete', icon: CheckIcon, className: 'text-ok border-ok/40 bg-ok/10' },
  ready: { label: 'Ready', icon: CircleIcon, className: 'text-ink border-line bg-subtle' },
  active: { label: 'Active', icon: PlayIcon, className: 'text-brand border-brand/45 bg-brand/10' },
  blocked: { label: 'Blocked', icon: BanIcon, className: 'text-danger border-danger/40 bg-danger/10' },
  attention: {
    label: 'Attention required',
    icon: AlertTriangleIcon,
    className: 'text-warn border-warn/40 bg-warn/10'
  },
  'not-started': { label: 'Not started', icon: DotIcon, className: 'text-faint border-line bg-subtle' }
};

export function WorkflowProgress({ steps }: {steps: WorkflowStep[];}) {
  return (
    <nav aria-label="Robotics workflow" className="surface-card rounded-xl border bg-card p-2">
      <ol className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5">
        {steps.map((step, i) => {
          const meta = stateMeta[step.state];
          return (
            <li key={step.id} className="min-w-0">
              <Link
                to={step.to}
                className="group flex h-full flex-col gap-1.5 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-150 ease-smooth hover:border-line hover:bg-subtle">
                
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      meta.className
                    )}>
                    
                    <meta.icon className="h-3 w-3" />
                  </span>
                  <span className="truncate text-base font-medium text-ink">{step.label}</span>
                  <span className="ml-auto hidden xl:block text-xs text-faint">{i + 1}</span>
                </span>
                <span className="text-xs text-faint truncate" title={step.detail}>
                  <span className="sr-only">{meta.label}. </span>
                  {step.detail}
                </span>
              </Link>
            </li>);

        })}
      </ol>
    </nav>);

}
