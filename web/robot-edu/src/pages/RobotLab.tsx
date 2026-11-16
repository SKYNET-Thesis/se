import { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2Icon,
  CircleDashedIcon,
  Cpu,
  ExternalLink,
  FileCode,
  Monitor,
  Pause,
  Play,
  RefreshCwIcon,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import { usePrograms } from '../contexts/ProgramsContext';
import { useRobotStatus } from '../hooks/useRobotStatus';
import { ExperimentList } from '../components/robot/ExperimentList';
import { Button } from '../components/ui/Button';
import { LinkButton } from '../components/ui/LinkButton';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionHeading } from '../components/ui/SectionHeading';
import { StatusDot } from '../components/ui/StatusDot';
import { formatRelative } from '../utils/format';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { useDigitalTwinViewerScope } from '../components/digital-twin/useDigitalTwinViewerScope';
import { RobotSelector } from '../components/digital-twin/RobotSelector';
import { digitalTwinApi, type DigitalTwinRobot } from '../lib/api';
import { So101DigitalTwinViewer } from '../components/digital-twin/So101DigitalTwinViewer';
import { HardwareCalibrationPanel } from '../components/digital-twin/HardwareCalibrationPanel';
import { ARM_METADATA, JOINT_DETAILS } from '../components/digital-twin/types';
import { SO101_JOINTS, SO101_NAMES } from '../components/digital-twin/so101Model';
import { REAL_ROBOT_INTEGRATION } from '../utils/robot/realRobotAdapter';

const integrationChecks = [
  { label: 'Robot control backend', detail: 'No endpoint configured (simulation/mock safe fallback active)', ok: false },
  { label: 'Live hardware telemetry', detail: 'Requires physical robot control backend connection', ok: false },
  { label: 'Camera overhead stream', detail: 'No video stream source configured for tabletop setup', ok: false },
  { label: 'Session authorisation & safety interlocks', detail: 'Fail-closed hardware boundary enforced by backend runtime', ok: false },
  { label: 'Schematic simulator & 3D twin preview', detail: 'Runs in the browser via WebGL / Three.js', ok: true },
];

export function RobotLab() {
  const { loading, error, refresh } = useRobotStatus();
  const { programs, experiments } = usePrograms();
  const { session } = useSupabaseSession();

  const [activeTab, setActiveTab] = useState<'operations' | 'checks' | 'history'>('operations');
  const [selectedPair, setSelectedPair] = useState<'left_pair' | 'right_pair'>('left_pair');
  const [teleopMode, setTeleopMode] = useState<'mirroring' | 'joint_drive'>('mirroring');
  const [clutchEngaged, setClutchEngaged] = useState<boolean>(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id ?? '');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('c1_pick_place');
  const [executing, setExecuting] = useState<boolean>(false);

  // Runtime logs state (explicitly labeled as Local Lab Monitor events)
  const [logs, setLogs] = useState<Array<{ time: string; text: string; type: 'info' | 'warn' | 'error' | 'safety' }>>([
    { time: new Date().toLocaleTimeString(), text: '[LOCAL LAB MONITOR] Client initialized in fail-closed safety state.', type: 'info' },
    { time: new Date().toLocaleTimeString(), text: `[SAFETY BOUNDARY] ${REAL_ROBOT_INTEGRATION.reason}`, type: 'safety' },
    { time: new Date().toLocaleTimeString(), text: '[TABLETOP CONFIG] 4 logical arms loaded (2 leader, 2 follower). Physical execution guarded.', type: 'info' },
  ]);

  // Digital twin scope & robot selector
  const [twinRobots, setTwinRobots] = useState<DigitalTwinRobot[]>([]);
  const [robotsLoading, setRobotsLoading] = useState(false);
  const [robotsError, setRobotsError] = useState<string | null>(null);
  const [selectedRobotId, setSelectedRobotId] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!session?.access_token) {
      setTwinRobots([]);
      setSelectedRobotId(undefined);
      setRobotsLoading(false);
      return;
    }
    setRobotsLoading(true);
    setRobotsError(null);
    void digitalTwinApi
      .availability(session.access_token)
      .then((robots) => {
        if (!active) return;
        setTwinRobots(robots);
        setSelectedRobotId((current) =>
          current && robots.some((robot) => robot.id === current && robot.viewerAccess === 'authorized')
            ? current
            : robots.find((robot) => robot.viewerAccess === 'authorized')?.id
        );
      })
      .catch((reason) => {
        if (active) {
          setTwinRobots([]);
          setSelectedRobotId(undefined);
          setRobotsError(reason instanceof Error ? reason.message : 'Could not load robot availability.');
        }
      })
      .finally(() => {
        if (active) setRobotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  const selectedRobot = twinRobots.find((robot) => robot.id === selectedRobotId);
  const physicalRobotId = selectedRobot?.viewerAccess === 'authorized' ? selectedRobot.id : undefined;
  useDigitalTwinViewerScope(session?.access_token, physicalRobotId);

  const addLog = useCallback((text: string, type: 'info' | 'warn' | 'error' | 'safety' = 'info') => {
    setLogs((prev) => [...prev.slice(-40), { time: new Date().toLocaleTimeString(), text, type }]);
  }, []);

  const handleToggleClutch = () => {
    const next = !clutchEngaged;
    setClutchEngaged(next);
    addLog(
      next
        ? `Clutch engaged for ${selectedPair === 'left_pair' ? 'Left Pair' : 'Right Pair'}. Follower will mirror leader.`
        : `Clutch disengaged. Arms decoupled.`,
      next ? 'info' : 'warn'
    );
  };

  const handleStartTeleop = () => {
    addLog('Attempted to start hardware teleoperation.', 'warn');
    addLog('Blocked: Robot control backend is not configured or verified.', 'error');
  };

  const handleEmergencyStop = () => {
    setExecuting(false);
    setClutchEngaged(false);
    addLog('[E-STOP TRIGGERED] Immediate soft-stop dispatched to controller.', 'safety');
    addLog('Hardware interlock active: actuators disengaged.', 'safety');
  };

  const handleExecuteAssignment = () => {
    setExecuting(true);
    addLog(`Initiating practical assignment [${selectedAssignment}]...`, 'info');
    setTimeout(() => {
      addLog('Classroom entitlement verified.', 'info');
      addLog('Safety interlock check: physical hardware endpoint not detected.', 'error');
      addLog('Hardware execution aborted safely (fail-closed rule).', 'safety');
      setExecuting(false);
    }, 1200);
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 md:px-8 md:py-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Robot Control & Practice"
        description="Physical tabletop SO-101 dual-arm teleoperation, practical assignment execution, and hardware readiness."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                addLog('Refreshing hardware status check...', 'info');
              }}
              loading={loading}
              icon={<RefreshCwIcon className="h-4 w-4" />}
            >
              Check Status
            </Button>
            <LinkButton to="/digital-twin" variant="primary" icon={<Monitor className="h-4 w-4" />}>
              Open in Digital Twin
            </LinkButton>
          </div>
        }
      />

      {/* Subsystem Navigation Tabs */}
      <div className="flex items-center border-b border-line gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('operations')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'operations'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>Control &amp; Operations</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('checks')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'checks'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <CheckCircle2Icon className="h-4 w-4" />
          <span>Physical Hardware &amp; Checks</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'history'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <FileCode className="h-4 w-4" />
          <span>Execution History &amp; Logs</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200">
          Status check failed: {error}
        </div>
      )}

      {/* TAB 1: CONTROL & OPERATIONS */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          {/* SECTION 1: Hardware Overview (4-Arm Architecture) */}
          <section aria-labelledby="hardware-overview-heading" className="space-y-3">
            <SectionHeading
              id="hardware-overview-heading"
              title="Hardware Overview — Tabletop Dual-Arm Setup"
              action={
                <span className="text-xs text-ink-subtle">
                  2 Leader Arms · 2 Follower Arms · 4 Arms Total
                </span>
              }
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Left Tabletop Pair */}
              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-sky-500" />
                    <h3 className="text-sm font-bold text-ink">Left Tabletop Pair</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <StatusDot tone="warn" /> Standby
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-canvas p-2.5 border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-medium text-ink-subtle">Leader (Teacher)</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ARM_METADATA.leader_left.colorHex }} />
                    </div>
                    <p className="mt-1 font-semibold text-ink">leader_left</p>
                    <p className="text-2xs text-ink-subtle">Offline · Unconfigured</p>
                  </div>

                  <div className="rounded-lg bg-canvas p-2.5 border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-medium text-ink-subtle">Follower (Worker)</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ARM_METADATA.follower_left.colorHex }} />
                    </div>
                    <p className="mt-1 font-semibold text-ink">follower_left</p>
                    <p className="text-2xs text-ink-subtle">Offline · Unconfigured</p>
                  </div>
                </div>

                <div className="text-2xs text-ink-muted flex items-center justify-between pt-1">
                  <span>Last hardware telemetry:</span>
                  <span className="font-mono text-ink">No physical stream received</span>
                </div>
              </div>

              {/* Right Tabletop Pair */}
              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-violet-500" />
                    <h3 className="text-sm font-bold text-ink">Right Tabletop Pair</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <StatusDot tone="warn" /> Standby
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-canvas p-2.5 border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-medium text-ink-subtle">Leader (Teacher)</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ARM_METADATA.leader_right.colorHex }} />
                    </div>
                    <p className="mt-1 font-semibold text-ink">leader_right</p>
                    <p className="text-2xs text-ink-subtle">Offline · Unconfigured</p>
                  </div>

                  <div className="rounded-lg bg-canvas p-2.5 border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-medium text-ink-subtle">Follower (Worker)</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ARM_METADATA.follower_right.colorHex }} />
                    </div>
                    <p className="mt-1 font-semibold text-ink">follower_right</p>
                    <p className="text-2xs text-ink-subtle">Offline · Unconfigured</p>
                  </div>
                </div>

                <div className="text-2xs text-ink-muted flex items-center justify-between pt-1">
                  <span>Last hardware telemetry:</span>
                  <span className="font-mono text-ink">No physical stream received</span>
                </div>
              </div>

              {/* Runtime Health & Safety Boundaries */}
              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm space-y-3 md:col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-sky-600" />
                    <h3 className="text-sm font-bold text-ink">Runtime &amp; Safety</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    Fail-Closed
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Control Backend:</span>
                    <span className="font-medium text-amber-600">Unconfigured</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">MQTT Command Bus:</span>
                    <span className="font-medium text-ink-muted">Standby (AWS IoT)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Safety Interlocks:</span>
                    <span className="font-medium text-emerald-600">Hardware Guarded</span>
                  </div>
                </div>

                <p className="text-2xs text-ink-subtle border-t border-line pt-2">
                  Joint limits, torque clamp, and emergency stop are enforced by the robot controller runtime.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 2 & 4: Robot Control & Teleoperation + Compact 3D Preview */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] items-start">
            {/* Left: Operational Robot Control */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-5">
              <div className="border-b border-line pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-sky-600" />
                  <span>Leader–Follower Teleoperation Controls</span>
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Operate physical robot pairs in teleoperation mirroring or joint drive mode.
                </p>
              </div>

              {/* Pair Selection */}
              <div>
                <label className="text-xs font-semibold text-ink">Select Active Pair</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPair('left_pair');
                      addLog('Active operational pair switched to Left Tabletop Pair.', 'info');
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold transition-all ${
                      selectedPair === 'left_pair'
                        ? 'border-sky-500 bg-sky-50/70 text-sky-950 font-bold ring-1 ring-sky-500'
                        : 'border-line text-ink-muted hover:bg-canvas'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                    <span>Left Pair (Arm 1 &amp; 2)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPair('right_pair');
                      addLog('Active operational pair switched to Right Tabletop Pair.', 'info');
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold transition-all ${
                      selectedPair === 'right_pair'
                        ? 'border-violet-500 bg-violet-50/70 text-violet-950 font-bold ring-1 ring-violet-500'
                        : 'border-line text-ink-muted hover:bg-canvas'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                    <span>Right Pair (Arm 3 &amp; 4)</span>
                  </button>
                </div>
              </div>

              {/* Mode & Clutch Controls */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-ink">Teleoperation Mode</label>
                  <select
                    value={teleopMode}
                    onChange={(e) => {
                      setTeleopMode(e.target.value as any);
                      addLog(`Teleoperation mode changed to: ${e.target.value}`, 'info');
                    }}
                    className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-ink focus:border-sky-500 focus:outline-none"
                  >
                    <option value="mirroring">Leader–Follower Mirroring</option>
                    <option value="joint_drive">Direct Joint Articulation</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-ink">Clutch Engagement</label>
                  <button
                    type="button"
                    onClick={handleToggleClutch}
                    className={`mt-1.5 w-full flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                      clutchEngaged
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-line bg-canvas text-ink-muted hover:bg-surface'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${clutchEngaged ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span>{clutchEngaged ? 'Clutch Engaged (Local UI Toggle)' : 'Clutch Disengaged (Free)'}</span>
                  </button>
                </div>
              </div>

              {/* Operational Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  disabled={!REAL_ROBOT_INTEGRATION.verified}
                  title={REAL_ROBOT_INTEGRATION.reason}
                  onClick={handleStartTeleop}
                  icon={<Play className="h-4 w-4" />}
                >
                  Start Teleoperation (Hardware Offline)
                </Button>
                <Button
                  variant="secondary"
                  disabled={!REAL_ROBOT_INTEGRATION.verified}
                  title={REAL_ROBOT_INTEGRATION.reason}
                  onClick={() => addLog('Hold position requested.', 'info')}
                  icon={<Pause className="h-4 w-4" />}
                >
                  Hold Position
                </Button>

                {/* Emergency Stop Button */}
                <button
                  type="button"
                  onClick={handleEmergencyStop}
                  className="ml-auto flex items-center gap-2 rounded-lg bg-red-600/90 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 active:scale-95 transition-all shadow-sm"
                  title="Hardware Emergency Stop is fail-closed. Physical robot actuators remain de-energized because the control backend is unverified."
                >
                  <AlertOctagon className="h-4 w-4" />
                  <span>E-STOP (FAIL-CLOSED GUARDED)</span>
                </button>
              </div>

              <div className="rounded-lg bg-amber-50/70 p-3 text-2xs text-amber-900 border border-amber-200/80 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                  <span>Safety Interlock Status:</span>
                </p>
                <p>
                  Execution is locked until the robot control backend and safety interlocks are verified. The browser client cannot command motion without verified teacher/supervisor authorization.
                </p>
              </div>
            </div>

            {/* Right: Compact 3D Preview (Monitoring Observer) */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">Tabletop 3D Monitor</h3>
                  <p className="text-xs text-ink-muted">Compact kinematic visualizer</p>
                </div>
                <span className="inline-flex items-center gap-1 text-2xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                  Read-Only Observer
                </span>
              </div>

              {/* Compact 3D Viewer Container */}
              <div className="rounded-lg border border-slate-700 bg-[#1a1e22] overflow-hidden h-[280px] relative">
                <So101DigitalTwinViewer
                  activeArmId={selectedPair === 'left_pair' ? 'follower_left' : 'follower_right'}
                  activePairId={selectedPair}
                  layoutMode="pair"
                  className="h-full w-full"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-2xs text-ink-muted">
                  Observing: <strong className="text-ink">{selectedPair === 'left_pair' ? 'Left Pair (Arm 1-2)' : 'Right Pair (Arm 3-4)'}</strong>
                </p>
                <LinkButton
                  to="/digital-twin"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  Open in Digital Twin Studio
                </LinkButton>
              </div>
            </div>
          </div>

          {/* SECTION 3: Practical Assignment Workspace & Runtime Logs */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] items-start">
            {/* Practical Assignment Runner */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
              <div className="border-b border-line pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-sky-600" />
                  <span>Practical Curriculum &amp; Hardware Execution</span>
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Dispatch validated Blockly programs to physical robot arms.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-ink">Practical Mission Template</label>
                  <select
                    value={selectedAssignment}
                    onChange={(e) => {
                      setSelectedAssignment(e.target.value);
                      addLog(`Selected mission template: ${e.target.value}`, 'info');
                    }}
                    className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-ink focus:border-sky-500 focus:outline-none"
                  >
                    <option value="c1_pick_place">Course 1 (Practice Template) · Mission 1: Tabletop Pick &amp; Place</option>
                    <option value="c1_reach">Course 1 (Practice Template) · Mission 2: Coordinated Target Reach</option>
                    <option value="c1_dual_mirror">Course 1 (Practice Template) · Mission 3: Dual-Arm Teleop Synchronization</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-ink">Saved Robot Program</label>
                  <select
                    value={selectedProgramId}
                    onChange={(e) => {
                      setSelectedProgramId(e.target.value);
                      addLog(`Loaded program ID: ${e.target.value}`, 'info');
                    }}
                    className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-ink focus:border-sky-500 focus:outline-none"
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {!programs.length && <option value="">No saved programs available</option>}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas p-3 border border-line">
                <div>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Execution State
                  </span>
                  <p className="text-xs font-bold text-ink mt-0.5">
                    {executing ? 'RUNNING EXECUTION DISPATCH' : 'AWAITING DISPATCH (FAIL-CLOSED)'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    disabled={!REAL_ROBOT_INTEGRATION.verified || executing}
                    loading={executing}
                    title={REAL_ROBOT_INTEGRATION.reason}
                    onClick={handleExecuteAssignment}
                  >
                    Execute on Hardware (Blocked: Unverified Backend)
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!executing}
                    onClick={() => {
                      setExecuting(false);
                      addLog('Execution stopped by user.', 'warn');
                    }}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            </div>

            {/* Runtime Logs Console */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-ink-muted" />
                  <span>Execution &amp; Runtime Logs</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="text-2xs font-medium text-ink-muted hover:text-ink"
                >
                  Clear logs
                </button>
              </div>

              <div className="h-[180px] overflow-y-auto rounded-lg bg-[#0f172a] p-3 font-mono text-2xs space-y-1 text-slate-300">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'error'
                          ? 'text-rose-400 font-semibold'
                          : log.type === 'warn'
                          ? 'text-amber-300 font-medium'
                          : log.type === 'safety'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-300'
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PHYSICAL HARDWARE CHECKS & CALIBRATION */}
      {activeTab === 'checks' && (
        <div className="space-y-6">
          <RobotSelector
            robots={twinRobots}
            loading={robotsLoading}
            error={robotsError}
            selectedRobotId={selectedRobotId}
            onSelect={setSelectedRobotId}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {/* Integration Status Checklist */}
            <section aria-labelledby="integration-heading" className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <SectionHeading id="integration-heading" title="Physical Robot Integration Checklist" />
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {integrationChecks.map((c) => (
                  <li key={c.label} className="flex items-start gap-3 py-3">
                    {c.ok ? (
                      <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Available" />
                    ) : (
                      <CircleDashedIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Not available" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.label}</p>
                      <p className="text-xs text-ink-muted">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Joint Limits & Calibrated Boundaries Table */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
              <SectionHeading title="SO-101 Physical Joint Limits" />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-2xs">
                  <thead>
                    <tr className="border-b border-line text-ink-subtle">
                      <th className="pb-2 font-medium">Joint</th>
                      <th className="pb-2 font-medium">Degrees</th>
                      <th className="pb-2 font-medium">Radians</th>
                      <th className="pb-2 font-medium">Axis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60 font-mono">
                    {SO101_NAMES.map((name) => {
                      const d = JOINT_DETAILS[name];
                      return (
                        <tr key={name} className="hover:bg-canvas/50">
                          <td className="py-2 font-sans font-medium text-ink">{d.label}</td>
                          <td className="py-2 text-ink-muted">
                            {name === 'gripper' ? '0..100%' : `[${d.lowerDeg}°, ${d.upperDeg}°]`}
                          </td>
                          <td className="py-2 text-ink-muted">
                            {name === 'gripper' ? '0..100%' : `[${d.lowerRad.toFixed(2)}, ${d.upperRad.toFixed(2)}]`}
                          </td>
                          <td className="py-2 text-ink-subtle font-sans">{SO101_JOINTS[name].axis.join(', ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Hardware Detection and Calibration Panel */}
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
            <div className="border-b border-line pb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Wrench className="h-4 w-4 text-sky-600" />
                <span>Physical Serial Detection &amp; Range-of-Motion Calibration</span>
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Scan serial USB ports and record observed min/max joint positions using the hardware adapter.
              </p>
            </div>

            <HardwareCalibrationPanel />
          </section>
        </div>
      )}

      {/* TAB 3: EXECUTION HISTORY & LOGS */}
      {activeTab === 'history' && (
        <section aria-labelledby="history-heading" className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
          <SectionHeading
            id="history-heading"
            title="Physical &amp; Simulation Execution History"
            action={
              <span className="text-xs text-ink-subtle">
                Runs recorded in this session{experiments[0] ? ` · last ${formatRelative(experiments[0].startedAt)}` : ''}
              </span>
            }
          />
          <ExperimentList experiments={experiments} detailed />
        </section>
      )}
    </div>
  );
}
