import React from 'react';
import { cx } from '../../lib/format';

export function Card({
  className,
  children,
  accent,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {accent?: 'left' | 'right' | 'brand' | 'vr';}) {
  const accentRing =
  accent === 'left' ?
  'border-armleft/30' :
  accent === 'right' ?
  'border-armright/30' :
  accent === 'brand' ?
  'border-brand/40' :
  accent === 'vr' ?
  'border-vr/30' :
  'border-line';
  return (
    <div
      {...rest}
      className={cx(
        'surface-card rounded-[0.875rem] bg-card border shadow-card',
        accentRing,
        className
      )}>
      
      {children}
    </div>);

}

export function CardHeader({
  title,
  description,
  icon: Icon,
  actions,
  accentColor






}: {title: React.ReactNode;description?: React.ReactNode;icon?: React.ComponentType<{className?: string;}>;actions?: React.ReactNode;accentColor?: string;}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3 min-w-0">
        {Icon ?
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle border border-line"
          style={accentColor ? { color: accentColor } : undefined}>
          
            <Icon className="h-4 w-4" />
          </span> :
        null}
        <div className="min-w-0">
          <h2 className="truncate text-md font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description ?
          <p className="text-sm text-ink2 mt-0.5">{description}</p> :
          null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>);

}

export function Mono({
  children,
  className,
  tone = 'default'




}: {children: React.ReactNode;className?: string;tone?: 'default' | 'muted' | 'strong';}) {
  return (
    <span
      className={cx(
        'font-mono text-sm tracking-tight',
        tone === 'muted' ? 'text-faint' : tone === 'strong' ? 'text-ink' : 'text-ink2',
        className
      )}>
      
      {children}
    </span>);

}
