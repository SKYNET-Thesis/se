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
 * Course offering reassignment (A03), moved out of SchoolManagement without changing its request or invalidations; copy uses "course" for school-facing text.
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
      onClose(); toast.success('Course changed');
      await Promise.all([queryClient.invalidateQueries({ queryKey: schoolAdminKeys.classrooms(organizationId) }), queryClient.invalidateQueries({ queryKey: schoolAdminKeys.members(organizationId, classroom.id) }), queryClient.invalidateQueries({ queryKey: schoolAdminKeys.overview(organizationId) })]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'The course couldn’t be changed. Try again.'),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const offeringId = String(new FormData(event.currentTarget).get('offeringId')); if (offeringId) reassign.mutate(offeringId); };
  const choices = offerings.data?.filter((offering) => offering.status === 'active' && offering.id !== classroom.offering_id) ?? [];

  return (
    <Dialog open={open} onClose={() => { if (!reassign.isPending) onClose(); }} className="vista-school" title="Change course" description="Lists VISTA catalog courses your school is currently running."
      footer={<><Button variant="secondary" onClick={onClose} disabled={reassign.isPending}>Cancel</Button><Button type="submit" variant="primary" form="reassign-offering" loading={reassign.isPending}>Change course</Button></>}>
      <form id="reassign-offering" onSubmit={submit} className="space-y-4">
        <div className="border-l-4 border-warn bg-warn-soft p-3 text-sm text-ink"><p className="font-semibold">Active students switch to the new course.</p><p className="mt-1">They lose access to the current course through this classroom and get the new one straight away. Completed lessons and past submissions are kept, and access through their other active classrooms isn’t affected.</p></div>
        <div><p className="text-[13px] font-medium text-ink">Current course</p><p className="mt-1 text-sm text-ink-muted">{classroom.offering_title ?? 'None'}</p></div>
        <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-ink">New course</span>
          <select required name="offeringId" defaultValue="" disabled={offerings.isPending} className={`${inputClasses} h-10`}>
            <option value="" disabled>{offerings.isPending ? 'Loading courses…' : choices.length ? 'Choose a course' : 'No other course is available'}</option>
            {choices.map((offering) => <option key={offering.id} value={offering.id}>{offering.title} ({offering.code})</option>)}
          </select>
        </label>
        <p className="text-xs text-ink-muted">Don’t see the course you need? Create a classroom with it first, and it becomes available here.</p>
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
