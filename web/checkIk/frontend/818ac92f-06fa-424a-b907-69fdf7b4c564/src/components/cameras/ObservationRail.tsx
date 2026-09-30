import React, { useMemo, useState } from 'react';
import { ChevronDownIcon, EyeIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CameraDevice } from '../../types';
import { ObservationCameraRow } from './ObservationCameraRow';

const preferredRoles = ['overhead', 'left-wrist', 'right-wrist'] as const;

export function ObservationRail({ cameras, title = 'Observation rail', defaultOpen = true, footer }: { cameras: CameraDevice[];title?: string;defaultOpen?: boolean;footer?: React.ReactNode; }) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = useMemo(() => {
    const preferred = preferredRoles.map((role) => cameras.find((camera) => camera.role === role)).filter(Boolean) as CameraDevice[];
    const remaining = cameras.filter((camera) => !preferred.some((item) => item.id === camera.id));
    return [...preferred, ...remaining].slice(0, 3);
  }, [cameras]);
  const onlineCount = selected.filter((camera) => camera.connection === 'connected').length;

  return (
    <section className="observation-rail" aria-label={title}>
      <div className="observation-rail__header">
        <div className="flex min-w-0 items-center gap-2">
          <span className="observation-rail__icon"><EyeIcon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{onlineCount}/{selected.length} online</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={ChevronDownIcon} onClick={() => setOpen((value) => !value)} aria-label={open ? `Collapse ${title}` : `Expand ${title}`} aria-expanded={open} title={open ? 'Collapse observation panel' : 'Expand observation panel'} className={`observation-rail__toggle ${open ? '' : '[&>svg]:rotate-180'}`} />
      </div>
      {open ? <>
        <div className="observation-rail__list">
          {selected.length ? selected.map((camera) => <ObservationCameraRow key={camera.id} camera={camera} />) : <div className="observation-rail__empty">No cameras configured for this workspace.</div>}
        </div>
        {footer ? <div className="observation-rail__footer">{footer}</div> : null}
      </> : null}
    </section>);
}
