import React, { useState } from 'react';
import { Grid2x2Icon, SquareIcon } from 'lucide-react';
import { CameraFeedCard } from './CameraFeedCard';
import { cx } from '../../lib/format';
import type { CameraDevice } from '../../types';

export function CameraLayoutToggle({
  layout,
  onChange



}: {layout: 'grid' | 'focus';onChange: (l: 'grid' | 'focus') => void;}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5" role="group" aria-label="Camera layout">
      {([
      ['grid', Grid2x2Icon, 'Grid view'],
      ['focus', SquareIcon, 'Focus view']] as
      const).map(([key, Icon, label]) =>
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={layout === key}
        className={cx(
          'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors duration-150 ease-smooth',
          layout === key ? 'bg-elev text-ink border border-line' : 'text-ink2 hover:text-ink'
        )}>
        
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      )}
    </div>);

}

export function CameraGrid({ cameras }: {cameras: CameraDevice[];}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cameras.map((c) =>
      <CameraFeedCard key={c.id} camera={c} />
      )}
    </div>);

}

export function CameraFocusView({ cameras }: {cameras: CameraDevice[];}) {
  const [primaryId, setPrimaryId] = useState(cameras[0]?.id);
  const primary = cameras.find((c) => c.id === primaryId) ?? cameras[0];
  const others = cameras.filter((c) => c.id !== primary.id);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
      <CameraFeedCard camera={primary} large />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {others.map((c) =>
        <CameraFeedCard key={c.id} camera={c} onFocus={() => setPrimaryId(c.id)} />
        )}
      </div>
    </div>);

}