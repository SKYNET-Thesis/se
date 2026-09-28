// Selection-only state. The dashboard remains authoritative for motion and tasks.
export const MAX_OBSERVATION_AGE_S = 0.5;

export function initialGesturePickSelection() {
  return { phase: "selecting-object", selection: {}, taskId: null, stage: null, reason: null };
}

export function applyPinch(state, tag) {
  if (!Number.isInteger(tag?.id) || tag.id < 0) return state;
  if (state.phase === "selecting-object" && tag.kind === "object") {
    return { ...state, phase: "selecting-box", selection: { objectTagId: tag.id } };
  }
  if (state.phase === "selecting-box" && tag.kind === "box") {
    return { ...state, phase: "preview", selection: { ...state.selection, boxTagId: tag.id } };
  }
  return state;
}

export function shouldAcceptPinch({ pinched, lastAcceptedAt = -Infinity }, now) {
  return !pinched && Number.isFinite(now) && now - lastAcceptedAt >= 0.35;
}

export function reconcileGesturePickSelection(state, status) {
  const phases = ["idle", "selecting-object", "selecting-box", "preview", "executing", "succeeded", "held", "failed"];
  if (!status || !phases.includes(status.phase)) return state;
  if (state.restartRequested && ["succeeded", "held", "failed"].includes(status.phase)) return state;
  return {
    phase: status.phase === "idle" ? "selecting-object" : status.phase,
    selection: { ...status.selection }, taskId: status.taskId ?? null,
    stage: status.stage ?? null, reason: status.reason ?? null,
  };
}

export function restartGestureSelection(state) {
  return ["succeeded", "held", "failed"].includes(state.phase)
    ? { ...initialGesturePickSelection(), restartRequested: true } : state;
}

export function gestureObservationNow(serverAt, receivedAt, now) {
  return serverAt + Math.max(0, now - receivedAt) / 1000;
}

function fresh(observedAt, now) {
  return Number.isFinite(observedAt) && now >= observedAt && now - observedAt <= MAX_OBSERVATION_AGE_S;
}

export function usableGestureDetections(detections, now) {
  return detections.filter((tag) => Number.isInteger(tag.tagId) && tag.tagId >= 0
    && ["object", "box"].includes(tag.kind) && tag.visible === true && fresh(tag.observedAt, now)
    && Array.isArray(tag.imageCenter) && tag.imageCenter.length === 2 && tag.imageCenter.every(Number.isFinite)
    && detections.filter((other) => other.tagId === tag.tagId).length === 1);
}

export function gesturePickAvailability(status, detections, backend, now) {
  let reason = null;
  if (!status?.configured) reason = "Gesture pick is not configured";
  else if (!status.calibrationValid) reason = "Table calibration is required";
  else if (!status.cameraAvailable || !fresh(status.frameObservedAt, now)) reason = "Camera frame is unavailable or stale";
  else if (backend?.latchedMotionLock) reason = "E-stop / motion lock is latched";
  const selectable = !reason;
  const selection = status?.selection ?? {};
  const usable = usableGestureDetections(detections, now);
  const selected = usable.find((tag) => tag.tagId === selection.objectTagId && tag.kind === "object")
    && usable.find((tag) => tag.tagId === selection.boxTagId && tag.kind === "box");
  if (!reason && status?.phase === "preview" && !selected) reason = "Both selected tags must remain visible and fresh";
  if (!reason && (!backend?.motionEnabled || backend?.simulated !== false)) reason = "Real motion is locked in the dashboard";
  if (!reason && backend?.followerReady !== true) reason = "Follower assignment, port and calibration must be ready";
  if (!reason && backend?.exclusiveTaskReady !== true) reason = "Another dashboard worker owns the follower";
  return {
    canSelect: selectable && ["idle", "selecting-object", "selecting-box"].includes(status?.phase),
    canConfirm: !reason && status?.phase === "preview" && typeof status.taskId === "string" && status.taskId.length > 0,
    reason,
  };
}

export function hitTestDetection(detections, uv, frameSize, now) {
  if (!uv || !Array.isArray(frameSize) || frameSize.length !== 2
      || !frameSize.every((value) => Number.isFinite(value) && value > 0)
      || !Number.isFinite(uv.x) || !Number.isFinite(uv.y) || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return null;
  const [width, height] = frameSize;
  const hits = usableGestureDetections(detections, now).filter((tag) =>
    Math.abs(tag.imageCenter[0] / width - uv.x) <= 0.045
    && Math.abs(tag.imageCenter[1] / height - (1 - uv.y)) <= 0.06);
  return hits.length === 1 ? hits[0] : null;
}
