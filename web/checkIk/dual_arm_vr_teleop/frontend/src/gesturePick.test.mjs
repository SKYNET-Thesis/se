import test from "node:test";
import assert from "node:assert/strict";
import {
  initialGesturePickSelection, applyPinch, shouldAcceptPinch,
  reconcileGesturePickSelection, gesturePickAvailability, hitTestDetection,
  gestureObservationNow, restartGestureSelection,
} from "./gesturePick.js";

test("pinch selects an object, then a box, then opens preview without execution", () => {
  const initial = initialGesturePickSelection();
  const object = applyPinch(initial, { id: 7, kind: "object" });
  const preview = applyPinch(object, { id: 22, kind: "box" });
  assert.equal(object.phase, "selecting-box");
  assert.equal(preview.phase, "preview");
  assert.deepEqual(preview.selection, { objectTagId: 7, boxTagId: 22 });
  assert.deepEqual(initial.selection, {});
});

test("freshness uses acknowledged dashboard time plus local elapsed, independent of headset clock", () => {
  assert.equal(gestureObservationNow(100, 1000, 1250), 100.25);
  assert.equal(gestureObservationNow(100, 1000, 2250), 101.25);
  assert.equal(gesturePickAvailability(healthy, tags, backend, gestureObservationNow(100, 1000, 2250)).canConfirm, false);
});

test("a deliberate new-task reset survives terminal polling until an object is acknowledged", () => {
  const held = reconcileGesturePickSelection(initialGesturePickSelection(), { ...healthy, phase: "held" });
  const restarted = restartGestureSelection(held);
  assert.equal(restarted.phase, "selecting-object");
  assert.deepEqual(restarted.selection, {});
  assert.equal(reconcileGesturePickSelection(restarted, { ...healthy, phase: "held" }), restarted);
  assert.equal(reconcileGesturePickSelection(restarted, { ...healthy, phase: "selecting-box", selection: { objectTagId: 7 } }).phase, "selecting-box");
  assert.equal(restartGestureSelection({ ...held, phase: "executing" }).phase, "executing");
});

test("selection rejects the wrong kind, invalid IDs, and input during preview/execution/terminal states", () => {
  const initial = initialGesturePickSelection();
  for (const tag of [{ id: 22, kind: "box" }, { id: -1, kind: "object" }, { id: NaN, kind: "object" }]) {
    assert.equal(applyPinch(initial, tag), initial);
  }
  for (const phase of ["preview", "executing", "succeeded", "held", "failed"]) {
    const state = { ...initial, phase };
    assert.equal(applyPinch(state, { id: 7, kind: "object" }), state);
  }
});

test("pinch debounce requires release and a minimum interval", () => {
  assert.equal(shouldAcceptPinch({ pinched: true, lastAcceptedAt: 10 }, 10.1), false);
  assert.equal(shouldAcceptPinch({ pinched: true, lastAcceptedAt: 10 }, 12), false);
  assert.equal(shouldAcceptPinch({ pinched: false, lastAcceptedAt: 10 }, 10.1), false);
  assert.equal(shouldAcceptPinch({ pinched: false, lastAcceptedAt: 10 }, 10.5), true);
});

const tags = [
  { tagId: 7, kind: "object", imageCenter: [320, 180], robotPoint: [0.1, 0.2, 0], visible: true, observedAt: 100 },
  { tagId: 22, kind: "box", imageCenter: [960, 540], robotPoint: [0.3, 0.2, 0], visible: true, observedAt: 100 },
];
const healthy = {
  configured: true, phase: "preview", taskId: "task-1", selection: { objectTagId: 7, boxTagId: 22 },
  calibrationValid: true, cameraAvailable: true, frameObservedAt: 100, frameSize: [1280, 720],
};
const backend = { motionEnabled: true, simulated: false, latchedMotionLock: false, followerReady: true, exclusiveTaskReady: true };

test("confirmation requires a fresh healthy preview and explicit dashboard motion authorization", () => {
  assert.equal(gesturePickAvailability(healthy, tags, backend, 100.1).canConfirm, true);
  for (const status of [
    { ...healthy, calibrationValid: false }, { ...healthy, cameraAvailable: false },
    { ...healthy, phase: "executing" }, { ...healthy, taskId: null },
  ]) assert.equal(gesturePickAvailability(status, tags, backend, 100.1).canConfirm, false);
  assert.equal(gesturePickAvailability(healthy, tags, backend, 102).canConfirm, false);
  assert.equal(gesturePickAvailability(healthy, [tags[0]], backend, 100.1).canConfirm, false);
  for (const blocked of [{ ...backend, motionEnabled: false }, { ...backend, simulated: true }, { ...backend, latchedMotionLock: true }, { ...backend, followerReady: false }, { ...backend, exclusiveTaskReady: false }]) {
    assert.equal(gesturePickAvailability(healthy, tags, blocked, 100.1).canConfirm, false);
  }
});

test("duplicate, invisible, future, or stale selected detections cannot confirm", () => {
  for (const invalid of [
    [...tags, tags[0]], [tags[0], { ...tags[1], visible: false }],
    [tags[0], { ...tags[1], observedAt: 90 }], [tags[0], { ...tags[1], observedAt: 110 }],
  ]) assert.equal(gesturePickAvailability(healthy, invalid, backend, 100.1).canConfirm, false);
});

test("panel UV maps to top-left image coordinates and ambiguous hits are ignored", () => {
  assert.equal(hitTestDetection(tags, { x: 0.25, y: 0.75 }, [1280, 720], 100.1)?.tagId, 7);
  assert.equal(hitTestDetection(tags, { x: 0.75, y: 0.25 }, [1280, 720], 100.1)?.tagId, 22);
  assert.equal(hitTestDetection(tags, { x: 0.5, y: 0.5 }, [1280, 720], 100.1), null);
  assert.equal(hitTestDetection([...tags, { ...tags[0], tagId: 8 }], { x: 0.25, y: 0.75 }, [1280, 720], 100.1), null);
  assert.equal(hitTestDetection(tags, { x: 0.25, y: 0.75 }, [1280, 720], 102), null);
});

test("server acknowledgement owns task identity, execution stage, failure and cancellation", () => {
  const initial = initialGesturePickSelection();
  for (const phase of ["preview", "executing", "succeeded", "held", "failed"]) {
    const state = reconcileGesturePickSelection(initial, { ...healthy, phase, stage: "lift", reason: "operator_cancelled" });
    assert.equal(state.phase, phase);
    assert.equal(state.taskId, "task-1");
    assert.equal(state.stage, "lift");
    assert.equal(state.reason, "operator_cancelled");
    assert.deepEqual(state.selection, { objectTagId: 7, boxTagId: 22 });
  }
  assert.equal(reconcileGesturePickSelection(initial, { ...healthy, phase: "idle" }).phase, "selecting-object");
});
