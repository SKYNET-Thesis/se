import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, inputClasses } from '../ui/Field';
import { labSessionApi, type ApiLabRobot, type ApiLabSession } from '../../lib/api';

/** User-facing robot states derived from authoritative server data. Connectivity, reservation, control ownership and safety are separate on the server. */
const ROBOT_STATUS_LABEL: Record<string, string> = {
  offline: 'Offline',
  available: 'Available',
  reserved_for_this_classroom: 'Reserved for this classroom',
  reserved_by_another_classroom: 'Reserved by another classroom',
  in_use: 'In use',
  ending_session: 'Ending session',
  safety_blocked: 'Safety blocked — waiting for the runtime to confirm the stop',
  unavailable: 'Unavailable (not entitled or out of service)',
};
const key = (classroomId: string) => ['lab-session', classroomId] as const;
const message = (error: unknown) => (error instanceof Error ? error.message : 'The request failed.');

function expiry(iso: string | null) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return `${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${minutes} min left)`;
}

/**
 * Robot Lab Session management inside a classroom. `role="instructor"` can start, extend and end a session; `role="school_admin"` can only request a
 * controlled force end (confirmation and reason required). Reserving a robot never arms hardware and never moves it.
 */
export function LabSessionPanel({ classroomId, token, role }: { classroomId: string; token: string; role: 'instructor' | 'school_admin' }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [forceTarget, setForceTarget] = useState<ApiLabSession | null>(null);
  const [reason, setReason] = useState('');
  const enabled = Boolean(classroomId && token);
  const robots = useQuery({ queryKey: [...key(classroomId), 'robots'], queryFn: () => labSessionApi.robots(classroomId, token), enabled, refetchInterval: 15000 });
  const sessions = useQuery({ queryKey: [...key(classroomId), 'sessions'], queryFn: () => labSessionApi.sessions(classroomId, token), enabled, refetchInterval: 15000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(classroomId) });
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: (e) => setError(message(e)),
  });
  const open = (sessions.data ?? []).filter((item) => item.state !== 'released');
  const sessionOf = (robot: ApiLabRobot) => open.find((item) => item.id === robot.labSessionId);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="lab-session-heading">
      <h2 id="lab-session-heading" className="text-lg font-semibold text-ink">Robot Lab Session</h2>
      <p className="mt-1 text-sm text-ink-muted">A Lab Session reserves an allocated robot for this classroom. Only this classroom&apos;s students can run experiments on it while the session is active. Starting a session does not arm or move the robot.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {robots.isLoading ? <p className="mt-3 text-sm text-ink-muted" role="status">Loading robots…</p> : null}
      {robots.isError ? <p role="alert" className="mt-3 text-sm text-danger">{message(robots.error)}</p> : null}
      {robots.isSuccess && robots.data.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No robots are allocated to this classroom.</p> : null}
      <ul className="mt-4 space-y-3">
        {(robots.data ?? []).map((robot) => {
          const session = sessionOf(robot);
          const mine = robot.reservation === 'this_classroom';
          return (
            <li key={robot.robotId} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{robot.name} <span className="font-normal text-ink-muted">· {robot.modelName} · {robot.serialNo}</span></p>
                  <p className="mt-1 text-sm text-ink" data-testid={`robot-status-${robot.robotId}`}>{ROBOT_STATUS_LABEL[robot.status] ?? robot.status}</p>
                  <p className="text-xs text-ink-muted">
                    Runtime: {robot.connectivity === 'unknown' ? 'not reported' : robot.connectivity}
                    {mine && robot.controllerActive !== null ? ` · Student control: ${robot.controllerActive ? 'in use' : 'free'}` : ''}
                    {mine && robot.expiresAt ? ` · Reserved until ${expiry(robot.expiresAt)}` : ''}
                  </p>
                  {session?.state === 'quarantined' || session?.state === 'terminating' ? (
                    <p className="mt-1 text-xs text-ink-muted" role="status">{session.recovery ?? 'Ending: waiting for the active student run to finish.'}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {role === 'instructor' && robot.reservation === 'none' && robot.status !== 'unavailable' ? (
                    <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate(() => labSessionApi.start(classroomId, token, robot.robotId))}>Start Lab Session</Button>
                  ) : null}
                  {role === 'instructor' && mine && session?.state === 'active' ? (
                    <>
                      <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate(() => labSessionApi.extend(session.id, token, 30))}>Extend 30 min</Button>
                      <Button variant="secondary" disabled={run.isPending} onClick={() => { if (window.confirm('End the Lab Session and release this robot? A running student experiment will be stopped.')) run.mutate(() => labSessionApi.end(session.id, token)); }}>End Lab Session</Button>
                    </>
                  ) : null}
                  {role === 'instructor' && mine && (session?.state === 'terminating' || session?.state === 'quarantined') ? (
                    <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate(() => labSessionApi.end(session.id, token))}>Retry release</Button>
                  ) : null}
                  {role === 'school_admin' && mine && session ? <Button variant="secondary" onClick={() => { setReason(''); setForceTarget(session); }}>Force end…</Button> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={Boolean(forceTarget)}
        onClose={() => setForceTarget(null)}
        title="Controlled force end"
        description="This uses the same safe termination as the Instructor's End: new student runs stop immediately, an active run is asked to stop, and the robot is released only after the runtime confirms it. It cannot override a physical safety state."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForceTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={reason.trim().length < 5 || run.isPending}
              onClick={() => { const target = forceTarget; if (target) run.mutate(() => labSessionApi.forceEnd(target.id, token, reason.trim()), { onSuccess: () => setForceTarget(null) }); }}
            >Force end session</Button>
          </>
        )}
      >
        <Field label="Reason (recorded in the audit trail)">
          {(props) => <textarea {...props} className={inputClasses} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />}
        </Field>
      </Dialog>
    </section>
  );
}
