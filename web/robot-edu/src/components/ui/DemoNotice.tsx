import React from 'react';
import { FlaskConicalIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export function DemoNotice({ children, className }: {children: React.ReactNode;className?: string;}) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-muted', className)}>
      <FlaskConicalIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      <div>{children}</div>
    </div>);

}