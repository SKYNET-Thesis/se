import React from 'react';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  hint







}: {icon: React.ComponentType<{className?: string;}>;title: string;description: string;actionLabel?: string;onAction?: () => void;hint?: string;}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-subtle text-ink2">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-md font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-base text-ink2">{description}</p>
      {hint ? <p className="mt-2 max-w-md text-sm text-faint">{hint}</p> : null}
      {actionLabel && onAction ?
      <Button variant="primary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button> :
      null}
    </div>);

}

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon






}: {title: string;description: string;actionLabel?: string;onAction?: () => void;icon: React.ComponentType<{className?: string;}>;}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/40 bg-danger/10 text-danger">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-md font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-base text-ink2">{description}</p>
      {actionLabel && onAction ?
      <Button variant="secondary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button> :
      null}
    </div>);

}