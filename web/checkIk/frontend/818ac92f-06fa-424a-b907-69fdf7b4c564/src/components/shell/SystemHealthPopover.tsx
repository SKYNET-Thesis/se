import React, { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ServerIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { cx } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { useDualArmAvailability, useOperationalAlerts } from '../../hooks/useLabDerived';

export function SystemHealthPopover() {
  const { services, capabilities, cameras, devices } = useLab();
  const alerts = useOperationalAlerts();
  const dual = useDualArmAvailability();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const api = services.find((s) => s.id === 'api')!;
  const optionalDown = alerts.filter((a) => a.severity === 'optional').length;
  // This popover describes backend services. Robot buses are intentionally
  // closed while no teleop task is active, so device readiness alerts must not
  // inflate the service-critical counter.
  const criticalDown = services.filter((s) => s.critical && s.status !== 'connected').length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-sm text-ink2 hover:text-ink hover:border-faint/50 transition-colors duration-150 ease-smooth">
        
        <span
          className={cx(
            'h-2 w-2 rounded-full',
            api.status === 'connected' ? 'bg-ok' : 'bg-danger'
          )}
          aria-hidden />
        
        <span className="hidden sm:inline">
          {api.status === 'connected' ? 'Backend connected' : 'Backend offline'}
        </span>
        <span className="font-mono text-ink">{api.latencyMs ? `${api.latencyMs} ms` : '—'}</span>
        <span className="hidden md:inline text-faint">·</span>
        <span className="hidden md:inline">
          {dual.available ? 'Dual-arm ready' : 'Dual-arm blocked'}
        </span>
        {optionalDown ?
        <span className="hidden lg:inline rounded bg-warn/15 px-1.5 text-xs text-warn">
            {optionalDown} optional
          </span> :
        null}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>

      {open ?
      <div
        role="dialog"
        aria-label="System status"
        className="absolute right-0 top-full z-40 mt-2 w-[22rem] rounded-xl border border-line bg-elev p-4 shadow-pop">
        
          <div className="flex items-center gap-2 pb-3 border-b border-line">
            <ServerIcon className="h-4 w-4 text-faint" />
            <p className="text-base font-semibold text-ink">System status</p>
            <span className="ml-auto">
              {criticalDown ?
            <Badge tone="danger">{criticalDown} critical</Badge> :

            <Badge tone="ok">Nominal</Badge>
            }
            </span>
          </div>

          <ul className="py-3 space-y-2.5">
            {services.map((s) =>
          <li key={s.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {s.name}
                    {!s.critical ? <span className="text-faint"> · optional</span> : null}
                  </p>
                  <p className="font-mono text-xs text-faint truncate">{s.address}</p>
                </div>
                <span
              className={cx(
                'font-mono text-xs shrink-0',
                s.status === 'connected' ? 'text-ok' : 'text-danger'
              )}>
              
                  {s.status === 'connected' ?
                    (s.latencyMs == null ? 'online' : `${s.latencyMs} ms`) :
                    (!s.critical ? 'idle / optional' : 'offline')}
                </span>
              </li>
          )}
          </ul>

          <div className="border-t border-line pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-ink2">Devices online</span>
              <span className="font-mono text-ink">
                {devices.filter((d) => d.connection === 'connected').length}/{devices.length}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink2">Cameras streaming</span>
              <span className="font-mono text-ink">
                {cameras.filter((c) => c.connection === 'connected').length}/{cameras.length}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink2">Backend</span>
              <span className="font-mono text-ink">
                {capabilities.backendName} {capabilities.backendVersion}
              </span>
            </div>
            <p className="pt-2 text-xs text-faint">
              Serial devices connect when a teleoperation session starts. VR and training services stay idle until their task is launched.
            </p>
          </div>
        </div> :
      null}
    </div>);

}
