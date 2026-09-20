import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';
import type { OperationalAlert } from '../../types';

export function OperationalAlertBanner({ alerts }: {alerts: OperationalAlert[];}) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-2" role="region" aria-label="Critical operational alerts">
      {alerts.map((a) =>
      <div
        key={a.id}
        className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/[0.07] p-4 sm:flex-row sm:items-center">
        
          <AlertTriangleIcon className="h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">{a.title}</p>
            <p className="mt-0.5 text-sm text-ink2">{a.detail}</p>
          </div>
          <Link
          to={a.actionTo}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-danger/50 bg-danger/15 px-3 text-sm font-medium text-danger transition-colors duration-150 ease-smooth hover:bg-danger/25">
          
            {a.actionLabel}
          </Link>
        </div>
      )}
    </div>);

}

export function IntegrationAlertNotice({ alerts }: {alerts: OperationalAlert[];}) {
  if (!alerts.length) return null;
  return (
    <div
      className="rounded-xl border border-line bg-card p-4"
      role="region"
      aria-label="Optional integration notices">
      
      <div className="flex items-center gap-2">
        <InfoIcon className="h-4 w-4 text-faint" />
        <p className="text-sm font-medium text-ink2">
          {alerts.length} optional integration{alerts.length > 1 ? 's are' : ' is'} unavailable — local
          teleoperation, recording and local training are unaffected.
        </p>
      </div>
      <ul className="mt-3 divide-y divide-line/70 border-t border-line/70">
        {alerts.map((a) =>
        <li key={a.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-base text-ink">{a.title}</p>
              <p className="text-sm text-faint">{a.detail}</p>
            </div>
            <Link
            to={a.actionTo}
            className="shrink-0 text-sm font-medium text-brand hover:text-brand-hover">
            
              {a.actionLabel} →
            </Link>
          </li>
        )}
      </ul>
    </div>);

}