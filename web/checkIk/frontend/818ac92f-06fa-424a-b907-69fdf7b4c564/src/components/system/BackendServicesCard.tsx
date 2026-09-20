import React from 'react';
import { Link } from 'react-router-dom';
import { ServerIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { cx } from '../../lib/format';

export function BackendServicesCard() {
  const { services, capabilities } = useLab();
  const critical = services.filter((s) => s.critical);
  const optional = services.filter((s) => !s.critical);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Backend services"
        description={`${capabilities.backendName} ${capabilities.backendVersion}`}
        icon={ServerIcon}
        actions={
        <Badge tone={critical.every((s) => s.status === 'connected') ? 'ok' : 'danger'}>
            {critical.every((s) => s.status === 'connected') ? 'Critical services up' : 'Critical service down'}
          </Badge>
        } />
      
      <div className="p-5 space-y-4">
        <Group title="Critical" services={critical} />
        <Group title="Optional / contextual" services={optional} />
      </div>
      <div className="mt-auto border-t border-line px-5 py-3">
        <Link to="/settings" className="text-sm text-brand hover:text-brand-hover">
          Backend settings →
        </Link>
      </div>
    </Card>);

}

function Group({
  title,
  services



}: {title: string;services: ReturnType<typeof useLab>['services'];}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">{title}</p>
      <ul className="mt-2 divide-y divide-line/70">
        {services.map((s) =>
        <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-base text-ink">{s.name}</p>
              <p className="font-mono text-xs text-faint truncate">{s.address}</p>
            </div>
            <div className="shrink-0 text-right">
              <p
              className={cx(
                'text-sm font-medium',
                s.status === 'connected' ? 'text-ok' : 'text-danger'
              )}>
              
                {s.status === 'connected' ? 'Connected' : 'Unavailable'}
                {s.latencyMs !== null ?
              <span className="font-mono text-ink2"> · {s.latencyMs} ms</span> :
              null}
              </p>
              <p className="text-xs text-faint">Checked {s.lastCheck}</p>
            </div>
          </li>
        )}
      </ul>
    </div>);

}