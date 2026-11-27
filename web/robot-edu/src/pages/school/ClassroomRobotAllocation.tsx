import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, CircleCheckIcon, PlusIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { educationAdminApi, type ApiRobotResource } from '../../lib/api';
import { eligibleRobotsEnabled, robotInvalidations, schoolAdminKeys } from '../../queries/schoolAdminQueries';

const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/**
 * School Admin robot allocation for one classroom. Allocation is many-to-many (a classroom may hold several robots, a robot may serve several
 * classrooms) and grants eligibility only; exclusive use comes from an Instructor's Lab Session. A robot with an open Lab Session cannot be removed.
 */
export function ClassroomRobotAllocation({ organizationId, classroomId, token, currentRobot, currentRobots }: { organizationId: string; classroomId: string; token: string; currentRobot?: ApiRobotResource | null; currentRobots?: ApiRobotResource[] }) {
  const [robotId, setRobotId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const allocated = currentRobots ?? (currentRobot ? [currentRobot] : []);
  const robots = useQuery({ queryKey: schoolAdminKeys.eligibleRobots(organizationId, classroomId), queryFn: () => educationAdminApi.eligibleRobots(classroomId, token), enabled: eligibleRobotsEnabled(open, classroomId) });
  const refresh = () => Promise.all(robotInvalidations(organizationId, classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const allocate = useMutation({ mutationFn: (next: string) => educationAdminApi.allocateRobot(classroomId, token, next), onSuccess: async () => { setOpen(false); await refresh(); }, onError: (reason) => setError(message(reason, 'Unable to allocate robot resource.')) });
  const remove = useMutation({ mutationFn: (id: string) => educationAdminApi.removeRobotAllocation(classroomId, token, id), onSuccess: async () => { setError(null); await refresh(); }, onError: (reason) => setError(message(reason, 'Unable to remove the allocation.')) });
  const candidates = (robots.data ?? []).filter((robot) => robot.allocated !== true && !allocated.some((item) => item.id === robot.id));
  const selected = candidates.find((robot) => robot.id === robotId);

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-ink">Robot Resource</h3><p className="mt-1 text-sm leading-5 text-ink-muted">Robot resources authorized for this classroom. An Instructor reserves one at a time with a Lab Session.</p></div>
        <BotIcon className="mt-1 h-5 w-5 text-accent" />
      </div>
      {error ? <p role="alert" className="mt-5 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {allocated.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {allocated.map((robot) => (
            <li key={robot.id} className="rounded-lg border border-line bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Robot resource</p>
              <p className="mt-2 font-semibold text-ink">{robot.name}</p>
              <p className="mt-1 text-sm text-ink-muted">{robot.modelName} · {robot.serialNo}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok"><CircleCheckIcon className="h-3.5 w-3.5" />Allocated</p>
                <Button variant="secondary" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${robot.name} from this classroom? It cannot be removed while a Lab Session is open.`)) remove.mutate(robot.id); }}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-canvas px-4 py-8 text-center"><BotIcon className="mx-auto h-6 w-6 text-ink-subtle" /><p className="mt-3 font-medium text-ink">No robot resource assigned</p><p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-ink-muted">Open allocation to check resources currently entitled to this school.</p></div>
      )}
      <Button className="mt-5 w-full" variant={allocated.length ? 'secondary' : 'primary'} onClick={() => { setRobotId(''); setError(null); setOpen(true); }} icon={<PlusIcon className="h-4 w-4" />}>Allocate robot</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Allocate robot resource" description="Select an eligible robot resource for this classroom."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => robotId && allocate.mutate(robotId)} loading={allocate.isPending} disabled={!robotId}>Allocate robot</Button></>}>
        <label className="block text-sm font-medium text-ink">Eligible robot
          <select value={robotId} onChange={(event) => setRobotId(event.target.value)} disabled={robots.isPending} className="mt-2 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm">
            <option value="">{robots.isPending ? 'Loading eligible robots…' : 'Select a robot resource'}</option>
            {candidates.map((robot) => <option key={robot.id} value={robot.id}>{robot.name} · {robot.modelName} · {robot.serialNo}</option>)}
          </select>
        </label>
        {robots.isSuccess && candidates.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No further eligible robot resource is currently entitled to this school.</p> : null}
        {selected ? <div className="mt-4 rounded-md bg-sunken p-3 text-sm"><p className="font-medium text-ink">{selected.name}</p><p className="mt-1 text-ink-muted">{selected.modelName} · {selected.serialNo}</p></div> : null}
      </Dialog>
    </section>
  );
}
