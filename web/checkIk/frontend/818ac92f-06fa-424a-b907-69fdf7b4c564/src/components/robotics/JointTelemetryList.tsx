import React from 'react';
import { cx, formatJoint } from '../../lib/format';
import type { JointReading } from '../../types';

export function JointTelemetryList({
  joints,
  accent,
  columns = 2




}: {joints: JointReading[];accent: string;columns?: 1 | 2;}) {
  return (
    <dl
      className={cx(
        'grid gap-x-4 gap-y-2',
        columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'
      )}>
      
      {joints.map((j) => {
        const pct =
        j.value === null ? 0 : (j.value - j.min) / (j.max - j.min) * 100;
        const nearLimit = j.value !== null && (pct < 6 || pct > 94);
        return (
          <div key={j.name} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-xs text-ink2 truncate">{j.name}</dt>
              <dd
                className={cx(
                  'font-mono text-sm tabular-nums',
                  j.value === null ? 'text-faint' : nearLimit ? 'text-warn' : 'text-ink'
                )}>
                
                {formatJoint(j.value, j.unit)}
              </dd>
            </div>
            <div className="mt-1 h-1 rounded-full bg-subtle overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${j.value === null ? 0 : Math.max(2, pct)}%`,
                  backgroundColor: j.value === null ? 'transparent' : nearLimit ? '#fbbf24' : accent
                }}
                aria-hidden />
              
            </div>
          </div>);

      })}
    </dl>);

}

export function TelemetryModeToggle({
  mode,
  onChange



}: {mode: 'compact' | 'detailed';onChange: (m: 'compact' | 'detailed') => void;}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5" role="group" aria-label="Telemetry detail">
      {(['compact', 'detailed'] as const).map((m) =>
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        aria-pressed={mode === m}
        className={cx(
          'h-7 rounded-md px-2.5 text-sm capitalize transition-colors duration-150 ease-smooth',
          mode === m ? 'bg-elev text-ink border border-line' : 'text-ink2 hover:text-ink'
        )}>
        
          {m}
        </button>
      )}
    </div>);

}