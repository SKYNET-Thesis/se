import type { ArmTelemetryStats, TelemetrySourceType } from './useDigitalTwinWorkspace';
import type { JointState } from './twinTelemetry';
import type { MotionPattern } from './mockTelemetryProvider';
import { ARM_METADATA, type ArmIdentity } from './types';
import { AlertTriangle, Info, Pause, Play, Radio, Wifi, WifiOff, Zap } from 'lucide-react';

interface TelemetryStatsPanelProps {
  activeArmId: ArmIdentity;
  stats: ArmTelemetryStats;
  frame: JointState | null;
  sourceType: TelemetrySourceType;
  onSourceChange: (source: TelemetrySourceType) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  motionPattern: MotionPattern;
  onPatternChange: (pattern: MotionPattern) => void;
  simSpeed: number;
  onSpeedChange: (speed: number) => void;
  onSimulateDrop: () => void;
  wsTransport: 'connecting' | 'connected' | 'disconnected';
  lastError: string | null;
  sessionId?: string;
  organizationId?: string;
  robotId?: string;
  viewerScopeToken?: string;
  mode?: 'all' | 'telemetry' | 'settings';
  className?: string;
}

export function TelemetryStatsPanel({
  activeArmId,
  stats,
  frame,
  sourceType,
  onSourceChange,
  isPlaying,
  onTogglePlay,
  motionPattern,
  onPatternChange,
  simSpeed,
  onSpeedChange,
  onSimulateDrop,
  wsTransport,
  lastError,
  sessionId = 'session-tabletop-01',
  organizationId,
  robotId,
  viewerScopeToken,
  mode = 'all',
  className = '',
}: TelemetryStatsPanelProps) {
  const meta = ARM_METADATA[activeArmId];
  const isStale = !stats.fresh && stats.connectionState !== 'disconnected';
  const isLive = frame?.source_mode === 'LIVE_PHYSICAL';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Card: Connection & Source Status */}
      {(mode === 'all' || mode === 'telemetry') && (
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                stats.connectionState === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : stats.connectionState === 'stale'
                  ? 'bg-amber-500'
                  : stats.connectionState === 'connecting'
                  ? 'bg-sky-500 animate-ping'
                  : 'bg-slate-400'
              }`}
            />
            <h3 className="text-sm font-semibold text-ink">Stream Health &amp; Telemetry</h3>
          </div>

          {/* Mode Pill Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-bold uppercase tracking-wider ${
              isLive
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}
          >
            <Radio className="h-3 w-3" />
            {isLive ? 'Live Physical Hardware' : 'Simulation Mock'}
          </span>
        </div>

        {/* Status Indicators Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-canvas p-2.5 border border-line">
            <p className="text-2xs font-medium text-ink-subtle">Connection</p>
            <p className="mt-1 font-semibold capitalize text-ink">
              {sourceType === 'websocket' ? wsTransport : stats.connectionState}
            </p>
          </div>

          <div className="rounded-lg bg-canvas p-2.5 border border-line">
            <p className="text-2xs font-medium text-ink-subtle">Sample Rate</p>
            <p className="mt-1 font-mono font-semibold text-ink">{stats.hz} Hz</p>
          </div>

          <div className="rounded-lg bg-canvas p-2.5 border border-line">
            <p className="text-2xs font-medium text-ink-subtle">Latency / Freshness</p>
            <p
              className={`mt-1 font-mono font-semibold ${
                stats.fresh ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {stats.ageMs !== null ? `${stats.ageMs} ms` : '—'}
            </p>
          </div>

          <div className="rounded-lg bg-canvas p-2.5 border border-line">
            <p className="text-2xs font-medium text-ink-subtle">Sequence Index</p>
            <p className="mt-1 font-mono font-semibold text-ink">#{stats.sequence}</p>
          </div>
        </div>

        {/* Detailed Stream Metadata */}
        <dl className="mt-4 divide-y divide-line border-t border-line text-xs">
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Active Arm Identity</dt>
            <dd className="font-medium text-ink">{meta.label} ({activeArmId})</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Active Session</dt>
            <dd className="font-mono text-ink truncate max-w-[200px]">{sessionId}</dd>
          </div>
          {organizationId && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-muted">Organization Scope</dt>
              <dd className="font-mono text-ink truncate max-w-[200px]">{organizationId}</dd>
            </div>
          )}
          {robotId && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-muted">Target Robot ID</dt>
              <dd className="font-mono text-ink truncate max-w-[200px]">{robotId}</dd>
            </div>
          )}
          {viewerScopeToken && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-muted">Scope Token</dt>
              <dd className="font-mono text-ink truncate max-w-[200px]" title={viewerScopeToken}>{viewerScopeToken.slice(0, 16)}…</dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Controller Authority</dt>
            <dd className="font-mono text-ink">{frame?.controller_id ?? 'offline-fixture'}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Calibration State</dt>
            <dd className="font-medium text-ink">{frame?.calibration_status ?? 'NOT_APPLICABLE'}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Packets Accepted / Rejected</dt>
            <dd className="font-mono text-ink">
              {stats.packetsReceived} ok / {stats.rejectedPackets} dropped
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-muted">Measured Timestamp</dt>
            <dd className="font-mono text-ink truncate max-w-[220px]">
              {frame?.measured_at ?? '—'}
            </dd>
          </div>
        </dl>

        {/* Notice regarding Education API token scope */}
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50/70 p-2.5 text-xs text-sky-900 border border-sky-200">
          <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
          <div className="text-2xs leading-relaxed">
            <span className="font-semibold">Multi-Arm Authorization Note:</span> Education API issues single-robot viewer scopes. Live multi-arm teleoperation streaming remains gated until multi-arm scope issuance is released in Education API. Mock multi-arm fixtures and Contract v1 compatibility run safely without bypassing security.
          </div>
        </div>

        {/* Warning Alert if stale */}
        {isStale && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Telemetry is stale (&gt;1000ms elapsed). Robot state visualization paused.</span>
          </div>
        )}

        {lastError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800 border border-red-200">
            <WifiOff className="h-4 w-4 shrink-0 text-red-600" />
            <span>{lastError}</span>
          </div>
        )}
      </div>
      )}

      {/* Bottom Card: Telemetry Source & Mock Controls */}
      {(mode === 'all' || mode === 'settings') && (
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink border-b border-line pb-3">
          Telemetry Adapter Configuration
        </h3>

        {/* Source Switcher */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSourceChange('mock')}
            className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
              sourceType === 'mock'
                ? 'border-sky-500 bg-sky-50/50 text-sky-950 font-semibold'
                : 'border-line text-ink-muted hover:bg-canvas'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-sky-600" />
              <span>Procedural Mock</span>
            </div>
            <p className="mt-1 text-2xs text-ink-subtle">Smooth internal kinematics generator</p>
          </button>

          <button
            type="button"
            onClick={() => onSourceChange('websocket')}
            className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
              sourceType === 'websocket'
                ? 'border-sky-500 bg-sky-50/50 text-sky-950 font-semibold'
                : 'border-line text-ink-muted hover:bg-canvas'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5 text-sky-600" />
              <span>Backend WebSocket</span>
            </div>
            <p className="mt-1 text-2xs text-ink-subtle">Connect to MuJoCo / LeLab server</p>
          </button>
        </div>

        {/* Mock Controls (Only active in mock mode) */}
        {sourceType === 'mock' && (
          <div className="mt-4 space-y-3 rounded-lg border border-line bg-canvas p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Mock Motion Simulation</span>
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex items-center gap-1.5 rounded-md bg-white border border-line px-2.5 py-1 text-xs font-medium text-ink shadow-sm hover:bg-sunken"
              >
                {isPlaying ? <Pause className="h-3 w-3 text-amber-600" /> : <Play className="h-3 w-3 text-emerald-600" />}
                <span>{isPlaying ? 'Pause' : 'Resume'}</span>
              </button>
            </div>

            {/* Pattern Selection */}
            <div>
              <label className="text-2xs font-medium text-ink-subtle">Trajectory Routine</label>
              <select
                value={motionPattern}
                onChange={(e) => onPatternChange(e.target.value as MotionPattern)}
                className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-sky-500 focus:outline-none"
              >
                <option value="pick_and_place">Tabletop Pick &amp; Place</option>
                <option value="wave">Range-of-Motion Harmonic Wave</option>
                <option value="mirroring">Teleoperation Mirroring</option>
              </select>
            </div>

            {/* Speed & Network Test */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1">
                <span className="text-2xs font-medium text-ink-subtle mr-1">Speed:</span>
                {[0.5, 1.0, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSpeedChange(s)}
                    className={`rounded px-2 py-0.5 text-2xs font-semibold ${
                      simSpeed === s ? 'bg-ink text-white' : 'bg-surface text-ink-muted border border-line'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Stress test button */}
              <button
                type="button"
                onClick={onSimulateDrop}
                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-2xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                title="Drops stream packets for 2 seconds to test stale state UI"
              >
                Test Stale State (2s)
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
