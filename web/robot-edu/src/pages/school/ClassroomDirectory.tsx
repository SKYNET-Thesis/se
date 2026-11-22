import { SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ApiSchoolClassroom } from '../../lib/api';
import { Button } from '../../components/ui/Button';

export function ClassroomDirectory({ classrooms, search, status, page, pageCount, total, onSearch, onStatus, onPage }: {
  classrooms: ApiSchoolClassroom[];
  search: string;
  status: 'all' | 'active' | 'archived';
  page: number;
  pageCount: number;
  total: number;
  onSearch: (value: string) => void;
  onStatus: (value: 'all' | 'active' | 'archived') => void;
  onPage: (value: number) => void;
}) {
  return <>
    <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
      <label className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm"><SearchIcon aria-hidden="true" className="h-4 w-4 text-ink-muted" /><span className="sr-only">Search classrooms</span><input aria-label="Search classrooms" value={search} onChange={event => onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search name, code or offering" /></label>
      <label className="flex items-center gap-2 text-sm text-ink-muted">Status<select aria-label="Classroom status" value={status} onChange={event => onStatus(event.target.value as 'all' | 'active' | 'archived')} className="h-10 rounded-md border border-line-strong bg-surface px-3 text-ink"><option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
    </div>
    {total === 0 ? <p className="mt-6 rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">No classrooms match these filters.</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{classrooms.map(classroom => <article key={classroom.id} className="rounded-lg border border-line bg-surface p-4"><p className="font-semibold text-ink">{classroom.name}</p><p className="mt-1 text-sm text-ink-muted">{classroom.code} · {classroom.status}</p><p className="mt-1 text-xs text-ink-subtle">{classroom.offering_title ?? 'No offering'}</p><Link className="mt-3 inline-block text-sm font-medium text-accent-ink underline" to={`/school/classrooms/${classroom.id}`}>Open classroom</Link></article>)}</div>
      <div className="mt-4 flex items-center justify-end gap-3 text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span className="text-ink-muted">Page {page} of {pageCount}</span><Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button></div>
    </>}
  </>;
}
