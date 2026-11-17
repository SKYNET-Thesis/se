import { Fragment } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface LearningCrumb { label: string; to?: string }

/**
 * Where the student is: My learning › course › lesson (› activity). The last item is the current page. Items wrap
 * instead of truncating, so long course and lesson titles stay readable on phones.
 */
export function LearningBreadcrumb({ items }: { items: LearningCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="min-w-0 break-words">
                {item.to && !last
                  ? <Link to={item.to} className="inline-flex min-h-[32px] items-center rounded hover:text-ink hover:underline hover:underline-offset-4">{item.label}</Link>
                  : <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-ink' : undefined}>{item.label}</span>}
              </li>
              {!last && <li aria-hidden className="flex items-center"><ChevronRightIcon className="h-3.5 w-3.5 text-ink-subtle" /></li>}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
