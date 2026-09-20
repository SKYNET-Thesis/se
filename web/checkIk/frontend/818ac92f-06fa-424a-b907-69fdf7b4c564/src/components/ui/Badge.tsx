import React from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleSlashIcon,
  LoaderIcon,
  RadioIcon,
  XCircleIcon } from
'lucide-react';
import { cx } from '../../lib/format';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'live' | 'brand';

const toneClass: Record<Tone, string> = {
  ok: 'text-ok border-ok/35 bg-ok/10',
  warn: 'text-warn border-warn/35 bg-warn/10',
  danger: 'text-danger border-danger/40 bg-danger/10',
  info: 'text-vr border-vr/35 bg-vr/10',
  neutral: 'text-ink2 border-line bg-subtle',
  live: 'text-brand border-brand/40 bg-brand/10',
  brand: 'text-brand border-brand/40 bg-brand/10'
};

const toneIcon: Record<Tone, React.ComponentType<{className?: string;}>> = {
  ok: CheckCircle2Icon,
  warn: AlertTriangleIcon,
  danger: XCircleIcon,
  info: RadioIcon,
  neutral: CircleDashedIcon,
  live: LoaderIcon,
  brand: CircleSlashIcon
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
  withIcon = true






}: {tone?: Tone;children: React.ReactNode;icon?: React.ComponentType<{className?: string;}>;className?: string;withIcon?: boolean;}) {
  const Icon = icon ?? toneIcon[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        toneClass[tone],
        className
      )}>
      
      {withIcon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
      {children}
    </span>);

}

export function SideBadge({ side }: {side: 'left' | 'right';}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{
        color: side === 'left' ? '#35c9d0' : '#a78bfa',
        borderColor: side === 'left' ? 'rgba(53,201,208,0.4)' : 'rgba(167,139,250,0.4)',
        backgroundColor: side === 'left' ? 'rgba(53,201,208,0.1)' : 'rgba(167,139,250,0.1)'
      }}>
      
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: side === 'left' ? '#35c9d0' : '#a78bfa' }}
        aria-hidden />
      
      {side === 'left' ? 'Left Arm' : 'Right Arm'}
    </span>);

}

export function SimulatedBadge({ className }: {className?: string;}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border border-dashed border-faint/50 bg-subtle px-2 py-0.5 text-xs font-medium text-faint',
        className
      )}>
      
      Simulated data
    </span>);

}