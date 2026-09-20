import React from 'react';
import {
  BoxesIcon,
  CpuIcon,
  DatabaseIcon,
  GlassesIcon,
  PlugIcon,
  TargetIcon,
  VideoIcon } from
'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Card, CardHeader } from '../ui/Card';
import { cx } from '../../lib/format';
import type { ActivityEvent } from '../../types';

const kindIcon: Record<ActivityEvent['kind'], React.ComponentType<{className?: string;}>> = {
  device: PlugIcon,
  calibration: TargetIcon,
  recording: VideoIcon,
  dataset: DatabaseIcon,
  training: CpuIcon,
  vr: GlassesIcon,
  model: BoxesIcon
};

const severityColor: Record<ActivityEvent['severity'], string> = {
  info: 'text-ink2 border-line bg-subtle',
  success: 'text-ok border-ok/35 bg-ok/10',
  warning: 'text-warn border-warn/35 bg-warn/10',
  danger: 'text-danger border-danger/40 bg-danger/10'
};

export function RecentActivityFeed({ limit = 7 }: {limit?: number;}) {
  const { activity } = useLab();
  return (
    <Card>
      <CardHeader title="Recent activity" description="Operational events reported by the backend" />
      <ol className="divide-y divide-line/70 px-5">
        {activity.slice(0, limit).map((e) => {
          const Icon = kindIcon[e.kind];
          return (
            <li key={e.id} className="flex items-start gap-3 py-3">
              <span
                className={cx(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                  severityColor[e.severity]
                )}>
                
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="min-w-0 flex-1 text-base text-ink2">{e.message}</p>
              <span className="shrink-0 font-mono text-xs text-faint">{e.at}</span>
            </li>);

        })}
      </ol>
    </Card>);

}