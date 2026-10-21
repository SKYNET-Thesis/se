import React from 'react';
import { CameraOffIcon, CheckCircle2Icon, CircleDashedIcon, PuzzleIcon, RefreshCwIcon } from 'lucide-react';
import type { ArmStatus } from '../types/robot';
import { useAdmin } from '../contexts/AdminContext';
import { usePrograms } from '../contexts/ProgramsContext';
import { useRobotStatus } from '../hooks/useRobotStatus';
import { connectionMeta } from '../components/robot/RobotStatusSummary';
import { ExperimentList } from '../components/robot/ExperimentList';
import { Button } from '../components/ui/Button';
import { DemoTag } from '../components/ui/DemoTag';
import { LinkButton } from '../components/ui/LinkButton';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionHeading } from '../components/ui/SectionHeading';
import { StatusDot } from '../components/ui/StatusDot';
import { formatRelative } from '../utils/format';

const integrationChecks = [
{ label: 'Robot control backend', detail: 'No endpoint configured', ok: false },
{ label: 'Live telemetry', detail: 'Requires robot control backend', ok: false },
{ label: 'Camera stream', detail: 'No stream source configured', ok: false },
{ label: 'Session authorisation & safety interlocks', detail: 'Must be enforced by backend and hardware', ok: false },
{ label: 'Schematic simulator', detail: 'Runs in the browser', ok: true }];


export function RobotLab() {
  const { loading, hardware, simulation, error, refresh } = useRobotStatus();
  const { experiments } = usePrograms();
  const { robots } = useAdmin();
  const hwMeta = hardware ? connectionMeta[hardware.connection] : null;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title="Robot Lab"
        description="Connection, arm status and experiment history for the lab's dual-arm robots."
        actions={
        <Button variant="secondary" onClick={() => void refresh()} loading={loading} icon={<RefreshCwIcon className="h-4 w-4" />}>
            Check status
          </Button>
        } />
      

      {error && <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">Status check failed: {error}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="hardware-heading" className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="hardware-heading" className="text-[15px] font-semibold text-ink">
                Dual-arm robot
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-muted">{hardware?.message ?? 'Checking…'}</p>
            </div>
            {hwMeta &&
            <span className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-2.5 py-1 text-xs font-medium text-ink-muted">
                <StatusDot tone={hwMeta.tone} /> {hwMeta.label}
              </span>
            }
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-3">
            {(['left', 'right'] as const).map((arm) =>
            <ArmCell key={arm} label={`${arm === 'left' ? 'Left' : 'Right'} arm`} status={hardware?.arms[arm]} loading={loading} />
            )}
            <div className="bg-surface px-5 py-4">
              <p className="text-xs text-ink-subtle">Availability</p>
              <p className="mt-1 text-sm font-medium text-ink">{loading ? '…' : 'Unknown'}</p>
              <p className="mt-0.5 text-xs text-ink-subtle">No booking service</p>
            </div>
          </div>

          <div className="p-5">
            <div className="flex aspect-video flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-canvas text-center">
              <CameraOffIcon className="h-6 w-6 text-ink-subtle" aria-hidden />
              <p className="mt-2 text-sm font-medium text-ink">No camera stream available</p>
              <p className="mt-0.5 max-w-xs text-[13px] text-ink-muted">A live view appears here once a camera source is configured for this robot.</p>
            </div>
          </div>

          <div className="border-t border-line px-5 py-4">
            <p className="text-xs text-ink-subtle">Current experiment</p>
            <p className="mt-1 text-sm text-ink">No hardware experiment running. Hardware execution is disabled until the integration is verified.</p>
          </div>
        </section>

        <div className="space-y-8">
          <section aria-labelledby="integration-heading">
            <SectionHeading id="integration-heading" title="Integration status" />
            <ul className="divide-y divide-line border-y border-line">
              {integrationChecks.map((c) =>
              <li key={c.label} className="flex items-start gap-3 py-3">
                  {c.ok ? <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Available" /> : <CircleDashedIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-label="Not available" />}
                  <div>
                    <p className="text-sm font-medium text-ink">{c.label}</p>
                    <p className="text-xs text-ink-muted">{c.detail}</p>
                  </div>
                </li>
              )}
            </ul>
          </section>

          <section aria-labelledby="sim-heading">
            <SectionHeading id="sim-heading" title="Simulator" />
            <div className="flex items-center justify-between gap-4">
              <p className="text-[13px] text-ink-muted">
                {simulation ? `${connectionMeta[simulation.connection].label}. ${simulation.message}` : 'Checking…'}
              </p>
              <LinkButton to="/studio" size="sm" icon={<PuzzleIcon className="h-4 w-4" />}>
                Studio
              </LinkButton>
            </div>
          </section>

          <section aria-labelledby="benches-heading">
            <SectionHeading id="benches-heading" title="Registered benches" action={<DemoTag label="Demo registry" />} />
            <ul className="divide-y divide-line border-y border-line">
              {robots.map((r) =>
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-subtle">{r.location}</p>
                  </div>
                  <span className="text-xs text-ink-muted">{r.integration === 'pending_verification' ? 'Pending verification' : 'Not configured'}</span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="history-heading" className="mt-12">
        <SectionHeading
          id="history-heading"
          title="Execution history"
          action={<span className="text-xs text-ink-subtle">Simulation runs from this browser{experiments[0] ? ` · last ${formatRelative(experiments[0].startedAt)}` : ''}</span>} />
        
        <ExperimentList experiments={experiments} detailed />
      </section>
    </div>);

}

function ArmCell({ label, status, loading }: {label: string;status: ArmStatus | undefined;loading: boolean;}) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium capitalize text-ink">
        <StatusDot tone="unknown" /> {loading || !status ? '…' : status.state}
      </p>
      <p className="mt-0.5 text-xs capitalize text-ink-subtle">Gripper {status ? status.gripper : '…'}</p>
    </div>);

}