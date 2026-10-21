import React from 'react';
import { cn } from '../../utils/cn';

interface SectionHeadingProps {
  title: string;
  id?: string;
  action?: React.ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}

export function SectionHeading({ title, id, action, className, as: Tag = 'h2' }: SectionHeadingProps) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <Tag id={id} className="text-[15px] font-semibold text-ink">
        {title}
      </Tag>
      {action && <div className="text-[13px]">{action}</div>}
    </div>);

}