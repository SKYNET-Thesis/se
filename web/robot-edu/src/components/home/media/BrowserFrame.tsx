import type { ReactNode } from 'react';
import { cn } from '../../../utils/cn';

interface BrowserFrameProps {
  /** Name of the real VISTA screen shown, e.g. "Practice". */
  title: string;
  children: ReactNode;
  className?: string;
}

/** Minimal window chrome for real product screenshots. Never wrap invented interfaces in it. */
export function BrowserFrame({ title, children, className }: BrowserFrameProps) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-[16px] bg-[var(--vh-surface)] ring-1 ring-inset ring-[var(--vh-line)]', className)}>
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--vh-line)] px-4 text-[13px] font-medium text-[var(--vh-muted)]">{title}</div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
