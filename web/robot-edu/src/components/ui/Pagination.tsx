import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { PAGE_SIZES, pageWindow } from '../../queries/teacherAssignmentsModel';
import { cn } from '../../utils/cn';

interface PaginationProps { page: number; pageCount: number; total: number; from: number; to: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void; noun?: string }

export function Pagination({ page, pageCount, total, from, to, pageSize, onPage, onPageSize, noun = 'assignments' }: PaginationProps) {
  const btn = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm text-ink-muted hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">Show
          <select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>per page
        </label>
        <span aria-live="polite">{total ? `${from}–${to} of ${total} ${noun}` : `0 ${noun}`}</span>
      </div>
      <ul className="flex items-center gap-1">
        <li><button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeftIcon className="h-4 w-4" aria-hidden /></button></li>
        {pageWindow(page, pageCount).map((entry, index) => <li key={`${entry}-${index}`}>{entry === '…' ? <span className="px-2" aria-hidden>…</span> :
          <button type="button" onClick={() => onPage(entry)} aria-label={`Page ${entry}`} aria-current={entry === page ? 'page' : undefined} className={cn(btn, entry === page && 'border border-line-strong bg-surface font-semibold text-ink')}>{entry}</button>}</li>)}
        <li><button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRightIcon className="h-4 w-4" aria-hidden /></button></li>
      </ul>
    </nav>
  );
}
