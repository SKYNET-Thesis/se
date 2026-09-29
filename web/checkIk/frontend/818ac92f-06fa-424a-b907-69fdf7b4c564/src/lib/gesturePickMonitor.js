const activePhases = new Set(['selecting-object', 'selecting-box', 'preview', 'executing']);
const phaseLabels = {
  idle: 'Idle', 'selecting-object': 'Choosing object', 'selecting-box': 'Choosing destination',
  preview: 'VR preview', executing: 'Executing', succeeded: 'Commands completed',
  held: 'Hold', failed: 'Failed',
};

export function allowMotionReset(pathname) {
  return pathname !== '/gesture-pick' && !pathname.startsWith('/gesture-pick/');
}

function fresh(observedAt, now) {
  return Number.isFinite(observedAt) && Number.isFinite(now)
    && observedAt >= 0 && now >= observedAt && now - observedAt <= 0.5;
}

// This only derives monitoring labels and Cancel availability. The dashboard
// remains authoritative for selection, preflight and motion authorization.
export function deriveGesturePickMonitor(gesturePick, backend, { online = false, now, cancelling = false } = {}) {
  const state = gesturePick?.status;
  const hasSnapshot = typeof state?.configured === 'boolean';
  const selection = state?.selection ?? {};
  const frameAt = state?.frameObservedAt;
  const hasFrame = state?.cameraAvailable === true && Number.isFinite(frameAt)
    && frameAt >= 0 && Number.isFinite(now) && now >= frameAt;
  const frameFresh = online && hasFrame && fresh(frameAt, now);
  const cameraLabel = !online ? 'Connection lost' : !hasFrame ? 'No frame' : frameFresh ? 'Fresh frame' : 'Stale frame';
  const safetyLabel = !backend ? 'Motion state unavailable'
    : backend.latchedMotionLock ? 'E-stop / motion lock latched'
    : !backend.motionEnabled || backend.simulated ? 'Real motion locked' : 'Real motion enabled';
  let reason = state?.reason ?? null;
  if (!online) reason = hasSnapshot ? `Dashboard connection lost. Last known status shown.${reason ? ` ${reason}` : ''}` : 'Waiting for dashboard status';
  else if (!reason && !state?.configured) reason = 'Gesture pick configuration required';
  else if (!reason && !state.calibrationValid) reason = 'Table calibration required';
  else if (!reason && !frameFresh) reason = 'Camera frame unavailable or stale';
  else if (!reason && backend?.latchedMotionLock) reason = 'E-stop / motion lock latched';
  else if (!reason && (!backend?.motionEnabled || backend.simulated)) reason = 'Real motion is locked in the dashboard';

  return {
    phaseLabel: !hasSnapshot ? 'Waiting for status' : phaseLabels[state?.phase] ?? 'Unknown task state',
    stageLabel: state?.stage ? state.stage.replace(/[-_]/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'No active stage',
    reason,
    canCancel: online && !cancelling && state?.configured === true
      && (state.running === true || activePhases.has(state.phase)),
    calibrationLabel: state?.calibrationValid ? 'Calibrated' : 'Calibration required',
    cameraLabel,
    frameFresh,
    frameAgeMs: hasFrame ? Math.round((now - frameAt) * 1000) : null,
    safetyLabel,
    objectLabel: Number.isInteger(selection.objectTagId) ? `Object #${selection.objectTagId}` : 'Not selected',
    boxLabel: Number.isInteger(selection.boxTagId) ? `Box #${selection.boxTagId}` : 'Not selected',
    tags: (gesturePick?.detections ?? []).map((tag) => ({
      ...tag,
      selected: tag.kind === 'object' ? tag.tagId === selection.objectTagId : tag.tagId === selection.boxTagId,
      fresh: online && state?.calibrationValid === true && frameFresh && tag.visible === true && fresh(tag.observedAt, now),
    })),
  };
}
