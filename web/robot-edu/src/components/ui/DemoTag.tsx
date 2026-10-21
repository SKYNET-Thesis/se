import React from 'react';
import { FlaskConicalIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DemoTagProps {
  label?: string;
  title?: string;
  className?: string;
}

/** Marks content that comes from the local demo layer rather than a real backend. */
export function DemoTag({ label = 'Demo data', title = 'Stored only in this browser. Not shared with anyone.', className }: DemoTagProps) {
  return (
    <span
      title={title}
      className={cn('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded border border-dashed border-line-strong px-1.5 text-2xs font-medium text-ink-muted', className)}>
      
      <FlaskConicalIcon className="h-3 w-3" aria-hidden />
      {label}
    </span>);

}