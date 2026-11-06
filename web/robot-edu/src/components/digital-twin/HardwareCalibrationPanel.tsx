import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CameraIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';

export type DeviceRole = 'LEADER' | 'FOLLOWER';

export interface ProgressEventPayload {
  device_id: string;
  device_role: DeviceRole;
  session_id: string;
  joint_name: string;
  current_position: number;
  observed_min: number;
  observed_max: number;
  expected_min: number | null;
  expected_max: number | null;
  coverage_percentage: number | null;
  status: 'CONNECTING' | 'RECORDING' | 'REVIEW' | 'COMPLETE' | 'CANCELLED' | 'ERROR';
  timestamp: string;
}

export interface DetectionState {
  id: string;
  phase: 'UNPLUG' | 'RECONNECT' | 'CONFIRM' | 'CANCELLED' | 'EXPIRED';
  disconnected_port?: { device: string };
  candidate?: { device: string; serial_number?: string; description?: string };
  confirmed_port?: { device: string };
}

const DEFAULT_ADAPTER_URL = 'http://127.0.0.1:8771';
const adapterBaseUrl = (((import.meta as any).env?.VITE_ROBOT_HARDWARE_ADAPTER_URL as string | undefined) || DEFAULT_ADAPTER_URL).replace(/\/$/, '');

const SO101_ORDER = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
] as const;

const JOINT_LABELS: Record<string, string> = {
  shoulder_pan: 'Shoulder Pan',
  shoulder_lift: 'Shoulder Lift',
  elbow_flex: 'Elbow Flex',
  wrist_flex: 'Wrist Flex',
  wrist_roll: 'Wrist Roll',
  gripper: 'Gripper',
};

async function apiRequest<T>(path: string, token?: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${adapterBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail ?? `Adapter request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function HardwareCalibrationPanel({
  robotId,
  onClose,
  onTransitionToVisual,
}: {
  robotId?: string;
  onClose?: () => void;
  onTransitionToVisual?: () => void;
}) {
  // Operator credentials and config
  const [token, setToken] = useState('');
  const [role, setRole] = useState<DeviceRole>('LEADER');
  const [deviceId, setDeviceId] = useState('so101-leader-arm');
  const [port, setPort] = useState('/dev/ttyACM1');
  const [profileId, setProfileId] = useState('Teleop');
  const [overwrite, setOverwrite] = useState(false);

  // Advanced collapsible
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Existing profiles inspection
  const [profiles, setProfiles] = useState<{ leader: string[]; follower: string[] }>({ leader: [], follower: [] });

  // Port detection modal state
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [detection, setDetection] = useState<DetectionState | null>(null);
  const [detectionPolling, setDetectionPolling] = useState(false);

  // Calibration session state
  const [calibActive, setCalibActive] = useState(false);
  const [calibStatus, setCalibStatus] = useState<string>('idle');
  const [calibId, setCalibId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [progressByJoint, setProgressByJoint] = useState<Record<string, ProgressEventPayload>>({});
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  // UI state
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [camerasOn, setCamerasOn] = useState(false);

  const pollIntervalRef = useRef<number | null>(null);

  // Update default deviceId when role changes
  const handleRoleChange = (newRole: DeviceRole) => {
    setRole(newRole);
    if (newRole === 'LEADER') {
      setDeviceId('so101-leader-arm');
      setPort('/dev/ttyACM1');
    } else {
      setDeviceId('so101-follower-arm');
      setPort('/dev/ttyACM0');
    }
  };

  // Fetch available profiles on mount or token update
  const fetchProfiles = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ leader: string[]; follower: string[] }>('/v1/profiles', token);
      setProfiles(data);
    } catch {
      // offline or unauthenticated
    }
  }, [token]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // Calibration status polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollCalibrationStatus = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{
        active: boolean;
        id?: string;
        status?: { status: string; message?: string };
        review_ready?: boolean;
        progress_by_joint?: Record<string, ProgressEventPayload>;
      }>('/v1/calibrations/current', token);

      if (!data.active) {
        setCalibActive(false);
        setCalibStatus('idle');
        stopPolling();
        return;
      }

      setCalibActive(true);
      setCalibId(data.id ?? null);
      setCalibStatus(data.status?.status ?? 'recording');
      setReviewMode(Boolean(data.review_ready));

      if (data.progress_by_joint) {
        setProgressByJoint(data.progress_by_joint);
      }
    } catch (err) {
      // transient network error
    }
  }, [token, stopPolling]);

  useEffect(() => {
    if (calibActive) {
      pollIntervalRef.current = window.setInterval(() => {
        void pollCalibrationStatus();
      }, 300);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [calibActive, pollCalibrationStatus, stopPolling]);

  // Port detection actions
  const startPortDetection = async () => {
    if (!token || !deviceId) {
      setErrorMessage('Please provide an operator session and device ID in Advanced settings before finding port.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const session = await apiRequest<DetectionState>('/v1/detection', token, 'POST', {
        device_id: deviceId,
        device_role: role,
      });
      setDetection(session);
      setDetectionOpen(true);
      setDetectionPolling(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to begin port detection');
    } finally {
      setBusy(false);
    }
  };

  const handleUnplugStep = async () => {
    if (!detection || !token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const next = await apiRequest<DetectionState>(`/v1/detection/${detection.id}/unplug`, token, 'POST');
      setDetection(next);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unplug capture failed. Ensure exactly one device was disconnected.');
    } finally {
      setBusy(false);
    }
  };

  const handleReconnectStep = async () => {
    if (!detection || !token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const next = await apiRequest<DetectionState>(`/v1/detection/${detection.id}/reconnect`, token, 'POST');
      setDetection(next);
    } catch (err: any) {
      setErrorMessage(err.message || 'Reconnect capture failed. Ensure the same device was reconnected.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPort = async () => {
    if (!detection || !token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const confirmed = await apiRequest<DetectionState>(`/v1/detection/${detection.id}/confirm`, token, 'POST');
      if (confirmed.confirmed_port) {
        setPort(confirmed.confirmed_port.device);
      }
      setDetectionOpen(false);
      setDetection(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Port confirmation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelDetection = async () => {
    if (detection && token) {
      try {
        await apiRequest(`/v1/detection/${detection.id}/cancel`, token, 'POST');
      } catch {
        // ignore
      }
    }
    setDetectionOpen(false);
    setDetection(null);
    setDetectionPolling(false);
  };

  // Calibration lifecycle actions
  const startCalibration = async () => {
    if (!token || !deviceId || !robotId || !port) {
      setErrorMessage('Missing required parameters: token, device ID, robot ID, or confirmed port.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setSavedSuccess(null);
    try {
      const result = await apiRequest<{ id: string; status: any }>('/v1/calibrations', token, 'POST', {
        robot_id: robotId,
        device_id: deviceId,
        device_role: role,
        profile_id: profileId,
        overwrite,
      });
      setCalibId(result.id);
      setCalibActive(true);
      setCalibStatus('recording');
      setReviewMode(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start calibration.');
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async () => {
    if (!token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await apiRequest('/v1/calibrations/current/review', token, 'POST');
      setReviewMode(true);
      setCalibStatus('review');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to enter review mode.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await apiRequest('/v1/calibrations/current/save', token, 'POST', { confirm: true });
      setCalibActive(false);
      setCalibStatus('completed');
      setReviewMode(false);
      setSavedSuccess(profileId);
      void fetchProfiles();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save calibration.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelCalibration = async () => {
    if (!token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await apiRequest('/v1/calibrations/current/cancel', token, 'POST');
      setCalibActive(false);
      setCalibStatus('cancelled');
      setReviewMode(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel calibration.');
    } finally {
      setBusy(false);
    }
  };

  const hasLeaderCalib = profiles.leader.includes('Teleop') || profiles.leader.length > 0;
  const hasFollowerCalib = profiles.follower.includes('Teleop') || profiles.follower.length > 0;

  const roleLabel = role === 'LEADER' ? 'Teleoperator (Leader)' : 'Robot (Follower)';
  const isStartDisabled = !token || !deviceId || !port || calibActive || busy;

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface overflow-hidden" aria-labelledby="hardware-calib-heading">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-canvas transition-colors"
            title="Back to Digital Twin"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h2 id="hardware-calib-heading" className="text-base font-semibold text-ink">
              Calibrate &quot;{profileId || 'Teleop'}&quot;
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Target VISTA Robot:</span>
          <span className="font-mono text-xs font-semibold text-ink">{robotId ?? 'None selected'}</span>
        </div>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-3.5 flex items-start gap-3">
          <AlertCircleIcon className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <p className="font-medium">Calibration Error</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {savedSuccess && (
        <div className="m-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-900 font-medium text-sm">
            <CheckCircle2Icon className="h-4 w-4 text-emerald-600" />
            Calibration successfully saved to LeLab profile: &quot;{savedSuccess}.json&quot;
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            Hardware joint ranges have been verified and written. To enable calibrated 3D poses in the Digital Twin,
            transition to visual calibration by issuing draft evidence with the local operator CLI:
          </p>
          <pre className="mt-2 rounded bg-emerald-900/10 p-2.5 font-mono text-[11px] text-emerald-950 overflow-x-auto">
            {`python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" create-draft --robot-id '${robotId || '<ROBOT_UUID>'}' --follower-id '${deviceId}' --version '1' --lelab-reference '${savedSuccess}.json'`}
          </pre>
          <div className="mt-3">
            {onTransitionToVisual ? (
              <button
                type="button"
                onClick={onTransitionToVisual}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
              >
                &larr; Return to Digital Twin &amp; Visual Calibration
              </button>
            ) : (
              <a
                href="#calibration-heading"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
              >
                Go to Visual Calibration panel &darr;
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main Two-Column Layout (Matching Screenshot 3) */}
      <div className="p-5 grid gap-6 lg:grid-cols-2">
        {/* Left Column: Configuration */}
        <div className="rounded-xl border border-line bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <SettingsIcon className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-ink">Configuration</h3>
            </div>

            <div className="mt-4 space-y-4">
              {/* Device Type Dropdown */}
              <div>
                <label className="block text-xs font-medium text-ink-muted">
                  Device Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value as DeviceRole)}
                  disabled={calibActive || busy}
                  className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                >
                  <option value="LEADER">Teleoperator (Leader)</option>
                  <option value="FOLLOWER">Follower (Robot)</option>
                </select>
              </div>

              {/* Port Field with Find Button */}
              <div>
                <label className="block text-xs font-medium text-ink-muted">
                  Port <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    disabled={calibActive || busy}
                    placeholder="/dev/ttyACM0"
                    className="block w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm text-ink focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void startPortDetection()}
                    disabled={calibActive || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <SearchIcon className="h-3.5 w-3.5 text-ink-muted" />
                    Find
                  </button>
                </div>
              </div>

              {/* Start Calibration Action */}
              <div className="pt-2">
                {!calibActive ? (
                  <button
                    type="button"
                    onClick={() => void startCalibration()}
                    disabled={isStartDisabled}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  >
                    <PlayIcon className="h-4 w-4 fill-white" />
                    Start Calibration
                  </button>
                ) : (
                  <div className="flex gap-2">
                    {!reviewMode ? (
                      <button
                        type="button"
                        onClick={() => void handleReview()}
                        disabled={busy}
                        className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Review Ranges
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={busy}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Confirm & Save
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCancelCalibration()}
                      disabled={busy}
                      className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-canvas"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Collapsible Advanced Section */}
              <div className="border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-medium"
                >
                  {advancedOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                  Advanced Settings
                </button>

                {advancedOpen && (
                  <div className="mt-3 space-y-3 rounded-lg bg-surface p-3 border border-line text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-ink-muted">Operator Session Token (HMAC Bearer)</label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Paste CLI-issued token..."
                        className="mt-1 block w-full rounded border border-line bg-white p-2 font-mono text-xs text-ink"
                      />
                      <p className="mt-1 text-[10px] text-ink-subtle">
                        Issue via: <code>python -m robot_hardware_adapter.operator_cli --robot-id {robotId || '&apos;&apos;'} --device-id {deviceId} --device-role {role}</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-ink-muted">Device Identifier</label>
                      <input
                        type="text"
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        className="mt-1 block w-full rounded border border-line bg-white p-1.5 font-mono text-xs text-ink"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-ink-muted">Calibration Profile Name</label>
                      <input
                        type="text"
                        value={profileId}
                        onChange={(e) => setProfileId(e.target.value)}
                        className="mt-1 block w-full rounded border border-line bg-white p-1.5 font-mono text-xs text-ink"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-ink cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={(e) => setOverwrite(e.target.checked)}
                        className="rounded border-line text-blue-600 focus:ring-blue-500"
                      />
                      <span>Allow overwriting existing LeLab profile</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Robot Calibration Status Card */}
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-xs font-semibold text-ink-muted">Robot calibration</p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2Icon className={`h-4 w-4 ${hasLeaderCalib ? 'text-emerald-500' : 'text-gray-300'}`} />
                <span className="text-ink">Leader (Teleoperator)</span>
                <span className="text-ink-subtle">·</span>
                <span className="font-mono text-ink-muted">{profiles.leader[0] ? `${profiles.leader[0]}.json` : 'Teleop.json'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2Icon className={`h-4 w-4 ${hasFollowerCalib ? 'text-emerald-500' : 'text-gray-300'}`} />
                <span className="text-ink">Follower (Robot)</span>
                <span className="text-ink-subtle">·</span>
                <span className="font-mono text-ink-muted">{profiles.follower[0] ? `${profiles.follower[0]}.json` : 'Teleop.json'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Live Range Progress */}
        <div className="rounded-xl border border-line bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold">~</span>
                <h3 className="text-sm font-semibold text-ink">Status</h3>
              </div>
              <div>
                {calibStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                    <XIcon className="h-3 w-3" /> Error
                  </span>
                )}
                {calibStatus === 'recording' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 animate-pulse">
                    <Loader2Icon className="h-3 w-3 animate-spin" /> Recording
                  </span>
                )}
                {calibStatus === 'review' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    Review Ready
                  </span>
                )}
                {calibStatus === 'completed' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <CheckIcon className="h-3 w-3" /> Completed
                  </span>
                )}
                {calibStatus === 'idle' && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    Idle
                  </span>
                )}
              </div>
            </div>

            {/* Live Six-joint progress or Demo Video */}
            {!calibActive ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-ink-muted mb-2">Calibration Demo:</p>
                <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-line bg-black flex items-center justify-center">
                  <div className="text-center text-white p-4">
                    <span className="text-3xl">🦾</span>
                    <p className="mt-2 text-xs font-semibold">SO-101 Supervised Calibration</p>
                    <p className="mt-1 text-[11px] text-gray-400 max-w-xs">
                      Move all 6 joints gently through their physical limits from minimum to maximum.
                    </p>
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-gray-300 px-2">
                    <span>0:00 / 0:42</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-blue-50 p-2.5 text-xs text-blue-900 border border-blue-200">
                  <p className="font-semibold">Supervised Sweep Instructions:</p>
                  <p className="mt-0.5 text-[11px]">
                    Move ALL joints through their FULL range of motion. Coverage bars reflect actual observed angular range.
                  </p>
                </div>

                <div className="space-y-2 mt-3">
                  {SO101_ORDER.map((name) => {
                    const evt = progressByJoint[name];
                    const label = JOINT_LABELS[name] || name;
                    const min = evt?.observed_min ?? 0;
                    const max = evt?.observed_max ?? 0;
                    const span = max - min;
                    const coverage = evt?.coverage_percentage;
                    const isNarrow = span < 100;

                    return (
                      <div key={name} className="rounded-lg border border-line bg-surface p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink">{label}</span>
                          <span className="font-mono text-ink-muted">
                            pos: {evt ? evt.current_position.toFixed(0) : '—'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-subtle">
                          <span>min: {min.toFixed(0)}</span>
                          <span>span: {span.toFixed(0)}</span>
                          <span>max: {max.toFixed(0)}</span>
                          {coverage !== null && coverage !== undefined ? (
                            <span className="font-semibold text-blue-700">{coverage.toFixed(0)}%</span>
                          ) : (
                            <span className="text-[10px] text-gray-400">span only</span>
                          )}
                        </div>
                        <div className="mt-1.5 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isNarrow ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${
                                coverage !== null && coverage !== undefined
                                  ? Math.max(5, Math.min(100, coverage))
                                  : Math.min(100, (span / 2500) * 100)
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-line text-[11px] text-ink-muted">
            <p>Exclusive process ownership is enforced via advisory flock on the serial port.</p>
          </div>
        </div>
      </div>

      {/* Bottom Card: Attached Cameras (Matching Screenshot 3) */}
      <div className="border-t border-line p-5 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">Attached cameras</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">{camerasOn ? 'On' : 'Off'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={camerasOn}
              onClick={() => setCamerasOn(!camerasOn)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                camerasOn ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  camerasOn ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 text-center">
          <CameraIcon className="mx-auto h-8 w-8 text-ink-subtle" />
          <p className="mt-2 text-xs font-medium text-ink">
            {camerasOn ? 'Scanning for cameras...' : 'Cameras are off'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[11px] text-ink-muted">
            Turn cameras on to scan for connected devices and preview them. The browser may briefly open a camera to read
            device labels, and configured cameras stay active while previews are visible. Nothing is recorded.
          </p>
          <p className="mt-2 text-[10px] text-ink-subtle">1 camera saved to this robot.</p>
        </div>
      </div>

      {/* Port Detection Modal (Matching Screenshot 4) */}
      {detectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl text-center">
            <button
              type="button"
              onClick={() => void handleCancelDetection()}
              className="absolute right-4 top-4 text-ink-muted hover:text-ink"
            >
              <XIcon className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-ink">Port Detection</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Detect the USB port for your {role === 'LEADER' ? 'leader arm' : 'follower arm'}
            </p>

            <div className="my-8 flex justify-center">
              <Loader2Icon className="h-14 w-14 animate-spin text-blue-600" />
            </div>

            {detection?.phase === 'UNPLUG' && (
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-ink">
                  Unplug the {role === 'LEADER' ? 'leader arm' : 'follower arm'}
                </h4>
                <p className="text-xs text-ink-muted">
                  Disconnect the {role === 'LEADER' ? 'leader' : 'follower'} robot arm from USB. The port will be
                  detected automatically.
                </p>
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => void handleUnplugStep()}
                    disabled={busy}
                    className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Check disconnect after unplugging
                  </button>
                </div>
              </div>
            )}

            {detection?.phase === 'RECONNECT' && (
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-ink">
                  Reconnect the {role === 'LEADER' ? 'leader arm' : 'follower arm'}
                </h4>
                <p className="text-xs text-ink-muted">
                  Connect the robot arm back to USB. The newly reconnected port will be identified.
                </p>
                {detection.disconnected_port && (
                  <p className="font-mono text-xs text-blue-600">
                    Disconnected port detected: {detection.disconnected_port.device}
                  </p>
                )}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => void handleReconnectStep()}
                    disabled={busy}
                    className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Check reconnected port
                  </button>
                </div>
              </div>
            )}

            {detection?.phase === 'CONFIRM' && (
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-ink">Confirm Selected Port</h4>
                <p className="text-xs text-ink-muted">Newly detected port ready for binding:</p>
                <div className="rounded-lg bg-surface p-3 font-mono text-sm font-semibold text-ink">
                  {detection.candidate?.device}
                </div>
                {detection.candidate?.description && (
                  <p className="text-[11px] text-ink-subtle">{detection.candidate.description}</p>
                )}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => void handleConfirmPort()}
                    disabled={busy}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Confirm &amp; Use Port
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleCancelDetection()}
                className="w-full rounded-lg border border-line py-2 text-xs font-medium text-ink hover:bg-canvas"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
