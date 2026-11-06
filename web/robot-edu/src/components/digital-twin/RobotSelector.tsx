import type { DigitalTwinRobot } from '../../lib/api';

export function RobotSelector({ robots, loading, error, selectedRobotId, onSelect }: {
  robots: DigitalTwinRobot[]; loading: boolean; error: string | null; selectedRobotId?: string; onSelect: (robotId: string) => void;
}) {
  return <section aria-labelledby="robot-selection-heading" className="mt-8 rounded-xl border border-line bg-surface p-5">
    <h2 id="robot-selection-heading" className="text-[15px] font-semibold text-ink">Robot selection</h2>
    <p className="mt-1 text-[13px] text-ink-muted">Choose an allocated SO-101. Availability is authorization only; it does not indicate a connected follower.</p>
    {loading && <p role="status" className="mt-3 text-sm text-ink-muted">Loading available robots…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">Robot list unavailable: {error}</p>}
    {!loading && !error && robots.length === 0 && <p role="status" className="mt-3 text-sm text-ink-muted">No SO-101 robots are allocated to your current access.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {robots.map((robot) => {
        const authorized = robot.viewerAccess === 'authorized';
        return <button key={robot.id} type="button" disabled={!authorized} onClick={() => onSelect(robot.id)} aria-pressed={selectedRobotId === robot.id}
          className="rounded-lg border border-line p-4 text-left disabled:cursor-not-allowed disabled:opacity-60 aria-[pressed=true]:border-ink aria-[pressed=true]:bg-sunken">
          <span className="block text-sm font-medium text-ink">{robot.name}</span>
          <span className="mt-1 block text-xs text-ink-muted">{robot.allocationStatus === 'allocated' ? 'Allocated to your classroom' : 'Not allocated to your classroom'} · {robot.status}</span>
          <span className="mt-2 block text-xs font-medium text-ink">{authorized ? 'Viewer access authorized' : 'Viewer access unavailable'}</span>
        </button>;
      })}
    </div>
  </section>;
}
