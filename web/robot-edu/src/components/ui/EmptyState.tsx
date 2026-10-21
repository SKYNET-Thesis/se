import React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {icon && <div className="mb-3 text-ink-subtle [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <div className="mt-1 max-w-sm text-sm text-ink-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>);

}