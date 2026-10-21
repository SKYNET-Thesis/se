import React from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline';

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ tone = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium',
        tone === 'neutral' && 'bg-sunken text-ink-muted',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'outline' && 'border border-line-strong text-ink-muted',
        className
      )}>
      
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>);

}