import React from 'react';
import { InfoIcon, ShieldAlertIcon } from 'lucide-react';
import type { LessonSection } from '../../types/learning';
import { cn } from '../../utils/cn';

export function LessonSectionView({ section }: {section: LessonSection;}) {
  switch (section.kind) {
    case 'text':
      return (
        <section>
          {section.heading && <h2 className="mb-2 text-lg font-semibold text-ink">{section.heading}</h2>}
          <p className="text-[16px] leading-[1.75] text-ink/90">{section.body}</p>
        </section>);

    case 'callout':{
        const safety = section.tone === 'safety';
        const Icon = safety ? ShieldAlertIcon : InfoIcon;
        return (
          <aside className={cn('flex gap-3 rounded-lg px-4 py-3.5', safety ? 'bg-warn-soft' : 'bg-accent-soft/70')}>
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', safety ? 'text-warn' : 'text-accent')} aria-hidden />
          <div>
            <p className={cn('text-sm font-semibold', safety ? 'text-warn' : 'text-accent-ink')}>{section.title}</p>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink/85">{section.body}</p>
          </div>
        </aside>);

      }
    case 'steps':
      return (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">{section.heading}</h2>
          <ol className="space-y-2.5">
            {section.items.map((item, i) =>
            <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
                <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink-muted">{i + 1}</span>
                <span>{item}</span>
              </li>
            )}
          </ol>
        </section>);

    case 'terms':
      return (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">{section.heading}</h2>
          <dl className="divide-y divide-line border-y border-line">
            {section.items.map((t) =>
            <div key={t.term} className="grid gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-ink">{t.term}</dt>
                <dd className="text-[15px] text-ink-muted">{t.definition}</dd>
              </div>
            )}
          </dl>
        </section>);

    default:
      return null;
  }
}