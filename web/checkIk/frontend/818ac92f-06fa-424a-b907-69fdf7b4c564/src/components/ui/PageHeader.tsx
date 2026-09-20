import React from 'react';

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className





}: {title: string;description?: string;actions?: React.ReactNode;meta?: React.ReactNode;className?: string;}) {
  return (
    <header className={`page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-ink text-balance">{title}</h1>
        {description ?
        <p className="mt-1.5 max-w-3xl text-base text-ink2">{description}</p> :
        null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>);

}

export function Section({
  title,
  description,
  actions,
  children,
  id






}: {title: string;description?: string;actions?: React.ReactNode;children: React.ReactNode;id?: string;}) {
  return (
    <section id={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink2">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>);

}
