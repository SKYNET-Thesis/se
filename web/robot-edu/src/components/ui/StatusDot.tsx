import React from 'react';
import { cn } from '../../utils/cn';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'unknown' | 'active';

export function StatusDot({ tone, className }: {tone: StatusTone;className?: string;}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone === 'ok' && 'bg-ok',
        tone === 'warn' && 'bg-warn',
        tone === 'danger' && 'bg-danger',
        tone === 'unknown' && 'border border-ink-subtle bg-transparent',
        tone === 'active' && 'bg-accent',
        className
      )} />);


}