import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { initialActivity } from '../data/activity';
import { initialDatasets } from '../data/datasets';
import {
  capabilities as backendCapabilities,
  initialCameras,
  initialDevices,
  initialHeadset,
  initialOperatorDevices,
  initialPorts,
  initialServices
} from '../data/devices';
import { initialJobs, initialModels } from '../data/training';
import { initialWorkspaces } from '../data/workspaces';
import { backend, type BackendSnapshot, type BackendTask } from '../lib/backend';
import type {
  ActivityEvent,
  ArmSide,
  BackendCapabilities,
  CameraDevice,
  Dataset,
  EStopState,
  OperatorDevice,
  OperationProfile,
  RobotDevice,
  SerialPort,
  ServiceHealth,
  TeleopMode,
  TeleoperationSession,
  TrainedModel,
  TrainingJob,
  VRHeadset,
  WorkspaceProfile
} from '../types';

export interface Toast {
  id: string;
  title: string;
  detail?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

interface LabState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  capabilities: BackendCapabilities;
  simulated: boolean;
  backendOnline: boolean;
  motionEnabled: boolean;
  backendTask: BackendTask | null;
  runFindPort: () => void;
  stopBackendTask: () => void;
  runFindCameras: () => void;
  sendTaskInput: (value: '' | 'c') => void;
  startOfflineVR: () => void;
  startLeKiwiVR: (mode: 'left-only' | 'right-only' | 'dual-arm') => void;
  startRealVR: (
    translationScale: number,
    arm: ArmSide,
    responseProfile: 'smooth' | 'balanced' | 'fast'
  ) => void;

  workspaces: WorkspaceProfile[];
  workspace: WorkspaceProfile;
  setWorkspaceId: (id: string) => void;
  createWorkspace: (input: { name: string; description: string; mode: 'single' | 'dual' }) => void;
  updateWorkspace: (patch: Partial<WorkspaceProfile>) => void;
  saveWorkspace: () => void;

  devices: RobotDevice[];
  deviceById: (id: string) => RobotDevice | undefined;
  connectDevice: (id: string) => void;
  disconnectDevice: (id: string) => void;
  toggleTorque: (id: string) => void;
  calibrateDevice: (id: string) => void;

  ports: SerialPort[];
  scanPorts: () => void;
  scanning: boolean;
  assignPort: (deviceId: string, path: string | null, reassign?: boolean) => Promise<boolean>;

  cameras: CameraDevice[];
  reconnectCamera: (id: string) => void;

  services: ServiceHealth[];
  headset: VRHeadset;
  operatorDevices: OperatorDevice[];
  pairOperatorDevice: (id: string) => void;

  session: TeleoperationSession | null;
  startSession: (mode: TeleopMode, sides: ArmSide[]) => void;
  recoverSingleSession: (side: ArmSide) => void;
  recoverDualSession: () => void;
  operationProfile: OperationProfile;
  setOperationProfile: (profile: OperationProfile) => void;
  pauseSession: () => void;
  stopSession: () => void;
  setSync: (sync: 'independent' | 'mirror') => void;
  toggleSessionRecording: () => void;

  estop: EStopState;
  triggerEStop: () => void;
  resetEStop: () => void;

  datasets: Dataset[];
  activeDatasetId: string;
  setActiveDatasetId: (id: string) => void;
  createDataset: (input: {name: string;repoId: string | null;type: Dataset['type'];vrRecorded: boolean;}) => string;
  saveRecordedEpisode: (datasetId: string, input: {durationSec: number;cameras: number;vr: boolean;arms: 'left' | 'right' | 'dual';notes: string;}) => void;

  jobs: TrainingJob[];
  startJob: (job: Omit<TrainingJob, 'id' | 'losses' | 'logs'>) => string;
  stopJob: (id: string) => void;
  models: TrainedModel[];
  importModel: (source: string, displayName: string) => string;

  activity: ActivityEvent[];
  pushActivity: (e: Omit<ActivityEvent, 'id' | 'at'>) => void;

  telemetryMode: 'compact' | 'detailed';
  setTelemetryMode: (m: 'compact' | 'detailed') => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const LabContext = createContext<LabState | null>(null);

const jitter = (v: number, amp: number, min: number, max: number) =>
Math.max(min, Math.min(max, Number((v + (Math.random() - 0.5) * amp).toFixed(1))));

function loadLocalList<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function LabProvider({ children }: {children: React.ReactNode;}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaces[0].id);
  const [devices, setDevices] = useState<RobotDevice[]>(initialDevices);
  const [ports, setPorts] = useState<SerialPort[]>(initialPorts);
  const [backendOnline, setBackendOnline] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [backendTask, setBackendTask] = useState<BackendTask | null>(null);
  const [capabilities, setCapabilities] = useState(backendCapabilities);
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>(initialCameras);
  const [services, setServices] = useState<ServiceHealth[]>(initialServices);
  const [headset] = useState<VRHeadset>(initialHeadset);
  const [operatorDevices, setOperatorDevices] = useState(initialOperatorDevices);
  const [session, setSession] = useState<TeleoperationSession | null>(null);
  const [operationProfile, setOperationProfileState] = useState<OperationProfile>(() => {
    if (typeof window === 'undefined') return 'project';
    const saved = window.localStorage.getItem('lelab.operationProfile');
    return saved === 'exhibition' || saved === 'project' ? saved : 'project';
  });
  const [estop, setEstop] = useState<EStopState>('ready');
  const [datasets, setDatasets] = useState<Dataset[]>(() => loadLocalList('lelab.datasets', initialDatasets));
  const [activeDatasetId, setActiveDatasetId] = useState(() => {
    if (typeof window === 'undefined') return initialDatasets[0].id;
    return window.localStorage.getItem('lelab.activeDatasetId') || initialDatasets[0].id;
  });
  const [jobs, setJobs] = useState<TrainingJob[]>(initialJobs);
  const [models, setModels] = useState<TrainedModel[]>(() => loadLocalList('lelab.models', initialModels));
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const [telemetryMode, setTelemetryModeState] = useState<'compact' | 'detailed'>(() => {
    if (typeof window === 'undefined') return 'compact';
    return window.localStorage.getItem('lelab.telemetryMode') as 'compact' | 'detailed' || 'compact';
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const applySnapshot = useCallback((snapshot: BackendSnapshot) => {
    setBackendOnline(true);
    setMotionEnabled(snapshot.backend.motionEnabled);
    setBackendTask(snapshot.task);
    setEstop(snapshot.backend.latchedMotionLock ? 'active' : 'ready');
    setServices((current) => current.map((service) => {
      if (service.id === 'api') return { ...service, status: 'connected', latencyMs: null, lastCheck: 'just now' };
      if (service.id === 'ws') {
        const running = (snapshot.task?.kind === 'vr-offline' || snapshot.task?.kind === 'vr-real' || snapshot.task?.kind === 'vr-lekiwi') && snapshot.task.running;
        return { ...service, status: running ? 'connected' : 'offline', latencyMs: null, lastCheck: 'just now' };
      }
      return service;
    }));
    setCapabilities((current) => ({
      ...current,
      backendName: snapshot.backend.name,
      backendVersion: snapshot.backend.version,
      supportsVRControl: snapshot.backend.supportsVRControl,
    }));
    setPorts(snapshot.ports);
    setCameras((current) => current.map((camera, index) => {
      const live = snapshot.cameras[index];
      return live ? {
        ...camera,
        source: live.path,
        connection: live.connection === 'connected' ? 'connected' : 'offline',
        resolution: live.resolution,
        fps: live.fps,
      } : {
        ...camera,
        source: '',
        connection: 'unconfigured',
        resolution: null,
        fps: null,
      };
    }));
    setDevices((current) => current.map((device) => {
      const live = snapshot.devices.find((candidate) => candidate.id === device.id);
      if (!live) return device;
      // The worker publishes the commanded follower joints only after both
      // leaders and both followers have connected.  Therefore fresh
      // telemetry is also our positive readiness handshake for all four
      // buses, not just for the follower cards.
      const leaderTeleopLive = snapshot.task?.kind === 'leader-teleop' &&
        snapshot.task.running && Boolean(snapshot.telemetry);
      const singleTeleopLive = snapshot.task?.kind === `single-teleop-${device.side}` &&
        snapshot.task.running && Boolean(snapshot.telemetry?.[device.side]);
      const teleopLive = leaderTeleopLive || singleTeleopLive;
      const sideTelemetry = snapshot.telemetry?.[device.side] ?? null;
      const joints = sideTelemetry ? device.joints.map((joint) => ({
        ...joint,
        value: typeof sideTelemetry[joint.name] === 'number' ? sideTelemetry[joint.name] : joint.value,
      })) : device.joints;
      const gripper = sideTelemetry && typeof sideTelemetry.gripper === 'number'
        ? sideTelemetry.gripper
        : live.gripper;
      return {
        ...device,
        ...live,
        connection: teleopLive ? 'connected' : live.connection,
        torqueEnabled: teleopLive && device.role === 'follower' ? true : live.torqueEnabled,
        gripper,
        joints,
      } as RobotDevice;
    }));
  }, []);

  const refreshBackend = useCallback(async (quiet = false) => {
    try {
      applySnapshot(await backend.status());
    } catch (error) {
      setBackendOnline(false);
      setServices((current) => current.map((service) =>
        service.id === 'api' || service.id === 'ws' ? { ...service, status: 'offline', latencyMs: null } : service));
      if (!quiet) throw error;
    }
  }, [applySnapshot]);

  const calibrationPolling = backendTask?.running && backendTask.kind.startsWith('calibrate-');
  useEffect(() => {
    void refreshBackend(true);
    // Calibration encoder telemetry needs to feel live. Outside calibration we
    // keep the slower interval to avoid needless dashboard traffic.
    const timer = window.setInterval(() => void refreshBackend(true), calibrationPolling ? 120 : 1000);
    return () => window.clearInterval(timer);
  }, [refreshBackend, calibrationPolling]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.add('theme-transition');
    const t = window.setTimeout(() => root.classList.remove('theme-transition'), 260);
    return () => window.clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    if (datasets.length && !datasets.some((dataset) => dataset.id === activeDatasetId)) {
      setActiveDatasetId(datasets[0].id);
    }
  }, [datasets, activeDatasetId]);

  useEffect(() => {
    try {
      window.localStorage.setItem('lelab.datasets', JSON.stringify(datasets));
      window.localStorage.setItem('lelab.activeDatasetId', activeDatasetId);
      window.localStorage.setItem('lelab.models', JSON.stringify(models));
    } catch {
      /* Local persistence is optional; keep the in-memory state when storage is unavailable. */
    }
  }, [datasets, activeDatasetId, models]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t${++seq.current}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const postBackend = useCallback(async (path: string, body: Record<string, unknown> = {}) => {
    try {
      applySnapshot(await backend.post(path, body));
      return true;
    } catch (error) {
      toast({ title: 'Backend request failed', detail: error instanceof Error ? error.message : String(error), tone: 'danger' });
      return false;
    }
  }, [applySnapshot, toast]);

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const pushActivity = useCallback((e: Omit<ActivityEvent, 'id' | 'at'>) => {
    const now = new Date();
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setActivity((prev) => [{ ...e, id: `a${++seq.current}`, at }, ...prev].slice(0, 24));
  }, []);

  const setTelemetryMode = useCallback((m: 'compact' | 'detailed') => {
    setTelemetryModeState(m);
    try {
      window.localStorage.setItem('lelab.telemetryMode', m);
    } catch {

      /* storage unavailable — keep in-memory preference */}
  }, []);

  const setOperationProfile = useCallback((profile: OperationProfile) => {
    setOperationProfileState(profile);
    try {
      window.localStorage.setItem('lelab.operationProfile', profile);
    } catch {
      /* storage unavailable — keep in-memory preference */
    }
  }, []);

  /* ---- live telemetry while a session runs ---- */
  useEffect(() => {
    if (!session || session.state !== 'active') return;
    const active = new Set(session.sides);
    const interval = window.setInterval(() => {
      setDevices((prev) =>
      prev.map((d) => {
        if (!active.has(d.side) || d.connection !== 'connected') return d;
        return {
          ...d,
          joints: d.joints.map((j) =>
          j.value === null ?
          j :
          { ...j, value: jitter(j.value, j.unit === '%' ? 3 : 2.4, j.min, j.max) }
          ),
          gripper: d.gripper === null ? null : Math.round(jitter(d.gripper, 4, 0, 100)),
          temperatureC:
          d.temperatureC === null ? null : Math.round(jitter(d.temperatureC, 0.6, 30, 58))
        };
      })
      );
      setSession((s) =>
      s ? { ...s, latencyMs: Math.max(9, Math.round(jitter(s.latencyMs, 6, 9, 90))) } : s
      );
    }, 900);
    return () => window.clearInterval(interval);
  }, [session]);

  /* ---- training job progress ---- */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setJobs((prev) =>
      prev.map((j) => {
        if (j.status !== 'running') return j;
        const step = Math.min(j.totalSteps, j.step + 12);
        const loss = Number(Math.max(0.09, j.loss - Math.random() * 0.0015).toFixed(3));
        return {
          ...j,
          step,
          loss,
          etaMin: step >= j.totalSteps ? null : Math.max(1, Math.round((j.totalSteps - step) / 12 / 60)),
          status: step >= j.totalSteps ? 'completed' : 'running',
          losses:
          step % 120 < 12 ? [...j.losses.slice(-40), { step, loss }] : j.losses
        };
      })
      );
    }, 1500);
    return () => window.clearInterval(interval);
  }, []);

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? workspaces[0],
    [workspaces, workspaceId]
  );

  const updateWorkspace = useCallback(
    (patch: Partial<WorkspaceProfile>) => {
      setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, ...patch, dirty: true } : w)
      );
    },
    [workspaceId]
  );

  const createWorkspace = useCallback((input: { name: string; description: string; mode: 'single' | 'dual' }) => {
    const id = `ws-${Date.now()}`;
    const next: WorkspaceProfile = {
      id,
      name: input.name.trim() || 'New SO-101 workspace',
      description: input.description.trim(),
      updatedAt: 'Not saved',
      ports: { 'left-leader': null, 'left-follower': null, 'right-leader': null, 'right-follower': null },
      cameras: { overhead: null, 'left-wrist': null, 'right-wrist': null, front: null },
      vrHeadsetId: null,
      mobileCompanionId: null,
      preferredMode: input.mode,
      safety: { maxSpeedPct: 35, jointLimits: 'workspace-profile', onConnectionLoss: 'hold-position', sessionTimeoutMin: 30 },
      dirty: true,
    };
    setWorkspaces((current) => [...current, next]);
    setWorkspaceId(id);
    toast({ title: 'Workspace created', detail: next.name, tone: 'success' });
  }, [toast]);

  const saveWorkspace = useCallback(() => {
    setWorkspaces((prev) =>
    prev.map((w) =>
    w.id === workspaceId ? { ...w, dirty: false, updatedAt: 'Just now' } : w
    )
    );
    toast({ title: 'Workspace saved', detail: workspace.name, tone: 'success' });
  }, [workspaceId, workspace.name, toast]);

  const patchDevice = useCallback((id: string, patch: Partial<RobotDevice>) => {
    setDevices((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const connectDevice = useCallback(
    (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (!device) return;
      patchDevice(id, { connection: 'connecting' });
      window.setTimeout(() => {
        setDevices((prev) =>
        prev.map((d) =>
        d.id === id ?
        {
          ...d,
          connection: 'connected',
          torqueEnabled: d.torqueEnabled ?? false,
          temperatureC: d.temperatureC ?? 35,
          firmware: d.firmware ?? '1.4.2',
          gripper: d.gripper ?? 20,
          joints: d.joints.map((j, i) =>
          j.value === null ? { ...j, value: [-4.2, 30.5, 35.8, 2.1, 9.4, 20][i] } : j
          )
        } :
        d
        )
        );
        setPorts((prev) =>
        prev.map((p) => p.assignedTo === id ? { ...p, present: true, description: 'Feetech FT-SCS · USB serial' } : p)
        );
        pushActivity({ kind: 'device', message: `${device.name} connected on ${device.serialPort}`, severity: 'success' });
        toast({ title: `${device.name} connected`, detail: device.serialPort ?? undefined, tone: 'success' });
      }, 900);
    },
    [devices, patchDevice, pushActivity, toast]
  );

  const disconnectDevice = useCallback(
    (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (!device) return;
      patchDevice(id, { connection: 'offline', torqueEnabled: null, temperatureC: null });
      pushActivity({ kind: 'device', message: `${device.name} disconnected`, severity: 'warning' });
    },
    [devices, patchDevice, pushActivity]
  );

  const toggleTorque = useCallback(
    (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (!device || device.connection !== 'connected') return;
      const next = !device.torqueEnabled;
      patchDevice(id, { torqueEnabled: next });
      toast({
        title: next ? 'Torque engaged' : 'Torque released',
        detail: device.name,
        tone: next ? 'warning' : 'info'
      });
    },
    [devices, patchDevice, toast]
  );

  const calibrateDevice = useCallback(
    (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (!device) return;
      void postBackend('/api/tasks/calibrate', { deviceId: id, recalibrate: true }).then((ok) => {
        if (!ok) return;
        patchDevice(id, { calibration: 'calibrating' });
        pushActivity({ kind: 'calibration', message: `${device.name} calibration started`, severity: 'info' });
        toast({ title: `Calibration started: ${device.name}`, detail: 'Only this board will be calibrated.', tone: 'warning' });
      });
    },
    [devices, patchDevice, postBackend, pushActivity, toast]
  );

  const scanPorts = useCallback(() => {
    setScanning(true);
    void refreshBackend().then(() => {
      setScanning(false);
      toast({ title: 'Serial scan complete', tone: 'info' });
    }).catch((error) => {
      setScanning(false);
      toast({ title: 'Serial scan failed', detail: String(error), tone: 'danger' });
    });
  }, [refreshBackend, toast]);

  const assignPort = useCallback(async (deviceId: string, path: string | null, reassign = false) => {
    const ok = await postBackend('/api/ports/assign', { deviceId, port: path, reassign });
    if (ok) {
      setWorkspaces((prev) => prev.map((w) =>
        w.id === workspaceId ? { ...w, dirty: true, ports: { ...w.ports, [deviceId]: path } } : w));
    }
    return ok;
  }, [postBackend, workspaceId]);

  const reconnectCamera = useCallback(
    (id: string) => {
      setCameras((prev) => prev.map((c) => c.id === id ? { ...c, connection: 'connecting' } : c));
      void postBackend('/api/tasks/find-cameras').then((ok) => {
        if (ok) toast({ title: 'Camera scan complete', detail: 'Live V4L2 devices were probed again.', tone: 'success' });
      });
    },
    [postBackend, toast]
  );

  const pairOperatorDevice = useCallback(
    (id: string) => {
      setOperatorDevices((prev) =>
      prev.map((d) => d.id === id ? { ...d, connected: true, batteryPct: d.batteryPct ?? 55, detail: 'Paired on lab network' } : d)
      );
      toast({ title: 'Device paired', tone: 'success' });
    },
    [toast]
  );

  const startSession = useCallback(
    (mode: TeleopMode, sides: ArmSide[]) => {
      if (estop !== 'ready') {
        toast({ title: 'Emergency stop must be reset first', tone: 'danger' });
        return;
      }
      const path = mode === 'dual'
        ? '/api/tasks/leader-teleop'
        : mode === 'single'
          ? '/api/tasks/single-teleop'
          : mode === 'vr'
            ? '/api/tasks/vr-offline'
            : null;
      if (!path) {
        toast({ title: 'Use dual-arm or VR teleop for this workspace', tone: 'warning' });
        return;
      }
      if ((mode === 'dual' || mode === 'single') && !motionEnabled) {
        toast({ title: 'Real motion is locked', detail: 'Restart dashboard_server.py with --enable-motion after the workspace check passes.', tone: 'warning' });
        return;
      }
      if (mode === 'dual' && !window.confirm('REAL ROBOT MOTION\n\nClear the workspace, keep an E-stop ready, and confirm all four calibrated arms are assigned. Start now?')) return;
      if (mode === 'single' && !window.confirm(
        `REAL ${sides[0].toUpperCase()} ARM MOTION\n\nProfile: ${operationProfile}. Clear the workspace and keep an E-stop ready. Start now?`
      )) return;
      // Enter a visible, non-clickable startup state immediately. Connecting
      // four serial buses may take a while; without this state repeated clicks
      // launch duplicate requests and produce "task already running".
      setSession({
        id: `sess-starting-${Date.now()}`,
        mode,
        sides,
        state: 'starting',
        startedAt: Date.now(),
        latencyMs: 0,
        commandRateHz: mode === 'dual' ? 50 : 30,
        recording: false,
        sync: 'independent'
      });
      const requestBody = mode === 'dual'
        ? { confirmation: 'ENABLE MOTION', profile: operationProfile }
        : mode === 'single'
          ? { confirmation: 'ENABLE MOTION', side: sides[0], profile: operationProfile }
          : {};
      void postBackend(path, requestBody).then((ok) => {
        if (!ok) {
          setSession(null);
          return;
        }
        setSession({
        id: `sess-${Date.now()}`,
        mode,
        sides,
        state: 'active',
        startedAt: Date.now(),
        latencyMs: 20,
        commandRateHz: 50,
        recording: false,
        sync: 'independent'
        });
      pushActivity({
        kind: 'device',
        message: `${mode === 'dual' ? 'Dual-arm' : mode === 'vr' ? 'VR' : 'Single-arm'} teleoperation started (${sides.join(' + ')})`,
        severity: 'info'
      });
        toast(mode === 'dual'
          ? { title: 'Leader teleop active', detail: 'The 3D twins now follow the live bimanual command stream.', tone: 'success' }
          : mode === 'single'
            ? { title: 'Single-arm teleop active', detail: `${operationProfile} profile`, tone: 'success' }
            : { title: 'Offline VR bridge active', detail: 'No robot commands are sent.', tone: 'success' });
      });
    },
    [estop, motionEnabled, operationProfile, postBackend, pushActivity, toast]
  );

  const recoverSingleSession = useCallback((side: ArmSide) => {
    if (estop !== 'ready' || !motionEnabled) return;
    setSession((current) => current ? { ...current, state: 'starting' } : current);
    void postBackend('/api/tasks/single-teleop/recover', {
      confirmation: 'ENABLE MOTION',
      side,
      profile: operationProfile,
    }).then((ok) => {
      if (!ok) {
        setSession((current) => current ? { ...current, state: 'error' } : current);
        return;
      }
      setSession((current) => current ? {
        ...current,
        state: 'active',
        startedAt: Date.now(),
        latencyMs: 20,
      } : current);
      pushActivity({ kind: 'device', message: `${side} teleop recovered in place`, severity: 'success' });
      toast({
        title: 'Teleop recovered',
        detail: 'Follower held its current pose, the leader was re-based, and teleop is active again.',
        tone: 'success',
      });
    });
  }, [estop, motionEnabled, operationProfile, postBackend, pushActivity, toast]);

  const recoverDualSession = useCallback(() => {
    if (estop !== 'ready' || !motionEnabled) return;
    setSession((current) => current ? { ...current, state: 'starting' } : current);
    void postBackend('/api/tasks/leader-teleop/recover', {
      confirmation: 'ENABLE MOTION',
      profile: operationProfile,
    }).then((ok) => {
      if (!ok) {
        setSession((current) => current ? { ...current, state: 'error' } : current);
        return;
      }
      setSession((current) => current ? {
        ...current,
        state: 'active',
        startedAt: Date.now(),
        latencyMs: 20,
      } : current);
      pushActivity({ kind: 'device', message: 'Dual-arm teleop recovered in place', severity: 'success' });
      toast({
        title: 'Dual-arm teleop recovered',
        detail: 'Both followers held their poses, both leaders were re-based, and teleop is active again.',
        tone: 'success',
      });
    });
  }, [estop, motionEnabled, operationProfile, postBackend, pushActivity, toast]);

  const startRealVR = useCallback((
    translationScale: number,
    arm: ArmSide,
    responseProfile: 'smooth' | 'balanced' | 'fast'
  ) => {
    if (estop !== 'ready') {
      toast({ title: 'Emergency stop must be reset first', tone: 'danger' });
      return;
    }
    if (!motionEnabled) {
      toast({
        title: 'Real motion is locked',
        detail: 'Restart dashboard_server.py with --enable-motion after both followers are calibrated.',
        tone: 'warning'
      });
      return;
    }
    if (!window.confirm(
      `REAL VR ROBOT MOTION\n\nThe ${arm} follower will hold position after connecting. Clear the workspace, put that arm near a centered bent pose, keep an E-stop ready, and engage control only when ready. Start now?`
    )) return;
    void postBackend('/api/tasks/vr-real', {
      confirmation: 'ENABLE VR MOTION',
      translationScale,
      arm,
      responseProfile
    }).then((ok) => {
      if (!ok) return;
      setSession({
        id: `sess-${Date.now()}`,
        mode: 'vr',
        sides: [arm],
        state: 'active',
        startedAt: Date.now(),
        latencyMs: 20,
        commandRateHz: 60,
        recording: false,
        sync: 'independent'
      });
      pushActivity({ kind: 'device', message: `Real ${arm}-arm VR teleoperation started`, severity: 'warning' });
      toast({
        title: 'Real VR bridge starting',
        detail: 'Open the Quest WebXR page. Side-Grip is the deadman; Trigger closes the gripper.',
        tone: 'warning'
      });
    });
  }, [estop, motionEnabled, postBackend, pushActivity, toast]);

  const startLeKiwiVR = useCallback((mode: 'left-only' | 'right-only' | 'dual-arm') => {
    if (estop !== 'ready') {
      toast({ title: 'Emergency stop must be unlocked first', tone: 'danger' });
      return;
    }
    if (!motionEnabled || !window.confirm(
      `REAL VR LEKIWI MOTION\n\nCHECKIK will open the assigned ${mode} follower hardware. Confirm calibration, clear the workspace, keep E-stop ready, and start with a small clutch motion. Start now?`
    )) return;
    const sides: ArmSide[] = mode === 'dual-arm' ? ['left', 'right'] : [mode === 'left-only' ? 'left' : 'right'];
    setSession({
      id: `sess-starting-${Date.now()}`,
      mode: 'vr',
      sides,
      state: 'starting',
      startedAt: Date.now(),
      latencyMs: 0,
      commandRateHz: 60,
      recording: false,
      sync: 'independent',
    });
    void postBackend('/api/tasks/vr-lekiwi', { mode }).then((ok) => {
      if (!ok) {
        setSession(null);
        return;
      }
      setSession((current) => current ? { ...current, id: `sess-${Date.now()}`, state: 'active', latencyMs: 20 } : current);
      pushActivity({ kind: 'device', message: `VR LeKiwi ${mode} session started`, severity: 'info' });
      toast({ title: 'VR LeKiwi ready', detail: 'Open the operator URL in Quest Browser.', tone: 'success' });
    });
  }, [estop, motionEnabled, postBackend, pushActivity, toast]);

  const pauseSession = useCallback(() => {
    setSession((s) => s ? { ...s, state: s.state === 'paused' ? 'active' : 'paused' } : s);
  }, []);

  const stopSession = useCallback(() => {
    void postBackend('/api/tasks/stop');
    setSession(null);
    pushActivity({ kind: 'device', message: 'Teleoperation session stopped', severity: 'info' });
  }, [postBackend, pushActivity]);

  const setSync = useCallback((sync: 'independent' | 'mirror') => {
    setSession((s) => s ? { ...s, sync } : s);
  }, []);

  const toggleSessionRecording = useCallback(() => {
    setSession((s) => s ? { ...s, recording: !s.recording } : s);
  }, []);

  const triggerEStop = useCallback(() => {
    void postBackend('/api/estop');
    setEstop('active');
    setSession((s) => s ? { ...s, state: 'stopped' } : s);
    setDevices((prev) => prev.map((d) => d.torqueEnabled ? { ...d, torqueEnabled: false } : d));
    pushActivity({ kind: 'device', message: 'Emergency stop engaged — torque released on all arms', severity: 'danger' });
    toast({
      title: 'Emergency stop engaged',
      detail: 'Backend reported torque release. Verify the physical rig before resetting.',
      tone: 'danger'
    });
  }, [postBackend, pushActivity, toast]);

  const resetEStop = useCallback(() => {
    if (!window.confirm('UNLOCK MOTION\n\nRe-check assignment, calibration, device availability and process readiness now?')) return;
    const mode = backendTask?.mode ?? 'dual-arm';
    void postBackend('/api/unlock', { confirmation: 'UNLOCK MOTION', mode }).then((ok) => {
      if (!ok) return;
      setEstop('ready');
      setSession(null);
      toast({ title: 'Emergency stop unlocked', detail: 'Readiness checks passed; no process was started.', tone: 'success' });
    });
  }, [backendTask?.mode, postBackend, toast]);

  const startJob = useCallback(
    (job: Omit<TrainingJob, 'id' | 'losses' | 'logs'>) => {
      const id = `job-${Date.now()}`;
      setJobs((prev) => [
      {
        ...job,
        id,
        losses: [{ step: 0, loss: 1.42 }],
        logs: [`[now] Queued ${job.name} · ${job.policy} · ${job.compute}`]
      },
      ...prev]
      );
      pushActivity({ kind: 'training', message: `Training job ${job.name} started`, severity: 'info' });
      toast({ title: 'Training started', detail: job.name, tone: 'success' });
      return id;
    },
    [pushActivity, toast]
  );

  const stopJob = useCallback(
    (id: string) => {
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: 'stopped', etaMin: null } : j));
      toast({ title: 'Training stopped', tone: 'warning' });
    },
    [toast]
  );

  const createDataset = useCallback((input: {name: string;repoId: string | null;type: Dataset['type'];vrRecorded: boolean;}) => {
    const id = `ds-${Date.now()}`;
    const dataset: Dataset = {
      id,
      name: input.name.trim(),
      repoId: input.repoId?.trim() || null,
      type: input.type,
      episodes: 0,
      durationMin: 0,
      cameras: 0,
      sizeGb: 0,
      uploadStatus: 'local-only',
      vrRecorded: input.vrRecorded,
      lastModified: 'Just now',
      trainingReady: false,
      episodeList: []
    };
    setDatasets((current) => [dataset, ...current]);
    setActiveDatasetId(id);
    pushActivity({ kind: 'dataset', message: `Dataset ${dataset.name} created`, severity: 'success' });
    toast({ title: 'Dataset created', detail: 'Record episodes before starting training.', tone: 'success' });
    return id;
  }, [pushActivity, toast]);

  const importModel = useCallback((source: string, displayName: string) => {
    const id = `model-${Date.now()}`;
    const cleanSource = source.trim();
    const inferredName = cleanSource.split('/').filter(Boolean).pop() || 'imported_policy';
    const model: TrainedModel = {
      id,
      name: displayName.trim() || inferredName,
      policy: 'Imported policy',
      dataset: 'External / unknown',
      arms: 'Dual Arm',
      robot: 'SO-101',
      trainedAt: 'Imported just now',
      checkpoints: 1,
      location: cleanSource,
      uploaded: !cleanSource.startsWith('/') && cleanSource.includes('/'),
      cameras: 0
    };
    setModels((current) => [model, ...current]);
    pushActivity({ kind: 'model', message: `Model ${model.name} imported`, severity: 'success' });
    toast({ title: 'Model imported', detail: model.name, tone: 'success' });
    return id;
  }, [pushActivity, toast]);

  const saveRecordedEpisode = useCallback((datasetId: string, input: {durationSec: number;cameras: number;vr: boolean;arms: 'left' | 'right' | 'dual';notes: string;}) => {
    setDatasets((current) => current.map((dataset) => {
      if (dataset.id !== datasetId) return dataset;
      const nextIndex = dataset.episodes + 1;
      return {
        ...dataset,
        episodes: nextIndex,
        durationMin: Number((dataset.durationMin + input.durationSec / 60).toFixed(1)),
        cameras: Math.max(dataset.cameras, input.cameras),
        sizeGb: Number((dataset.sizeGb + input.durationSec * Math.max(1, input.cameras) * 0.00045).toFixed(2)),
        vrRecorded: dataset.vrRecorded || input.vr,
        lastModified: 'Just now',
        trainingReady: nextIndex >= 5,
        episodeList: [{
          id: `ep-${datasetId}-${Date.now()}`,
          index: nextIndex,
          durationSec: input.durationSec,
          recordedAt: 'Just now',
          arms: input.arms,
          vr: input.vr,
          cameras: input.cameras,
          quality: 'good',
          notes: input.notes || 'Nominal run.'
        }, ...dataset.episodeList]
      };
    }));
  }, []);

  const value: LabState = {
    theme,
    toggleTheme: () => setTheme((t) => t === 'dark' ? 'light' : 'dark'),
    capabilities,
    simulated: !backendOnline,
    backendOnline,
    motionEnabled,
    backendTask,
    runFindPort: () => { void postBackend('/api/tasks/find-port'); },
    stopBackendTask: () => { void postBackend('/api/tasks/stop'); },
    runFindCameras: () => { void postBackend('/api/tasks/find-cameras'); },
    sendTaskInput: (value) => { void postBackend('/api/tasks/input', { value }); },
    startOfflineVR: () => { void postBackend('/api/tasks/vr-offline'); },
    startLeKiwiVR,
    startRealVR,
    workspaces,
    workspace,
    setWorkspaceId,
    createWorkspace,
    updateWorkspace,
    saveWorkspace,
    devices,
    deviceById: (id) => devices.find((d) => d.id === id),
    connectDevice,
    disconnectDevice,
    toggleTorque,
    calibrateDevice,
    ports,
    scanPorts,
    scanning,
    assignPort,
    cameras,
    reconnectCamera,
    services,
    headset,
    operatorDevices,
    pairOperatorDevice,
    session,
    startSession,
    recoverSingleSession,
    recoverDualSession,
    operationProfile,
    setOperationProfile,
    pauseSession,
    stopSession,
    setSync,
    toggleSessionRecording,
    estop,
    triggerEStop,
    resetEStop,
    datasets,
    activeDatasetId,
    setActiveDatasetId,
    createDataset,
    saveRecordedEpisode,
    jobs,
    startJob,
    stopJob,
    models,
    importModel,
    activity,
    pushActivity,
    telemetryMode,
    setTelemetryMode,
    toasts,
    toast,
    dismissToast
  };

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab(): LabState {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error('useLab must be used inside LabProvider');
  return ctx;
}
