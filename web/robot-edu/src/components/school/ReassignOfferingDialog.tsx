import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { inputClasses } from '../ui/Field';
import { educationAdminApi, type ApiSchoolClassroom } from '../../lib/api';
import { schoolAdminKeys } from '../../queries/schoolAdminQueries';
import type { SchoolScope } from '../../queries/schoolClassrooms';

/**
 * Course offering reassignment (A03), moved out of SchoolManagement without changing its request, invalidations or copy.
 * The only addition is that the error now shows inside the dialog instead of behind it.
 */
export function ReassignOfferingDialog({ open, scope, classroom, onClose }: { open: boolean; scope: SchoolScope; classroom: ApiSchoolClassroom; onClose: () => void }) {
  const { organizationId, token } = scope;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  const offerings = useQuery({ queryKey: schoolAdminKeys.offerings(organizationId), queryFn: () => educationAdminApi.offerings(organizationId, token), enabled: open && Boolean(organizationId) });
  const reassign = useMutation({
    mutationFn: (offeringId: string) => educationAdminApi.assignClassroomOffering(organizationId, classroom.id, offeringId, token),
    onSuccess: async () => {
      onClose(); toast.success('Course offering reassigned');
      await Promise.all([queryClient.invalidateQueries({ queryKey: schoolAdminKeys.classrooms(organizationId) }), queryClient.invalidateQueries({ queryKey: schoolAdminKeys.members(organizationId, classroom.id) }), queryClient.invalidateQueries({ queryKey: schoolAdminKeys.overview(organizationId) })]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unable to reassign course offering.'),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const offeringId = String(new FormData(event.currentTarget).get('offeringId')); if (offeringId) reassign.mutate(offeringId); };
  const choices = offerings.data?.filter((offering) => offering.status === 'active' && offering.id !== classroom.offering_id) ?? [];

  return (
    <Dialog open={open} onClose={() => { if (!reassign.isPending) onClose(); }} className="vista-school" title="Reassign course offering" description="Only active school offerings for published global courses are shown."
      footer={<><Button variant="secondary" onClick={onClose} disabled={reassign.isPending}>Cancel</Button><Button type="submit" variant="primary" form="reassign-offering" loading={reassign.isPending}>Confirm reassignment</Button></>}>
      <form id="reassign-offering" onSubmit={submit} className="space-y-4">
        <div className="border-l-4 border-warn bg-warn-soft p-3 text-sm text-ink"><p className="font-semibold">This changes access for active students.</p><p className="mt-1">Their enrollment for this classroom is revoked and a new enrollment is activated. Completed lessons and historical submissions are preserved; access through another active classroom remains available.</p></div>
        <div><p className="text-[13px] font-medium text-ink">Current offering</p><p className="mt-1 text-sm text-ink-muted">{classroom.offering_title ?? 'None'}</p></div>
        <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-ink">New published course offering</span>
          <select required name="offeringId" defaultValue="" disabled={offerings.isPending} className={`${inputClasses} h-10`}>
            <option value="" disabled>{offerings.isPending ? 'Loading offerings…' : choices.length ? 'Select an active offering' : 'No other active offering'}</option>
            {choices.map((offering) => <option key={offering.id} value={offering.id}>{offering.title} ({offering.code})</option>)}
          </select>
        </label>
        <p className="text-xs text-ink-muted">Need another course? Create a classroom with its published course first; VISTA creates a school-scoped offering.</p>
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
