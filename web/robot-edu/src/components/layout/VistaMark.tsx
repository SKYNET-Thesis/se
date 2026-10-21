import React from 'react';

export function VistaMark({ compact = false }: {compact?: boolean;}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
        <rect width="26" height="26" rx="6" fill="rgb(var(--ink))" />
        <path d="M7 8.5 L11 15.5 L13 12" stroke="rgb(var(--canvas))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M19 8.5 L15 15.5 L13 12" stroke="rgb(var(--accent-soft))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="13" cy="18.5" r="1.6" fill="rgb(var(--accent-soft))" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-[0.08em] text-ink">VISTA</span>}
    </span>);

}