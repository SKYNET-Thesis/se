import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArchiveIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { educationAdminApi, type ApiOffering, type ApiSchoolClassroom } from '../../lib/api';

/** Archive / reactivate a classroom and change its course offering. The backend enforces authorization and enrollment rules. */
export function ClassroomLifecyclePanel({ organizationId, classroom, offerings, token, onChanged }: {
  organizationId: string; classroom: ApiSchoolClassroom; offerings: ApiOffering[]; token: string; onChanged: () => Promise<unknown> | void;
}) {
  const [offeringId, setOfferingId] = useState(classroom.offering_id);
  const [error, setError] = useState<string | null>(null);
  const archived = classroom.status === 'archived' || classroom.status === 'completed';
  const run = useMutation({
    mutationFn: (action: 'archive' | 'reactivate' | 'offering') => action === 'archive'
      ? educationAdminApi.archiveClassroom(organizationId, classroom.id, token)
      : action === 'reactivate'
        ? educationAdminApi.reactivateClassroom(organizationId, classroom.id, token)
        : educationAdminApi.assignClassroomOffering(organizationId, classroom.id, offeringId, token),
    onSuccess: async () => { setError(null); await onChanged(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'The classroom could not be updated.'),
  });
  const archive = () => {
    if (window.confirm(`Archive ${classroom.name}? Students lose access to new learning activity. Progress and results are kept.`)) run.mutate('archive');
  };
  return <section aria-label="Classroom lifecycle" className="mt-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
    <h3 className="text-lg font-semibold text-ink">Classroom lifecycle</h3>
    <p className="mt-1 text-sm text-ink-muted">Course access follows the classroom status and its course offering. Learning history is never deleted.</p>
    {error && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block text-sm font-medium text-ink">Course offering
        <select aria-label="Course offering" disabled={archived || run.isPending} value={offeringId} onChange={(event) => setOfferingId(event.target.value)} className="mt-1.5 block h-10 min-w-64 rounded-md border border-line-strong bg-surface px-3 text-sm">
          {offerings.map((item) => <option key={item.id} value={item.id}>{item.title ?? item.code}</option>)}
        </select>
      </label>
      <Button variant="secondary" disabled={archived || run.isPending || offeringId === classroom.offering_id} onClick={() => run.mutate('offering')}>Change offering</Button>
      {archived
        ? <Button variant="secondary" icon={<RotateCcwIcon className="h-4 w-4" />} loading={run.isPending} onClick={() => run.mutate('reactivate')}>Reactivate classroom</Button>
        : <Button variant="secondary" icon={<ArchiveIcon className="h-4 w-4" />} loading={run.isPending} onClick={archive}>Archive classroom</Button>}
    </div>
  </section>;
}
