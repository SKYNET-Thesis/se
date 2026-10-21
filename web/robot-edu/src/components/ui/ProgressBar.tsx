import React from 'react';
import { cn } from '../../utils/cn';

interface ProgressBarProps {
  value: number;
  label: string;
  className?: string;
  tone?: 'accent' | 'ink';
}

export function ProgressBar({ value, label, className, tone = 'accent' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', tone === 'accent' ? 'bg-accent' : 'bg-ink')}
        style={{ width: `${pct}%` }} />
      
    </div>);

}