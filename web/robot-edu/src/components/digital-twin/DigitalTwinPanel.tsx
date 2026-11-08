import { useEffect, useState } from 'react';
import { So101DigitalTwinViewer } from './So101DigitalTwinViewer';
import { SO101_NAMES } from './so101Model';
import { useTwinTelemetry } from './useTwinTelemetry';
import { isPoseCalibrated } from './twinTelemetry';
import { CalibrationPanel } from './CalibrationPanel';
import { HardwareCalibrationPanel } from './HardwareCalibrationPanel';

export function DigitalTwinPanel({
  viewerScopeToken,
  scopeStatus,
  scopeExpiresAt,
  onScopeRejected,
  expectedRobotId,
  mode = 'simulation',
}: {
  viewerScopeToken?: string;
  scopeStatus?: string;
  scopeExpiresAt?: string;
  onScopeRejected?: () => void;
  expectedRobotId?: string;
  mode?: 'physical' | 'simulation';
}) {
  const [activeTab, setActiveTab] = useState<'twin' | 'calibration'>('twin');
  const telemetry = useTwinTelemetry(
    viewerScopeToken,
    onScopeRejected,
    expectedRobotId,
    mode === 'simulation' || !!viewerScopeToken
  );
  const measured = new Map(telemetry.frame?.measured.map((reading) => [reading.name, reading]) ?? []);
  const status =
    telemetry.transport !== 'connected' ? telemetry.transport : telemetry.frame?.connection ?? 'waiting for samples';
  const source =
    telemetry.frame?.source_mode === 'LIVE_PHYSICAL'
      ? 'PHYSICAL — MEASURED FOLLOWER'
      : mode === 'simulation'
      ? 'SIMULATION — MOCK DATA'
      : 'PHYSICAL SOURCE UNAVAILABLE';
  const calibrated = isPoseCalibrated(telemetry.frame);

  // In simulation mode, always revert to 'twin' view
  useEffect(() => {
    if (mode === 'simulation') {
      setActiveTab('twin');
    }
  }, [mode]);

  return (
    <section
      aria-labelledby="digital-twin-heading"
      className="mt-8 overflow-hidden rounded-xl border border-line bg-surface"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 bg-white">
        <div className="flex items-center gap-4">
          <div>
            <h2 id="digital-twin-heading" className="text-[15px] font-semibold text-ink">
              SO-101 Digital Twin
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">so101_new_calib · URDF/STL · read-only visualization</p>
          </div>

          {/* Subsystem Navigation Tabs (Only in physical mode) */}
          {mode === 'physical' && (
            <div className="hidden sm:flex items-center rounded-lg border border-line bg-surface p-1">
              <button
                type="button"
                onClick={() => setActiveTab('twin')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  activeTab === 'twin'
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                3D Twin &amp; Telemetry
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('calibration')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  activeTab === 'calibration'
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                Hardware Calibration
              </button>
            </div>
          )}
        </div>

        <span className="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">{source}</span>
      </div>

      {/* Main Tab: 3D Twin & Telemetry */}
      {activeTab === 'twin' && (
        <>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(250px,1fr)]">
            <So101DigitalTwinViewer frame={telemetry.frame} fresh={telemetry.fresh} calibrated={calibrated} />
            <div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink-subtle">Source</dt>
                  <dd className="font-medium text-ink">
                    {telemetry.frame?.source_mode === 'LIVE_PHYSICAL'
                      ? 'Physical / measured follower'
                      : mode === 'simulation'
                      ? 'Simulation / Mock'
                      : 'Offline / physical source unavailable'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Connection</dt>
                  <dd className="font-medium text-ink">{status}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Controller</dt>
                  <dd className="font-medium text-ink">{telemetry.frame?.controller_id ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Freshness</dt>
                  <dd className="font-medium text-ink">{telemetry.fresh ? 'Fresh' : 'Stale / unavailable'}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Calibration</dt>
                  <dd className="font-medium text-ink">{telemetry.frame?.calibration_status ?? '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-subtle">Physical access</dt>
                  <dd className="font-medium text-ink">
                    {scopeStatus ?? 'Simulation only'}
                    {scopeExpiresAt ? ` · scope expires ${new Date(scopeExpiresAt).toLocaleTimeString()}` : ''}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-subtle">Measured at</dt>
                  <dd className="font-medium text-ink">
                    {telemetry.frame?.measured_at ?? '—'}
                    {telemetry.ageMs !== null ? ` · ${Math.round(telemetry.ageMs)} ms ago` : ''}
                  </dd>
                </div>
              </dl>
              {telemetry.error && <p role="status" className="mt-3 text-xs text-amber-800">{telemetry.error}</p>}
              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Measured joint values
              </h3>
              <dl className="mt-2 divide-y divide-line border-y border-line">
                {SO101_NAMES.map((name) => {
                  const reading = measured.get(name);
                  return (
                    <div key={name} className="flex justify-between gap-3 py-2 text-xs">
                      <dt className="text-ink-muted">{name}</dt>
                      <dd className="font-mono text-ink">
                        {reading ? `${reading.position.toFixed(reading.unit === 'percent' ? 0 : 3)} ${reading.unit}` : '—'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 text-xs text-ink-muted">
                {calibrated
                  ? 'Pose uses the verified joint calibration.'
                  : 'UNCALIBRATED telemetry is displayed as values only; the 3D pose does not claim physical accuracy. Gripper percentage never maps to Jaw without an approved conversion.'}
              </p>
            </div>
          </div>

          <CalibrationPanel
            frame={telemetry.frame}
            robotId={expectedRobotId}
            onOpenHardwareCalib={mode === 'physical' ? () => setActiveTab('calibration') : undefined}
          />
        </>
      )}

      {/* Subsystem Tab: Hardware Calibration */}
      {activeTab === 'calibration' && mode === 'physical' && (
        <div className="p-4 bg-canvas">
          <HardwareCalibrationPanel
            robotId={expectedRobotId}
            onClose={() => setActiveTab('twin')}
            onTransitionToVisual={() => setActiveTab('twin')}
          />
        </div>
      )}
    </section>
  );
}
