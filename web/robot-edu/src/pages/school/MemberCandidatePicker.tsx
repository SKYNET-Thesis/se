import type { ApiMemberCandidate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { cn } from '../../utils/cn';
import { candidatePageCount } from './memberCandidateState';

interface Props {
  candidates: ApiMemberCandidate[];
  total: number;
  page: number;
  pageSize: number;
  selectedUserId: string;
  loading: boolean;
  /** The applied search term, used to explain an empty result. */
  search?: string;
  onSelect: (userId: string) => void;
  onPage: (page: number) => void;
}

const roleOf = (candidate: ApiMemberCandidate) => (candidate.organizationRole === 'instructor' ? 'Teacher' : 'Student');
const accountNote = (state: ApiMemberCandidate['accountState']) => (state === 'account_setup_pending' ? 'Setup pending' : state === 'invited' ? 'Invited' : null);

/**
 * Eligible people for a classroom (A02). The API already excludes current members and anyone without an active student
 * or instructor membership, so every row here can be added; the classroom role follows the school role.
 */
export function MemberCandidatePicker({ candidates, total, page, pageSize, selectedUserId, loading, search = '', onSelect, onPage }: Props) {
  const pages = candidatePageCount(total, pageSize);
  const selected = candidates.find(candidate => candidate.userId === selectedUserId);

  return <div>
    <div className="flex items-baseline justify-between gap-3">
      <p id="candidate-list-label" className="text-[13px] font-medium text-ink">People who can join</p>
      {!loading && total > 0 && <p aria-live="polite" className="text-xs tabular-nums text-ink-muted">{total} {total === 1 ? 'person' : 'people'}</p>}
    </div>
    {loading ? <div role="status" className="mt-2 rounded-md border border-line px-4 py-8 text-center text-sm text-ink-muted">Searching…</div>
      : candidates.length === 0 ? <div className="mt-2 rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
        {search.trim() ? <>No one matches “{search.trim()}”. Try a name, email or school code.</> : <>Everyone in your school is already in this classroom.</>}
      </div>
        : <fieldset aria-labelledby="candidate-list-label" className="mt-2 max-h-[min(22rem,45vh)] divide-y divide-line overflow-y-auto rounded-md border border-line">
          <legend className="sr-only">Choose a person to add</legend>
          {candidates.map(candidate => {
            const isSelected = selectedUserId === candidate.userId; const note = accountNote(candidate.accountState);
            return <label key={candidate.userId} className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-150 focus-within:bg-sunken', isSelected ? 'bg-accent-soft' : 'bg-surface hover:bg-sunken')}>
              <input type="radio" name="classroom-member" value={candidate.userId} checked={isSelected} onChange={() => onSelect(candidate.userId)} className="h-4 w-4 shrink-0 accent-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{candidate.displayName}</span>
                <span className="block truncate text-xs tabular-nums text-ink-muted">{candidate.schoolCode ?? 'No school code'}</span>
              </span>
              {note && <Badge tone="warn" className="shrink-0">{note}</Badge>}
              <Badge tone={candidate.organizationRole === 'instructor' ? 'accent' : 'neutral'} className="shrink-0">{roleOf(candidate)}</Badge>
            </label>;
          })}
        </fieldset>}
    {pages > 1 && <div className="mt-3 flex items-center justify-end gap-3 text-sm">
      <Button data-page="previous" type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="tabular-nums text-ink-muted">Page {page} of {pages}</span>
      <Button data-page="next" type="button" size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>}
    {selected && <p aria-live="polite" className="mt-3 text-sm text-ink-muted">
      <span className="font-medium text-ink">{selected.displayName}</span> joins as a <span className="font-medium text-ink">{roleOf(selected).toLowerCase()}</span>.
      {selected.accountState !== 'active' && ' They can be added now and finish account setup later.'}
    </p>}
  </div>;
}
