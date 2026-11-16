import { useState } from 'react';
import { useDigitalTwinWorkspace } from './useDigitalTwinWorkspace';
import { DigitalTwinWorkspaceViewer } from './DigitalTwinWorkspaceViewer';
import { JointStatePanel } from './JointStatePanel';
import { TelemetryStatsPanel } from './TelemetryStatsPanel';
import { ARM_METADATA, JOINT_DETAILS, type ArmIdentity, type ViewLayoutMode } from './types';
import { SO101_NAMES } from './so101Model';
import {
  Activity,
  Compass,
  Cpu,
  Eye,
  GitCompare,
  Layers,
  Pause,
  Play,
  Radio,
  Settings2,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

export type WorkspaceTab = 'joints' | 'arms' | 'telemetry' | 'settings';

export interface DigitalTwinWorkspaceProps {
  className?: string;
  initialArm?: ArmIdentity;
  sessionId?: string;
  organizationId?: string;
  robotId?: string;
  viewerScopeToken?: string;
  onScopeRevoked?: () => void;
  isAuthorized?: boolean;
}

const TABS: { id: WorkspaceTab; label: string; icon: typeof Sliders }[] = [
  { id: 'joints', label: 'Joints', icon: Sliders },
  { id: 'arms', label: 'Arms', icon: Layers },
  { id: 'telemetry', label: 'Telemetry', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export function DigitalTwinWorkspace({
  className = '',
  initialArm = 'follower_left',
  sessionId = 'session-tabletop-01',
  organizationId,
  robotId,
  viewerScopeToken,
  onScopeRevoked,
  isAuthorized = true,
}: DigitalTwinWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('joints');

  const {
    sourceType,
    setSourceType,
    activeArmId,
    setActiveArmId,
    activePairId,
    setActivePairId,
    layoutMode,
    setLayoutMode,
    isPlaying,
    setIsPlaying,
    motionPattern,
    setMotionPattern,
    simSpeed,
    setSimSpeed,
    wsTransport,
    lastError,
    frames,
    stats,
    leftPairDelta,
    rightPairDelta,
    simulateDrop,
  } = useDigitalTwinWorkspace({
    initialArm,
    sessionId,
    organizationId,
    robotId,
    viewerScopeToken,
    onScopeRevoked,
  });

  const activeFrame = frames[activeArmId];
  const activeStats = stats[activeArmId];
  const activePairDelta = activePairId === 'left_pair' ? leftPairDelta : rightPairDelta;
  const isPairView = layoutMode === 'pair';

  const leaderArmId: ArmIdentity = activePairId === 'left_pair' ? 'leader_left' : 'leader_right';
  const followerArmId: ArmIdentity = activePairId === 'left_pair' ? 'follower_left' : 'follower_right';

  // Empty State: Unauthorized or no robot available
  if (!isAuthorized) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-12 text-center shadow-sm ${className}`}>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-ink">No Authorized Robot Arm Available</h3>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Digital Twin telemetry access requires an active classroom membership with robot execution entitlement. Your current account does not have authorization to view live robot telemetry.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Workspace Header Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sky-600 text-white shadow-sm">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">SO-101 Digital Twin Workspace</h2>
            <p className="text-xs text-ink-muted">
              Tabletop manipulation twin · so101_new_calib URDF · Leader–follower kinematics
            </p>
          </div>
        </div>

        {/* Global Quick View Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pair selector */}
          <div className="flex items-center rounded-lg border border-line bg-canvas p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setActivePairId('left_pair');
                setActiveArmId('follower_left');
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activePairId === 'left_pair' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <span>Left Pair</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePairId('right_pair');
                setActiveArmId('follower_right');
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activePairId === 'right_pair' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              <span>Right Pair</span>
            </button>
          </div>

          {/* View Layout Mode Buttons */}
          <div className="flex items-center rounded-lg border border-line bg-canvas p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLayoutMode('pair')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                layoutMode === 'pair' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
              title="View Leader and Follower pair side-by-side"
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span>Pair View</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('single')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                layoutMode === 'single' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
              title="Inspect single arm"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Single Arm</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('quad')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                layoutMode === 'quad' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
              title="Overview of all four tabletop arms"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>4-Arm Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 3-Column Studio Grid: Left Sidebar (Scene/Arms) + Center (3D Viewport) + Right Sidebar (Joints/Telemetry) */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_360px] items-start">
        {/* LEFT SIDEBAR: Scene Controls, Camera Presets, Arms Selection */}
        <div className="order-2 lg:order-1 flex flex-col rounded-xl border border-line bg-surface shadow-sm h-auto lg:h-[640px] max-h-[500px] lg:max-h-none overflow-y-auto p-4 space-y-4">
          {/* Header */}
          <div className="border-b border-line pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-sky-600" />
              <span>Scene &amp; Arm Controls</span>
            </h3>
            <p className="mt-0.5 text-2xs text-ink-muted">View configuration &amp; tabletop pairs</p>
          </div>

          {/* Active Pair Selector */}
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              Tabletop Pair Focus
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActivePairId('left_pair');
                  setActiveArmId('follower_left');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition-colors ${
                  activePairId === 'left_pair'
                    ? 'border-sky-500 bg-sky-50/70 text-sky-950 font-bold'
                    : 'border-line text-ink-muted hover:bg-canvas'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Left Pair</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePairId('right_pair');
                  setActiveArmId('follower_right');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition-colors ${
                  activePairId === 'right_pair'
                    ? 'border-violet-500 bg-violet-50/70 text-violet-950 font-bold'
                    : 'border-line text-ink-muted hover:bg-canvas'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                <span>Right Pair</span>
              </button>
            </div>
          </div>

          {/* Layout Mode */}
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              3D View Mode
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'pair', label: 'Pair View', icon: GitCompare },
                  { id: 'single', label: 'Single', icon: Eye },
                  { id: 'quad', label: '4-Arm', icon: Layers },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLayoutMode(m.id as ViewLayoutMode)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center text-2xs transition-colors ${
                    layoutMode === m.id
                      ? 'border-sky-500 bg-sky-50/60 text-sky-950 font-bold'
                      : 'border-line text-ink-muted hover:bg-canvas'
                  }`}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4 Tabletop Arms Card */}
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              Tabletop Arm Selector
            </label>
            <div className="mt-1.5 space-y-1.5">
              {(['leader_left', 'follower_left', 'leader_right', 'follower_right'] as const).map((id) => {
                const meta = ARM_METADATA[id];
                const isSelected = id === activeArmId;
                const isArmFresh = stats[id].fresh;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setActiveArmId(id);
                      setActivePairId(meta.pairId);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border p-2 text-left transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500'
                        : 'border-line hover:border-line-strong hover:bg-canvas/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.colorHex }}
                      />
                      <div>
                        <div className="text-xs font-semibold text-ink leading-tight">{meta.label}</div>
                        <div className="text-2xs text-ink-subtle capitalize">
                          {meta.role} · {meta.side} Side
                        </div>
                      </div>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        isArmFresh ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      title={isArmFresh ? 'Live stream fresh' : 'Telemetry stale/offline'}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Camera View Instructions */}
          <div className="rounded-lg border border-line bg-canvas/60 p-2.5 text-2xs text-ink-muted space-y-1">
            <p className="font-semibold text-ink">3D Viewport Controls:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Left Click + Drag: Orbit camera</li>
              <li>Right Click + Drag: Pan stage</li>
              <li>Scroll Wheel: Zoom in / out</li>
            </ul>
          </div>
        </div>

        {/* CENTER VIEWPORT: Large 3D Viewport */}
        <div className="order-1 lg:order-2 space-y-3 w-full">
          <div className="relative rounded-xl border border-line bg-surface shadow-sm overflow-hidden h-[380px] sm:h-[460px] lg:h-[640px]">
            <DigitalTwinWorkspaceViewer
              frames={frames}
              activeArmId={activeArmId}
              activePairId={activePairId}
              layoutMode={layoutMode}
              onSelectArm={setActiveArmId}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* RIGHT SIDEBAR: Joint Telemetry, Sync Status, Inspector */}
        <div className="order-3 lg:order-3 flex flex-col rounded-xl border border-line bg-surface shadow-sm h-auto lg:h-[640px] max-h-[580px] lg:max-h-none overflow-hidden">
          {/* Tab Navigation Header */}
          <div className="grid grid-cols-4 border-b border-line bg-canvas/70 p-1.5 gap-1 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-surface text-sky-700 shadow-sm border border-line/70'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Container: Independent Scrolling */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Tab 1: Joints & Dual-Arm Synchronization Tracking */}
            {activeTab === 'joints' && (
              <JointStatePanel
                activeArmId={activeArmId}
                activeFrame={activeFrame}
                pairDelta={activePairDelta}
                isPairView={isPairView}
                leaderFrame={frames[leaderArmId]}
                followerFrame={frames[followerArmId]}
              />
            )}

            {/* Tab 2: Arms & Calibrated Joint Limits */}
            {activeTab === 'arms' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <h3 className="text-xs font-semibold text-ink">
                      Calibrated Joint Limits · {ARM_METADATA[activeArmId].shortLabel}
                    </h3>
                    <span className="text-2xs text-ink-subtle font-mono">so101_new_calib</span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-2xs">
                      <thead>
                        <tr className="border-b border-line text-ink-subtle">
                          <th className="pb-1.5 font-medium">Joint</th>
                          <th className="pb-1.5 font-medium">Range (°)</th>
                          <th className="pb-1.5 font-medium">Range (rad)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60 font-mono">
                        {SO101_NAMES.map((name) => {
                          const d = JOINT_DETAILS[name];
                          return (
                            <tr key={name} className="hover:bg-canvas/40">
                              <td className="py-1.5 font-sans font-medium text-ink">{d.label}</td>
                              <td className="py-1.5 text-ink-muted">
                                {name === 'gripper' ? '0..100%' : `[${d.lowerDeg}°, ${d.upperDeg}°]`}
                              </td>
                              <td className="py-1.5 text-ink-muted">
                                {name === 'gripper' ? '0..100%' : `[${d.lowerRad.toFixed(2)}, ${d.upperRad.toFixed(2)}]`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-canvas/60 p-4 text-xs text-ink-muted space-y-2">
                  <p className="font-semibold text-ink">Kinematic Bounds Enforcement:</p>
                  <p className="text-2xs leading-relaxed">
                    Joint angular ranges reflect physical calibration from <code>so101_new_calib.urdf</code>. Real follower execution respects these mechanical stops to prevent actuator over-extension.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 3: Telemetry Stream Diagnostics */}
            {activeTab === 'telemetry' && (
              <TelemetryStatsPanel
                mode="telemetry"
                activeArmId={activeArmId}
                stats={activeStats}
                frame={activeFrame}
                sourceType={sourceType}
                onSourceChange={setSourceType}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                motionPattern={motionPattern}
                onPatternChange={setMotionPattern}
                simSpeed={simSpeed}
                onSpeedChange={setSimSpeed}
                onSimulateDrop={() => simulateDrop(2000)}
                wsTransport={wsTransport}
                lastError={lastError}
                sessionId={sessionId}
                organizationId={organizationId}
                robotId={robotId}
                viewerScopeToken={viewerScopeToken}
              />
            )}

            {/* Tab 4: Settings & Adapter Configuration */}
            {activeTab === 'settings' && (
              <TelemetryStatsPanel
                mode="settings"
                activeArmId={activeArmId}
                stats={activeStats}
                frame={activeFrame}
                sourceType={sourceType}
                onSourceChange={setSourceType}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                motionPattern={motionPattern}
                onPatternChange={setMotionPattern}
                simSpeed={simSpeed}
                onSpeedChange={setSimSpeed}
                onSimulateDrop={() => simulateDrop(2000)}
                wsTransport={wsTransport}
                lastError={lastError}
                sessionId={sessionId}
                organizationId={organizationId}
                robotId={robotId}
                viewerScopeToken={viewerScopeToken}
              />
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM PANEL: Timeline, Events, Simulation Controls & MuJoCo Boundary Notice */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)] items-center">
          {/* Simulation Timeline Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Simulation Timeline:
            </span>

            {/* Play/Pause */}
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              disabled={sourceType !== 'mock'}
              className="flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface disabled:opacity-50"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5 text-amber-600" /> : <Play className="h-3.5 w-3.5 text-emerald-600" />}
              <span>{isPlaying ? 'Pause' : 'Resume'}</span>
            </button>

            {/* Trajectory Pattern */}
            <select
              value={motionPattern}
              onChange={(e) => setMotionPattern(e.target.value as any)}
              disabled={sourceType !== 'mock'}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-sky-500 focus:outline-none disabled:opacity-50"
            >
              <option value="pick_and_place">Routine: Tabletop Pick &amp; Place</option>
              <option value="wave">Routine: Harmonic Wave</option>
              <option value="mirroring">Routine: Teleop Mirroring</option>
            </select>

            {/* Speed Multipliers */}
            <div className="flex items-center gap-1">
              {[0.5, 1.0, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSimSpeed(s)}
                  disabled={sourceType !== 'mock'}
                  className={`rounded px-2 py-1 text-2xs font-bold ${
                    simSpeed === s ? 'bg-ink text-white' : 'bg-canvas text-ink-muted border border-line'
                  } disabled:opacity-50`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Test Stale Button */}
            <button
              type="button"
              onClick={() => simulateDrop(2000)}
              disabled={sourceType !== 'mock'}
              className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-2xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              title="Drops packets for 2 seconds to verify stale state behavior"
            >
              Test Stale (2s)
            </button>
          </div>

          {/* MuJoCo vs 3D URDF Clarification Notice */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 text-2xs text-sky-950 flex items-start gap-2">
            <Radio className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Physics Engine &amp; Rendering Boundary:</span> MuJoCo physics simulation runs independently on the Digital Twin backend service (<code>:8767</code>). This browser interface renders 3D kinematic URDF meshes via Three.js. Visual kinematics animation is decoupled from validated physical dynamics.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
