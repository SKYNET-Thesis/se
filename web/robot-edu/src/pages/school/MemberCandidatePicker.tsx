import React from 'react';
import type { ApiMemberCandidate } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { candidatePageCount } from './memberCandidateState';

interface Props {
  candidates: ApiMemberCandidate[];
  total: number;
  page: number;
  pageSize: number;
  selectedUserId: string;
  loading: boolean;
  onSelect: (userId: string) => void;
  onPage: (page: number) => void;
}
export function MemberCandidatePicker({ candidates, total, page, pageSize, selectedUserId, loading, onSelect, onPage }: Props) {
  const pages = candidatePageCount(total, pageSize);
  const selected = candidates.find(candidate => candidate.userId === selectedUserId);

  return <div>
    <p className="text-sm font-medium text-ink">Eligible members</p>
    {loading ? <div className="mt-2 rounded-md border border-line px-4 py-8 text-center text-sm text-ink-muted">Searching eligible members…</div>
      : candidates.length === 0 ? <div className="mt-2 rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">No eligible members found.</div>
        : <fieldset className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line">
          <legend className="sr-only">Select an eligible member</legend>
          {candidates.map(candidate => <label key={candidate.userId} className={selectedUserId === candidate.userId ? 'flex cursor-pointer gap-3 bg-accent-soft px-4 py-3' : 'flex cursor-pointer gap-3 bg-surface px-4 py-3 hover:bg-sunken'}>
            <input type="radio" name="classroom-member" value={candidate.userId} checked={selectedUserId === candidate.userId} onChange={() => onSelect(candidate.userId)} className="mt-1 h-4 w-4 accent-[#176255]" />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{candidate.displayName}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{candidate.schoolCode ?? 'No school code'} · {candidate.organizationRole === 'instructor' ? 'Teacher' : 'Student'}</span>
            </span>
          </label>)}
        </fieldset>}
    {pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <Button data-page="previous" type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-ink-muted">Page {page} of {pages}</span>
      <Button data-page="next" type="button" size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>}
    {selected && <div className="mt-4 rounded-md bg-sunken px-3 py-3 text-sm"><span className="text-ink-muted">Classroom role</span><p className="mt-1 font-medium text-ink">{selected.organizationRole === 'student' ? 'Student' : 'Teacher'}</p></div>}
  </div>;
}
