import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { inputClasses } from '../ui/Field';
import { educationAdminApi, type ApiSchoolClassroom } from '../../lib/api';
import { currentOffering, isRefusedOfferingError, isStaleLifecycleError, lifecycleErrorMessage, selectableOfferings } from '../../queries/classroomLifecycleModel';
import { schoolAdminKeys } from '../../queries/schoolAdminQueries';
import type { SchoolScope } from '../../queries/schoolClassrooms';

/**
 * Change a classroom's course offering (A03). Same request and refreshes as before; the server decides eligibility.
 * GET …/offerings lists every offering of the school without saying whether its course is a published VISTA catalog
 * course, so the list can include one the server will refuse; that refusal is explained instead of hidden.
 */
export function ReassignOfferingDialog({ open, scope, classroom, onClose }: { open: boolean; scope: SchoolScope; classroom: ApiSchoolClassroom; onClose: () => void }) {
  const { organizationId, token } = scope;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState('');
  // Offerings the server refused while this dialog is open (404: not an active VISTA catalog course), kept visible but
  // disabled so the same choice is not sent again.
  const [refused, setRefused] = useState<string[]>([]);
  useEffect(() => { if (open) { setError(null); setOfferingId(''); setRefused([]); } }, [open]);
  const formRef = useRef<HTMLFormElement>(null);
  // The course list loads after the dialog opens and errors disable the button that had focus, so focus the first
  // usable control once there is something to act on: the course list, then Try again, then Cancel.
  const focusFirstControl = () => window.setTimeout(() => {
    const panel = formRef.current?.closest<HTMLElement>('[role="dialog"]');
    const target = panel?.querySelector<HTMLElement>('select[name="offeringId"]:not(:disabled), [data-retry], [data-cancel]');
    if (target && panel && (!panel.contains(document.activeElement) || (document.activeElement as HTMLButtonElement | null)?.disabled)) target.focus();
  }, 0);
  const offerings = useQuery({ queryKey: schoolAdminKeys.offerings(organizationId), queryFn: () => educationAdminApi.offerings(organizationId, token), enabled: open && Boolean(organizationId) });
  const refreshClassroom = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: schoolAdminKeys.classrooms(organizationId) }),
    queryClient.invalidateQueries({ queryKey: schoolAdminKeys.members(organizationId, classroom.id) }),
    queryClient.invalidateQueries({ queryKey: schoolAdminKeys.overview(organizationId) }),
  ]);
  const reassign = useMutation({
    mutationFn: (nextId: string) => educationAdminApi.assignClassroomOffering(organizationId, classroom.id, nextId, token),
    onSuccess: async (_data, nextId) => {
      const title = offerings.data?.find((offering) => offering.id === nextId)?.title;
      onClose(); toast.success('Course changed', title ? { description: `${classroom.name} now uses ${title}.` } : undefined);
      await refreshClassroom();
    },
    onError: (reason, refusedId) => {
      setError(lifecycleErrorMessage(reason, 'change-course'));
      if (isRefusedOfferingError(reason)) { setRefused((current) => [...current, refusedId]); setOfferingId(''); }
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('select[name="offeringId"]')?.focus(), 0);
      // The classroom or the offering changed elsewhere: show the server's current state behind the dialog.
      if (isStaleLifecycleError(reason)) void Promise.all([refreshClassroom(), queryClient.invalidateQueries({ queryKey: schoolAdminKeys.offerings(organizationId) })]);
    },
  });
  useEffect(() => { if (open && !offerings.isPending) focusFirstControl(); }, [open, offerings.isPending, offerings.isError]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (offeringId && !reassign.isPending) reassign.mutate(offeringId); };
  const current = currentOffering(offerings.data, classroom.offering_id);
  const choices = selectableOfferings(offerings.data, classroom.offering_id);
  const noChoices = offerings.isSuccess && choices.length === 0;

  return (
    <Dialog open={open} onClose={() => { if (!reassign.isPending) onClose(); }} title="Change course"
      description={<>Choose another course for <span className="font-medium text-ink">{classroom.name}</span>.</>}
      footer={<><Button data-cancel variant="secondary" onClick={onClose} disabled={reassign.isPending}>Cancel</Button><Button type="submit" variant="primary" form="reassign-offering" loading={reassign.isPending} disabled={!offeringId}>{reassign.isPending ? 'Changing…' : 'Change course'}</Button></>}>
      <form ref={formRef} id="reassign-offering" onSubmit={submit} noValidate className="space-y-4">
        <div className="border-l-4 border-warn bg-warn-soft p-3 text-sm text-ink"><p className="font-semibold">Active students switch to the new course.</p><p className="mt-1">They lose access to the current course through this classroom and get the new one straight away. Completed lessons and past submissions are kept, and access through their other active classrooms isn’t affected.</p></div>
        <div>
          <p className="text-[13px] font-medium text-ink">Current course</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
            {classroom.offering_title ?? <span className="text-ink-subtle">No course yet</span>}
            {current?.code && <span className="tabular-nums text-ink-muted">{current.code}</span>}
            {classroom.offering_title && <Badge tone="accent">Current</Badge>}
          </p>
        </div>
        {offerings.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
            <span>{offerings.error instanceof TypeError ? 'VISTA couldn’t be reached. Check your connection, then try again.' : 'Your school’s courses couldn’t be loaded.'}</span>
            <Button data-retry size="sm" variant="secondary" onClick={() => void offerings.refetch()} loading={offerings.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
          </div>
        ) : noChoices ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-sm text-ink-muted">Your school isn’t running another course right now. To use a different VISTA catalog course, create a classroom with it first; it then appears here.</p>
        ) : (
          <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-ink">New course</span>
            <select name="offeringId" value={offeringId} onChange={(event) => { setOfferingId(event.target.value); setError(null); }} disabled={offerings.isPending || reassign.isPending} aria-required className={`${inputClasses} h-10`}>
              <option value="" disabled>{offerings.isPending ? 'Loading courses…' : 'Choose a course'}</option>
              {choices.map((offering) => { const isRefused = refused.includes(offering.id); return <option key={offering.id} value={offering.id} disabled={isRefused}>{offering.title} ({offering.code}){isRefused ? ' · can’t be assigned' : ''}</option>; })}
            </select>
            <span className="block text-xs text-ink-muted">Only VISTA catalog courses can be assigned. Don’t see the one you need? Create a classroom with it first.</span>
          </label>
        )}
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
