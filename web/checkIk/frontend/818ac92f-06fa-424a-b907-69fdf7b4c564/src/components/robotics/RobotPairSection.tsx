import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, SettingsIcon } from 'lucide-react';
import { Badge, SideBadge } from '../ui/Badge';
import { RobotDeviceCard } from './RobotDeviceCard';
import type { PairReadiness } from '../../lib/readiness';
import type { PairState } from '../../types';

const stateBadge: Record<PairState, {tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'brand';label: string;}> = {
  ready: { tone: 'ok', label: 'Ready' },
  active: { tone: 'brand', label: 'Active' },
  offline: { tone: 'danger', label: 'Offline' },
  'link-incomplete': { tone: 'danger', label: 'Link incomplete' },
  'needs-calibration': { tone: 'warn', label: 'Needs calibration' },
  'configuration-incomplete': { tone: 'warn', label: 'Configuration incomplete' }
};

export function RobotPairSection({
  pair,
  detailed



}: {pair: PairReadiness;detailed: boolean;}) {
  const meta = stateBadge[pair.state];
  const accent = pair.side === 'left' ? '#35c9d0' : '#a78bfa';

  return (
    <section aria-label={`${pair.side} arm pair`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-ink">
          {pair.side === 'left' ? 'Left Pair' : 'Right Pair'}
        </h3>
        <SideBadge side={pair.side} />
        <span className="inline-flex items-center gap-1.5 text-sm text-ink2">
          <span className="font-mono text-xs">Leader</span>
          <ArrowRightIcon className="h-3.5 w-3.5" style={{ color: accent }} />
          <span className="font-mono text-xs">Follower</span>
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <Link
          to="/workspace"
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-ink transition-colors duration-150 ease-smooth">
          
          <SettingsIcon className="h-3.5 w-3.5" />
          Configure pair
        </Link>
      </div>

      {pair.reason ?
      <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-ink2">
          {pair.reason}
        </p> :
      null}

      <div className="grid gap-3 md:grid-cols-2">
        <RobotDeviceCard device={pair.leader} detailed={detailed} />
        <RobotDeviceCard device={pair.follower} detailed={detailed} />
      </div>
    </section>);

}