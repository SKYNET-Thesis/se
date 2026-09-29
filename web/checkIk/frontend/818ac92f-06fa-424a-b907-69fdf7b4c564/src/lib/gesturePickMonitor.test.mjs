import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveGesturePickMonitor, allowMotionReset } from './gesturePickMonitor.js';

const status = {
  configured: true, phase: 'idle', taskId: null, stage: null, reason: null,
  updatedAt: 100, selection: {}, followerSide: 'left', cameraPath: '/dev/video8',
  calibrationValid: true, cameraAvailable: true, frameObservedAt: 99.9,
  frameSize: [1280, 720], running: false,
};
const backend = { motionEnabled: true, simulated: false, latchedMotionLock: false };
const tag = {
  tagId: 0, kind: 'object', imageCenter: [240, 360], robotPoint: [0.12, 0.15, 0],
  observedAt: 99.9, confidence: 1, visible: true,
};
const monitor = (patch = {}, options = {}) => deriveGesturePickMonitor(
  { status: { ...status, ...patch }, detections: [tag] }, backend,
  { online: true, now: 100, ...options },
);

test('preserves the calibration blocking reason and disables Cancel while idle', () => {
  const result = monitor({ calibrationValid: false, reason: 'calibration required' });
  assert.equal(result.reason, 'calibration required');
  assert.equal(result.calibrationLabel, 'Calibration required');
  assert.equal(result.canCancel, false);
});

test('allows only Cancel throughout selection, preview and execution', () => {
  for (const phase of ['selecting-object', 'selecting-box', 'preview', 'executing']) {
    assert.equal(monitor({ phase }).canCancel, true, phase);
  }
  for (const phase of ['idle', 'succeeded', 'held', 'failed', 'unknown']) {
    assert.equal(monitor({ phase }).canCancel, false, phase);
  }
});

test('keeps Cancel available during a safety block or worker cleanup', () => {
  const result = deriveGesturePickMonitor(
    { status: { ...status, phase: 'executing', calibrationValid: false, cameraAvailable: false }, detections: [] },
    { ...backend, motionEnabled: false, latchedMotionLock: true }, { online: true, now: 100 },
  );
  assert.equal(result.canCancel, true);
  assert.equal(result.safetyLabel, 'E-stop / motion lock latched');
  assert.equal(monitor({ phase: 'held', running: true }).canCancel, true);
});

test('disables duplicate cancellation while a request is pending', () => {
  assert.equal(monitor({ phase: 'executing' }, { cancelling: true }).canCancel, false);
});

test('marks old, missing and future camera frames unavailable instead of live', () => {
  assert.equal(monitor().cameraLabel, 'Fresh frame');
  assert.equal(monitor({}, { now: 100.4 }).cameraLabel, 'Fresh frame');
  const stale = monitor({}, { now: 100.401 });
  assert.equal(stale.cameraLabel, 'Stale frame');
  assert.equal(stale.frameAgeMs, 501);
  assert.equal(stale.tags[0].fresh, false);
  for (const frameObservedAt of [null, NaN, 101]) {
    assert.equal(monitor({ frameObservedAt }).cameraLabel, 'No frame');
  }
  assert.equal(monitor({ cameraAvailable: false }).cameraLabel, 'No frame');
});

test('labels cached status and tags as unavailable when the backend disconnects', () => {
  const result = monitor({ phase: 'executing' }, { online: false });
  assert.equal(result.canCancel, false);
  assert.equal(result.cameraLabel, 'Connection lost');
  assert.equal(result.tags[0].fresh, false);
  assert.match(result.reason, /connection lost/i);
});

test('shows both selected tags including tag zero without treating detection rows as controls', () => {
  const result = monitor({ phase: 'preview', selection: { objectTagId: 0, boxTagId: 20 } });
  assert.equal(result.objectLabel, 'Object #0');
  assert.equal(result.boxLabel, 'Box #20');
  assert.equal(result.tags[0].selected, true);
  assert.equal(result.tags[0].fresh, true);
});

test('shows a human-readable execution stage and preserves failure reasons', () => {
  assert.equal(monitor({ phase: 'executing', stage: 'above_destination' }).stageLabel, 'Above destination');
  assert.equal(monitor({ phase: 'held', reason: 'operator_cancelled' }).reason, 'operator_cancelled');
  assert.equal(monitor({ phase: 'failed', reason: 'configured follower unavailable' }).reason, 'configured follower unavailable');
});

test('fails closed while waiting for a configured monitoring snapshot', () => {
  const result = deriveGesturePickMonitor(undefined, undefined, { online: false, now: 100 });
  assert.equal(result.canCancel, false);
  assert.equal(result.objectLabel, 'Not selected');
  assert.equal(result.boxLabel, 'Not selected');
  assert.deepEqual(result.tags, []);
  assert.equal(monitor({ configured: false, phase: 'preview' }).canCancel, false);
});

test('the monitoring route cannot expose the shared header motion-lock reset', () => {
  assert.equal(allowMotionReset('/gesture-pick'), false);
  assert.equal(allowMotionReset('/gesture-pick/'), false);
  assert.equal(allowMotionReset('/gesture-pick/task'), false);
  assert.equal(allowMotionReset('/workspace'), true);
  assert.equal(allowMotionReset('/vr'), true);
});

test('does not describe an initial placeholder as last known dashboard status', () => {
  const result = deriveGesturePickMonitor({ status: { phase: 'idle' }, detections: [] }, undefined,
    { online: false, now: 100 });
  assert.match(result.reason, /waiting/i);
  assert.equal(result.phaseLabel, 'Waiting for status');
});
