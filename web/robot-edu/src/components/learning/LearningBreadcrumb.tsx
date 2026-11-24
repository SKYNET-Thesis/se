import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from 'lucide-react';

export interface LearningCrumb { label: string; to?: string }

/**
 * Where the learner is in the course hierarchy: My learning › course › module › activity. The last item is the current page.
 * Items wrap instead of truncating, so long course and module titles stay readable on a phone, where the course material
 * list is folded away. Concept from the A05 work of ttjendatgit (PRs #153 and #162), rebuilt on the current VISTA tokens.
 */
export function LearningBreadcrumb({ items }: { items: LearningCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="min-w-0 break-words">
                {item.to && !last
                  ? <Link to={item.to} className="inline-flex min-h-8 items-center rounded-sm px-0.5 hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{item.label}</Link>
                  : <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-ink' : undefined}>{item.label}</span>}
              </li>
              {!last && <li aria-hidden className="text-ink-subtle"><ChevronRightIcon className="h-3.5 w-3.5" /></li>}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
