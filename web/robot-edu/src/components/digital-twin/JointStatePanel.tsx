import { useState } from 'react';
import { SO101_NAMES, toUrdfRadians, type So101JointName } from './so101Model';
import type { JointState } from './twinTelemetry';
import { ARM_METADATA, JOINT_DETAILS, type ArmIdentity, type PairTrackingDelta } from './types';
import { Sliders } from 'lucide-react';

interface JointStatePanelProps {
  activeArmId: ArmIdentity;
  activeFrame: JointState | null;
  pairDelta?: PairTrackingDelta;
  isPairView?: boolean;
  leaderFrame?: JointState | null;
  followerFrame?: JointState | null;
  className?: string;
}

export function JointStatePanel({
  activeArmId,
  activeFrame,
  pairDelta,
  isPairView = false,
  leaderFrame,
  followerFrame,
  className = '',
}: JointStatePanelProps) {
  const [unitMode, setUnitMode] = useState<'deg' | 'rad'>('deg');
  const activeMeta = ARM_METADATA[activeArmId];

  // Helper to format values
  const formatJointVal = (name: So101JointName, pos: number, unit: 'rad' | 'deg' | 'percent'): string => {
    if (name === 'gripper') {
      return `${Math.round(pos)}%`;
    }
    if (unitMode === 'deg') {
      const deg = unit === 'rad' ? (pos * 180) / Math.PI : pos;
      return `${deg.toFixed(1)}°`;
    }
    const rad = unit === 'deg' ? (pos * Math.PI) / 180 : pos;
    return `${rad.toFixed(3)} rad`;
  };

  // Helper to calculate bar percentage between lower and upper limits
  const calculateLimitPct = (name: So101JointName, radVal: number | null): number => {
    if (radVal === null) return 50;
    const detail = JOINT_DETAILS[name];
    if (name === 'gripper') {
      return Math.max(0, Math.min(100, radVal)); // For gripper radVal is position 0..100%
    }
    const range = detail.upperRad - detail.lowerRad;
    if (range <= 0) return 50;
    const pct = ((radVal - detail.lowerRad) / range) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  return (
    <div className={`rounded-xl border border-line bg-surface p-5 shadow-sm ${className}`}>
      {/* Header with Unit Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-600">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              {isPairView ? 'Dual-Arm Joint Telemetry & Tracking' : `Joint State · ${activeMeta.label}`}
            </h3>
            <p className="text-xs text-ink-muted">
              {isPairView ? 'Real-time Leader vs Follower tracking error' : activeMeta.description}
            </p>
          </div>
        </div>

        {/* Unit Selector */}
        <div className="flex items-center rounded-lg border border-line bg-canvas p-0.5 text-2xs font-semibold">
          <button
            type="button"
            onClick={() => setUnitMode('deg')}
            className={`rounded px-2.5 py-1 transition-colors ${
              unitMode === 'deg' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Degrees (°)
          </button>
          <button
            type="button"
            onClick={() => setUnitMode('rad')}
            className={`rounded px-2.5 py-1 transition-colors ${
              unitMode === 'rad' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Radians (rad)
          </button>
        </div>
      </div>

      {/* Joint list */}
      <div className="mt-4 space-y-3.5">
        {SO101_NAMES.map((name) => {
          const detail = JOINT_DETAILS[name];

          if (isPairView && leaderFrame && followerFrame && pairDelta) {
            // Pair view: side-by-side comparison
            const lReading = leaderFrame.measured.find((r) => r.name === name);
            const fReading = followerFrame.measured.find((r) => r.name === name);
            const delta = pairDelta.jointDeltas[name];

            const lRad = lReading ? toUrdfRadians(name, lReading.position, lReading.unit) : null;
            const fRad = fReading ? toUrdfRadians(name, fReading.position, fReading.unit) : null;

            const lPct = calculateLimitPct(name, name === 'gripper' ? (lReading?.position ?? 0) : lRad);
            const fPct = calculateLimitPct(name, name === 'gripper' ? (fReading?.position ?? 0) : fRad);

            // Error color threshold
            const isHighDelta = name === 'gripper' ? (delta.percent ?? 0) > 8 : delta.rad > 0.08;
            const isMediumDelta = name === 'gripper' ? (delta.percent ?? 0) > 4 : delta.rad > 0.04;

            return (
              <div
                key={name}
                className="rounded-lg border border-line bg-canvas/60 p-3 transition-colors hover:border-line-strong"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{detail.label}</span>
                    <span className="font-mono text-2xs text-ink-subtle">({detail.urdfName})</span>
                  </div>

                  {/* Delta Badge */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xs text-ink-muted">Tracking Δ:</span>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-2xs font-semibold ${
                        isHighDelta
                          ? 'bg-rose-100 text-rose-800'
                          : isMediumDelta
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {name === 'gripper'
                        ? `${(delta.percent ?? 0).toFixed(1)}%`
                        : unitMode === 'deg'
                        ? `${delta.deg.toFixed(1)}°`
                        : `${delta.rad.toFixed(3)} rad`}
                    </span>
                  </div>
                </div>

                {/* Values Comparison Grid */}
                <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
                  {/* Leader */}
                  <div className="rounded bg-surface p-2 border border-line">
                    <div className="flex justify-between text-2xs">
                      <span className="font-medium text-sky-700">Leader (Cmd)</span>
                      <span className="font-mono font-semibold text-ink">
                        {lReading ? formatJointVal(name, lReading.position, lReading.unit) : '—'}
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-75"
                        style={{ width: `${lPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Follower */}
                  <div className="rounded bg-surface p-2 border border-line">
                    <div className="flex justify-between text-2xs">
                      <span className="font-medium text-emerald-700">Follower (Act)</span>
                      <span className="font-mono font-semibold text-ink">
                        {fReading ? formatJointVal(name, fReading.position, fReading.unit) : '—'}
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                        style={{ width: `${fPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Single Arm View
          const reading = activeFrame?.measured.find((r) => r.name === name);
          const radVal = reading ? toUrdfRadians(name, reading.position, reading.unit) : null;
          const pct = calculateLimitPct(name, name === 'gripper' ? (reading?.position ?? 0) : radVal);

          // Warn if within 10% of edge limit
          const isNearLimit = name !== 'gripper' && (pct < 10 || pct > 90);

          return (
            <div
              key={name}
              className="rounded-lg border border-line bg-canvas/40 p-3 transition-colors hover:border-line-strong"
            >
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-ink">{detail.label}</span>
                  <span className="ml-1.5 font-mono text-2xs text-ink-subtle">{detail.description}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-ink">
                  {reading ? formatJointVal(name, reading.position, reading.unit) : '—'}
                </span>
              </div>

              {/* Progress limit bar */}
              <div className="mt-2.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      isNearLimit ? 'bg-amber-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-2xs text-ink-subtle">
                  <span>{unitMode === 'deg' ? `${detail.lowerDeg}°` : `${detail.lowerRad} rad`}</span>
                  <span>{unitMode === 'deg' ? `${detail.upperDeg}°` : `${detail.upperRad} rad`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
