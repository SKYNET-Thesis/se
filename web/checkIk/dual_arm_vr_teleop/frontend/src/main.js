import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";
import {
  initialGesturePickSelection, applyPinch, shouldAcceptPinch,
  reconcileGesturePickSelection, gesturePickAvailability,
  usableGestureDetections, hitTestDetection, gestureObservationNow, restartGestureSelection,
  gesturePosePayload, gestureFrameTiming, drawGestureFrameTiming,
} from "./gesturePick.js";
import "./style.css";

const robotModelUrl = "/assets/arm.glb";

let emulatorActive = false;
let nativeVrSupport = false;
let nativeArSupport = false;
if (navigator.xr) {
  [nativeVrSupport, nativeArSupport] = await Promise.all([
    navigator.xr.isSessionSupported("immersive-vr"),
    navigator.xr.isSessionSupported("immersive-ar"),
  ]);
}
const nativeWebXRSupport = nativeVrSupport || nativeArSupport;
if (!nativeWebXRSupport) {
  const xrDevice = new XRDevice(metaQuest3);
  xrDevice.installRuntime();
  xrDevice.fovy = (75 / 180) * Math.PI;
  xrDevice.ipd = 0;
  xrDevice.controllers.right.position.set(0.16, 1.43, -0.38);
  xrDevice.controllers.left.position.set(-0.16, 1.43, -0.38);
  new DevUI(xrDevice);
  window.xrDevice = xrDevice;
  emulatorActive = true;
}

const scene = new THREE.Scene();
const vrBackground = new THREE.Color(0x07110b);
scene.background = vrBackground;

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 1.5);
camera.lookAt(0, 1.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

const statusElement = document.querySelector("#status");
const xrToggle = document.querySelector("#xr-toggle");
let xrSession = null;
xrToggle.textContent = emulatorActive ? "START EMULATED VR" : "ENTER VR";
xrToggle.addEventListener("click", async () => {
  try {
    if (xrSession) {
      await xrSession.end();
      return;
    }
    // Phosphobot-style mode: an entirely virtual scene. Physical cameras are
    // displayed later as video-textured panels inside this VR session.
    const sessionMode = "immersive-vr";
    statusElement.textContent = `Requesting ${sessionMode} session…`;
    const session = await navigator.xr.requestSession(sessionMode, {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
    });
    const mixedReality = sessionMode === "immersive-ar";
    scene.background = mixedReality ? null : vrBackground;
    grid.visible = !mixedReality;
    xrSession = session;
    session.addEventListener("end", () => {
      xrSession = null;
      scene.background = vrBackground;
      grid.visible = true;
      xrToggle.textContent = emulatorActive ? "START EMULATED VR" : "ENTER VR";
      statusElement.textContent = emulatorActive
        ? "Emulated XR session ended."
        : "Native XR session ended.";
    });
    await renderer.xr.setSession(session);
    xrToggle.textContent = "EXIT VR";
    statusElement.textContent = emulatorActive
      ? "Emulated XR running — use the IWER controller controls."
      : mixedReality
        ? "Mixed Reality running — look down toward the table."
        : "Native WebXR session running.";
  } catch (error) {
    console.error("Failed to start XR session", error);
    statusElement.textContent = `XR start failed: ${error.name}: ${error.message}`;
  }
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x223322, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(2, 5, 3);
scene.add(keyLight);
const grid = new THREE.GridHelper(6, 30, 0x44aa66, 0x183b24);
scene.add(grid);

const states = {
  left: makeState("left"),
  right: makeState("right"),
};
let sequence = 0;
let lastSendTime = 0;
let socket = null;
let reconnectTimer = null;
const socketStatus = document.querySelector("#socket-status");
const modelStatus = document.querySelector("#model-status");
const environmentStatus = document.querySelector("#environment-status");
const virtualRobots = { left: null, right: null };

const jointNames = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
];
const teleopStartQ = [0, -0.6, 1.2, -0.6, 0];
const gripperOpenAngle = THREE.MathUtils.degToRad(100);
const gripperClosedAngle = THREE.MathUtils.degToRad(-10);
// The URDF joints rotate about local Z, but the GLB exporter converts the
// robot from Z-up to Three.js Y-up. In arm.glb the articulated joint nodes
// therefore rotate about local +Y. This was verified against URDF FK for
// multiple non-zero joint configurations.
const jointAxis = new THREE.Vector3(0, 1, 0);
const jointRotation = new THREE.Quaternion();

environmentStatus.textContent = "Environment: lightweight black grid (teleop mode)";

function makeLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = "bold 54px monospace";
  context.textAlign = "center";
  context.fillText(text, canvas.width / 2, 82);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  sprite.scale.set(0.34, 0.085, 1);
  sprite.position.set(0, 0.55, 0);
  return sprite;
}

function createVirtualRobot(source, hand) {
  const root = new THREE.Group();
  const model = source.clone(true);
  model.traverse((object) => {
    if (object.name.toLowerCase().includes("collision")) object.visible = false;
  });
  root.add(model);
  root.add(makeLabel(`${hand.toUpperCase()} ARM`, hand === "left" ? "#66bbff" : "#ff9966"));
  root.position.set(hand === "left" ? -0.25 : 0.25, 0.78, -0.48);
  // arm.glb extends along local +X in its zero pose. +90° about world Y maps
  // this to -Z, so it appears vertical (near-to-far) when looking down.
  root.rotation.y = Math.PI / 2;
  root.scale.setScalar(1.15);
  scene.add(root);

  const joints = {};
  for (const name of jointNames) {
    const node = model.getObjectByName(name);
    if (!node) throw new Error(`GLB node not found: ${name}`);
    joints[name] = { node, rest: node.quaternion.clone() };
  }
  const gripperNode = model.getObjectByName("gripper");
  return {
    root,
    joints,
    gripper: gripperNode ? { node: gripperNode, rest: gripperNode.quaternion.clone() } : null,
    displayedQ: [...teleopStartQ],
    targetQ: [...teleopStartQ],
    displayedGripper: 0,
    targetGripper: 0,
  };
}

function setVirtualRobotPose(hand, result) {
  const robot = virtualRobots[hand];
  if (!robot || !result?.success || result.joint_positions?.length !== 5) return;
  // A light latest-value low-pass removes visible IK quantization without
  // building a command queue or adding substantial controller lag.
  const responseBlend = 0.65;
  robot.targetQ = result.joint_positions.map((value, index) =>
    THREE.MathUtils.lerp(robot.targetQ[index], value, responseBlend));
  robot.targetGripper = THREE.MathUtils.lerp(
    robot.targetGripper, result.gripper ?? 0, responseBlend,
  );
}

function animateVirtualRobot(robot, deltaSeconds) {
  if (!robot) return;
  jointNames.forEach((name, index) => {
    const joint = robot.joints[name];
    robot.displayedQ[index] = THREE.MathUtils.damp(
      robot.displayedQ[index], robot.targetQ[index], 20, deltaSeconds,
    );
    jointRotation.setFromAxisAngle(jointAxis, robot.displayedQ[index]);
    joint.node.quaternion.copy(joint.rest).multiply(jointRotation);
  });
  if (robot.gripper) {
    robot.displayedGripper = THREE.MathUtils.damp(
      robot.displayedGripper, robot.targetGripper, 20, deltaSeconds,
    );
    // Trigger is a close command: released = maximum opening, fully pressed =
    // maximum closing. These limits come from the supplied SO-101 URDF.
    const gripperAngle = THREE.MathUtils.lerp(
      gripperOpenAngle,
      gripperClosedAngle,
      THREE.MathUtils.clamp(robot.displayedGripper, 0, 1),
    );
    jointRotation.setFromAxisAngle(jointAxis, gripperAngle);
    robot.gripper.node.quaternion.copy(robot.gripper.rest).multiply(jointRotation);
  }
}

new GLTFLoader().load(
  robotModelUrl,
  (gltf) => {
    virtualRobots.left = createVirtualRobot(gltf.scene, "left");
    virtualRobots.right = createVirtualRobot(gltf.scene, "right");
    modelStatus.textContent = "Digital twins: loaded — hold Grip and move a controller";
  },
  (event) => {
    if (event.total) modelStatus.textContent = `Digital twins: loading ${Math.round(100 * event.loaded / event.total)}%`;
  },
  (error) => {
    console.error("Failed to load arm.glb", error);
    modelStatus.textContent = "Digital twins: arm.glb failed to load";
  },
);

function connectSocket() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socketStatus.textContent = "WebSocket: connecting…";
  socket.addEventListener("open", () => { socketStatus.textContent = "WebSocket: connected — waiting for backend mode"; });
  socket.addEventListener("message", (event) => {
    const reply = JSON.parse(event.data);
    socketStatus.textContent = `WebSocket: ${reply.status}${reply.active_hands?.length ? ` — active ${reply.active_hands.join(", ")}` : ""}`;
    for (const [hand, result] of Object.entries(reply.results ?? {})) {
      setVirtualRobotPose(hand, result);
    }
  });
  socket.addEventListener("close", () => {
    socketStatus.textContent = "WebSocket: backend 127.0.0.1:8765 is not running; retrying…";
    reconnectTimer = setTimeout(connectSocket, 5000);
  });
  socket.addEventListener("error", () => socket.close());
}
connectSocket();

function makeState(handedness) {
  return {
    handedness,
    connected: false,
    grip: null,
    inputSource: null,
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    trigger: 0,
    squeeze: 0,
  };
}

const controllerModelFactory = new XRControllerModelFactory();
for (let index = 0; index < 2; index += 1) {
  const grip = renderer.xr.getControllerGrip(index);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
  grip.addEventListener("connected", (event) => {
    const handedness = event.data.handedness;
    if (!(handedness in states)) return;
    Object.assign(states[handedness], {
      connected: true,
      grip,
      inputSource: event.data,
    });
  });
  grip.addEventListener("disconnected", () => {
    for (const state of Object.values(states)) {
      if (state.grip === grip) Object.assign(state, makeState(state.handedness));
    }
  });
}

const panelCanvas = document.createElement("canvas");
panelCanvas.width = 1024;
panelCanvas.height = 512;
const panelContext = panelCanvas.getContext("2d");
const panelTexture = new THREE.CanvasTexture(panelCanvas);
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.7),
  new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true }),
);
panel.position.set(0, 1.55, -1.6);
scene.add(panel);

// The camera and task rail use the same primitives on desktop and in Quest.
const gestureSurface = document.createElement("section");
gestureSurface.className = "gesture-surface";
gestureSurface.innerHTML = `
  <section class="gesture-camera" aria-label="Overhead camera selection">
    <div class="gesture-camera-heading"><span>OVERHEAD CAMERA</span><span id="gesture-frame-age">NO FRAME</span></div>
    <div id="gesture-camera-canvas"></div>
    <p>Point at an object, then a destination. Pinch or press controller Trigger to select.</p>
  </section>
  <section class="gesture-rail" aria-label="Pick and place task">
    <h2>Pick and place</h2>
    <p id="gesture-phase" role="status" aria-live="polite">Connecting to dashboard</p>
    <dl><dt>Calibration</dt><dd id="gesture-calibration">Checking</dd>
      <dt>Camera</dt><dd id="gesture-camera-health">Checking</dd>
      <dt>Motion</dt><dd id="gesture-motion">Locked</dd>
      <dt>Follower</dt><dd id="gesture-follower">Unassigned</dd></dl>
    <div class="gesture-selection"><p id="gesture-object">Object: none</p><p id="gesture-box">Destination: none</p></div>
    <p id="gesture-preview"></p>
    <p id="gesture-reason" role="alert"></p>
    <button id="gesture-confirm" type="button" disabled>Confirm pick and place</button>
    <button id="gesture-cancel" type="button" disabled>Cancel selection</button>
    <button id="gesture-reset" type="button" hidden>Choose another task</button>
    <p class="gesture-safety-note">Confirmation requests guarded motion. Stop requests Hold. Use the dashboard for E-stop and recovery.</p>
  </section>`;
document.querySelector("#app").appendChild(gestureSurface);
document.querySelector("#app").classList.add("gesture-mode");
document.querySelector("h1").textContent = "SO-101 / Gesture pick and place";
document.querySelector(".warning").textContent = "Select on the overhead camera, review the task, then explicitly confirm guarded motion.";
const gestureElements = Object.fromEntries([
  "phase", "calibration", "camera-health", "motion", "follower", "object", "box", "preview", "reason", "confirm", "cancel", "reset", "frame-age",
].map((name) => [name, document.querySelector("#gesture-" + name)]));
const cameraCanvas = document.createElement("canvas");
cameraCanvas.width = 1280;
cameraCanvas.height = 720;
cameraCanvas.setAttribute("aria-label", "Live overhead camera with selectable object and destination tags");
document.querySelector("#gesture-camera-canvas").appendChild(cameraCanvas);
const cameraContext = cameraCanvas.getContext("2d");
const cameraTexture = new THREE.CanvasTexture(cameraCanvas);
cameraTexture.colorSpace = THREE.SRGBColorSpace;
const cameraPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75 * 720 / 1280), new THREE.MeshBasicMaterial({ map: cameraTexture }));
cameraPanel.position.set(-0.32, 1.6, -1.8);
scene.add(cameraPanel);
const railCanvas = document.createElement("canvas");
railCanvas.width = 600;
railCanvas.height = 1000;
const railContext = railCanvas.getContext("2d");
const railTexture = new THREE.CanvasTexture(railCanvas);
railTexture.colorSpace = THREE.SRGBColorSpace;
const taskRail = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1), new THREE.MeshBasicMaterial({ map: railTexture }));
taskRail.position.set(0.89, 1.6, -1.8);
scene.add(taskRail);
panel.visible = false;

let gestureSelection = initialGesturePickSelection();
let gestureStatus = null;
let gestureDetections = [];
let gestureBackend = null;
let gestureLastPoll = -Infinity;
let gestureServerTime = null;
let gestureServerTimeReceived = 0;
let gestureError = null;
let gestureBusy = false;
let gestureRevision = 0;
let cameraPath = null;
let cameraStreamReady = false;
let lastGestureDraw = 0;
let railSignature = "";
const cameraImage = new Image();
cameraImage.addEventListener("load", () => { cameraStreamReady = true; });
cameraImage.addEventListener("error", () => { cameraStreamReady = false; gestureError = "Camera stream failed. Check the dashboard camera."; });

function gestureAvailability() {
  const status = gestureSelection.restartRequested ? { ...gestureStatus, phase: gestureSelection.phase } : gestureStatus;
  const availability = gesturePickAvailability(status, gestureDetections, gestureBackend, gestureNow());
  if (performance.now() - gestureLastPoll > 1000 || !cameraStreamReady) {
    return { canSelect: false, canConfirm: false, reason: "Dashboard or camera stream is unavailable" };
  }
  return availability;
}

function gestureNow() {
  return gestureServerTime == null ? Date.now() / 1000
    : gestureObservationNow(gestureServerTime, gestureServerTimeReceived, performance.now());
}

function applyGestureSnapshot(snapshot) {
  if (!snapshot?.gesturePick?.status || !snapshot?.backend) throw new Error("Dashboard returned an invalid status");
  gestureStatus = snapshot.gesturePick.status;
  gestureDetections = snapshot.gesturePick.detections ?? [];
  const follower = snapshot.devices?.find((device) => device.id === gestureStatus.followerSide + "-follower");
  gestureBackend = {
    ...snapshot.backend,
    followerReady: Boolean(follower?.serialPort && follower.portPresent && follower.calibration === "calibrated"),
    exclusiveTaskReady: snapshot.task?.running !== true,
  };
  gestureSelection = reconcileGesturePickSelection(gestureSelection, gestureStatus);
  gestureLastPoll = performance.now();
  // Selection/preview status uses the dashboard's current clock. Executor status
  // updatedAt marks a stage change, so retain the last clock reference in execution.
  if (["idle", "selecting-object", "selecting-box", "preview"].includes(gestureStatus.phase)
      && Number.isFinite(gestureStatus.updatedAt)) {
    gestureServerTime = gestureStatus.updatedAt;
    gestureServerTimeReceived = gestureLastPoll;
  }
  // This Quest surface stays selection-only, including unconfigured/error states.
  gestureSurface.hidden = false;
  cameraPanel.visible = true;
  taskRail.visible = true;
  panel.visible = false;
  if (gestureStatus.cameraPath !== cameraPath) {
    cameraPath = gestureStatus.cameraPath;
    cameraStreamReady = false;
    cameraImage.removeAttribute("src");
    if (cameraPath) cameraImage.src = "/api/cameras/stream?path=" + encodeURIComponent(cameraPath);
  }
}

async function dashboardRequest(path, body) {
  const response = await fetch(path, {
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    cache: "no-store", signal: AbortSignal.timeout(3000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? ("Dashboard request failed (" + response.status + ")"));
  return result;
}

async function pollGesturePick() {
  const revision = gestureRevision;
  try {
    const snapshot = await dashboardRequest("/api/status");
    // A response started before a selection/Stop cannot overwrite its acknowledgement.
    if (revision === gestureRevision && !gestureBusy) applyGestureSnapshot(snapshot);
  } catch (error) {
    if (revision === gestureRevision) { gestureLastPoll = -Infinity; gestureError = error.message; }
  } finally {
    setTimeout(pollGesturePick, 200);
  }
}
pollGesturePick();

async function gestureAction(action, body = {}) {
  if (gestureBusy && action !== "cancel") return;
  const revision = ++gestureRevision;
  gestureBusy = true;
  gestureError = null;
  try {
    const snapshot = await dashboardRequest("/api/gesture-pick/" + action, body);
    if (revision === gestureRevision) applyGestureSnapshot(snapshot);
  } catch (error) {
    if (revision === gestureRevision) { gestureError = error.message; gestureLastPoll = -Infinity; }
  } finally {
    if (revision === gestureRevision) gestureBusy = false;
  }
}

function selectGestureTag(tag) {
  if (gestureBusy || !gestureAvailability().canSelect) return;
  const candidate = applyPinch(gestureSelection, { id: tag.tagId, kind: tag.kind });
  if (candidate === gestureSelection) return;
  // Publish only the dashboard acknowledgement, never an optimistic preview.
  gestureAction("select", { kind: tag.kind, tagId: tag.tagId });
}

function confirmGesturePick() {
  if (!gestureBusy && gestureAvailability().canConfirm) gestureAction("confirm", { taskId: gestureSelection.taskId });
}
gestureElements.confirm.addEventListener("click", confirmGesturePick);
gestureElements.cancel.addEventListener("click", () => gestureAction("cancel"));
function restartGesturePick() {
  if (gestureBusy || gestureStatus?.running) return;
  gestureSelection = restartGestureSelection(gestureSelection);
  gestureError = null;
}
gestureElements.reset.addEventListener("click", restartGesturePick);
cameraCanvas.addEventListener("click", (event) => {
  const rect = cameraCanvas.getBoundingClientRect();
  const tag = hitTestDetection(gestureDetections, { x: (event.clientX - rect.left) / rect.width, y: 1 - (event.clientY - rect.top) / rect.height }, [cameraCanvas.width, cameraCanvas.height], gestureNow());
  if (tag) selectGestureTag(tag);
});

const gesturePrompts = {
  "selecting-object": "Choose an object", "selecting-box": "Choose a destination",
  preview: "Review before motion", executing: "Executing guarded task",
  succeeded: "Command sequence completed", held: "Follower in Hold", failed: "Task failed",
};

function selectedTag(kind) {
  const id = gestureSelection.selection[kind === "object" ? "objectTagId" : "boxTagId"];
  const tag = gestureDetections.find((item) => item.tagId === id && item.kind === kind);
  const point = tag?.robotPoint;
  return { label: Number.isInteger(id) ? (kind === "object" ? "Object #" : "Destination #") + id : "None", point: point?.length === 3 ? point.map((value) => Number(value).toFixed(3)).join(", ") + " m" : "Position unavailable" };
}

function drawGestureRail() {
  const availability = gestureAvailability();
  const phase = gestureSelection.phase;
  const terminal = ["succeeded", "held", "failed"].includes(phase);
  const prompt = gestureBusy ? "Waiting for dashboard" : gesturePrompts[phase];
  const object = selectedTag("object");
  const box = selectedTag("box");
  const reason = gestureError || gestureSelection.reason || availability.reason || "";
  gestureElements.phase.textContent = prompt;
  gestureElements.calibration.textContent = gestureStatus?.calibrationValid ? "Valid" : "Required";
  gestureElements["camera-health"].textContent = gestureStatus?.cameraAvailable && cameraStreamReady ? "Connected" : "Unavailable";
  gestureElements.motion.textContent = gestureBackend?.latchedMotionLock ? "E-stop latched" : gestureBackend?.motionEnabled && gestureBackend?.simulated === false ? "Dashboard authorized" : "Locked";
  gestureElements.follower.textContent = gestureStatus?.followerSide ?? "Unassigned";
  gestureElements.object.textContent = "Object: " + object.label;
  gestureElements.box.textContent = "Destination: " + box.label;
  gestureElements.preview.textContent = phase === "preview" ? "Object at " + object.point + ". Destination at " + box.point + ". Fixed top-down grasp." : phase === "executing" ? "Stage: " + (gestureSelection.stage ?? "preflight") : "";
  gestureElements.reason.textContent = reason;
  gestureElements.confirm.disabled = gestureBusy || !availability.canConfirm;
  gestureElements.cancel.textContent = phase === "executing" ? "Stop / Hold" : "Cancel selection";
  gestureElements.cancel.disabled = !gestureStatus?.configured || terminal;
  gestureElements.reset.hidden = !terminal;
  gestureElements.reset.disabled = gestureBusy || gestureStatus?.running;
  gestureElements["frame-age"].textContent = gestureFrameTiming(gestureStatus, gestureNow());
  const lines = ["PICK AND PLACE", prompt, "Calibration: " + gestureElements.calibration.textContent, "Camera: " + gestureElements["camera-health"].textContent, "Motion: " + gestureElements.motion.textContent, "Follower: " + gestureElements.follower.textContent, object.label, object.point, box.label, box.point, phase === "executing" ? "Stage: " + (gestureSelection.stage ?? "preflight") : "Fixed top-down grasp", reason];
  const signature = JSON.stringify([lines, availability.canConfirm, gestureBusy, terminal, phase]);
  if (signature === railSignature) return;
  railSignature = signature;
  railContext.fillStyle = "#101b16";
  railContext.fillRect(0, 0, 600, 1000);
  railContext.font = "26px monospace";
  lines.forEach((line, index) => {
    railContext.fillStyle = index === 1 ? "#65e28a" : index === 11 ? "#ffd166" : "#e8fff0";
    // Wrap the server reason without clipping a critical failure explanation.
    const chunks = String(line ?? "").match(/.{1,34}(?:\s|$)|.{1,34}/g) ?? [""];
    chunks.slice(0, index === 11 ? 3 : 1).forEach((chunk, row) => railContext.fillText(chunk.trim(), 24, 42 + index * 51 + row * 30));
  });
  railContext.fillStyle = availability.canConfirm && !gestureBusy ? "#65e28a" : "#293e31";
  railContext.fillRect(24, 740, 552, 76);
  railContext.fillStyle = availability.canConfirm && !gestureBusy ? "#07110b" : "#abbcaf";
  railContext.fillText("CONFIRM PICK AND PLACE", 36, 787);
  railContext.fillStyle = "#26352c";
  railContext.fillRect(24, 838, 552, 76);
  railContext.fillStyle = "#e8fff0";
  railContext.fillText(terminal ? "CHOOSE ANOTHER TASK" : phase === "executing" ? "STOP / HOLD" : "CANCEL SELECTION", 36, 885);
  railContext.font = "21px monospace";
  railContext.fillText("Dashboard owns motion / E-stop", 24, 956);
  railTexture.needsUpdate = true;
}

function drawGestureCamera(now) {
  if (now - lastGestureDraw < 1000 / 15) return;
  lastGestureDraw = now;
  if (cameraStreamReady && cameraImage.naturalWidth > 0) {
    if (cameraCanvas.width !== cameraImage.naturalWidth || cameraCanvas.height !== cameraImage.naturalHeight) {
      cameraCanvas.width = cameraImage.naturalWidth;
      cameraCanvas.height = cameraImage.naturalHeight;
      cameraPanel.scale.y = (1.75 * cameraCanvas.height / cameraCanvas.width) / (1.75 * 720 / 1280);
    }
    cameraContext.drawImage(cameraImage, 0, 0, cameraCanvas.width, cameraCanvas.height);
  } else {
    cameraContext.fillStyle = "#101b16";
    cameraContext.fillRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    cameraContext.fillStyle = "#abbcaf";
    cameraContext.font = "28px monospace";
    cameraContext.fillText("OVERHEAD CAMERA UNAVAILABLE", 40, cameraCanvas.height / 2);
  }
  if (gestureAvailability().canSelect || gestureSelection.phase === "preview") {
    for (const tag of usableGestureDetections(gestureDetections, gestureNow())) {
      const [x, y] = tag.imageCenter;
      const width = cameraCanvas.width * 0.09;
      const height = cameraCanvas.height * 0.12;
      const selected = Object.values(gestureSelection.selection).includes(tag.tagId);
      cameraContext.strokeStyle = selected ? "#65e28a" : "#e8fff0";
      cameraContext.lineWidth = selected ? 5 : 3;
      cameraContext.beginPath();
      if (tag.kind === "box") cameraContext.roundRect(x - width / 2, y - height / 2, width, height, 12);
      else cameraContext.rect(x - width / 2, y - height / 2, width, height);
      cameraContext.stroke();
      cameraContext.fillStyle = "#07110b";
      cameraContext.fillRect(x - width / 2, y - height / 2 - 30, Math.max(width, 170), 30);
      cameraContext.fillStyle = selected ? "#65e28a" : "#e8fff0";
      cameraContext.font = "22px monospace";
      cameraContext.fillText(tag.kind.toUpperCase() + " #" + tag.tagId, x - width / 2 + 5, y - height / 2 - 7);
    }
  }
  // This canvas is the native VR camera texture, not just the desktop label.
  drawGestureFrameTiming(cameraContext, cameraCanvas.width, gestureStatus, gestureNow());
  cameraTexture.needsUpdate = true;
}

const selectionRaycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const rayRotation = new THREE.Quaternion();
const forwardAxis = new THREE.Vector3(0, 0, -1);
const gestureInputs = [];
for (let index = 0; index < 2; index += 1) {
  const ray = renderer.xr.getController(index);
  scene.add(ray);
  const hand = renderer.xr.getHand(index);
  scene.add(hand);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2)]), new THREE.LineBasicMaterial({ color: 0x65e28a }));
  scene.add(line);
  line.visible = false;
  const input = { ray, hand, line, source: null, pinched: true, lastAcceptedAt: -Infinity };
  gestureInputs.push(input);
  ray.addEventListener("connected", (event) => { input.source = event.data; input.pinched = true; });
  ray.addEventListener("disconnected", () => { input.source = null; input.pinched = true; line.visible = false; });
}

function updateGestureInput(now) {
  cameraPanel.updateMatrixWorld();
  taskRail.updateMatrixWorld();
  for (const input of gestureInputs) {
    let pressed = false;
    let tracked = input.source && input.ray.visible;
    if (input.source?.hand) {
      const tip = input.hand.joints["index-finger-tip"];
      const distal = input.hand.joints["index-finger-phalanx-distal"];
      const thumb = input.hand.joints["thumb-tip"];
      tracked = tracked && tip?.visible && distal?.visible && thumb?.visible;
      if (tracked) {
        tip.getWorldPosition(rayOrigin);
        distal.getWorldPosition(rayDirection);
        rayDirection.subVectors(rayOrigin, rayDirection).normalize();
        const distance = tip.position.distanceTo(thumb.position);
        pressed = distance < (input.pinched ? 0.028 : 0.018);
      }
    } else if (tracked) {
      input.ray.getWorldPosition(rayOrigin);
      input.ray.getWorldQuaternion(rayRotation);
      rayDirection.copy(forwardAxis).applyQuaternion(rayRotation);
      pressed = (input.source.gamepad?.buttons[0]?.value ?? 0) > 0.7;
    }
    input.line.visible = Boolean(tracked && gestureStatus?.configured);
    if (!tracked) { input.pinched = true; continue; }
    input.line.position.copy(rayOrigin);
    input.line.quaternion.setFromUnitVectors(forwardAxis, rayDirection);
    selectionRaycaster.set(rayOrigin, rayDirection);
    const hit = selectionRaycaster.intersectObjects([cameraPanel, taskRail].filter((mesh) => mesh.visible))[0];
    input.line.scale.z = hit ? hit.distance / 2 : 1;
    if (pressed && shouldAcceptPinch(input, now / 1000)) {
      input.lastAcceptedAt = now / 1000;
      if (hit?.object === cameraPanel) {
        const tag = hitTestDetection(gestureDetections, hit.uv, [cameraCanvas.width, cameraCanvas.height], gestureNow());
        if (tag) selectGestureTag(tag);
      } else if (hit?.object === taskRail) {
        const x = hit.uv.x * 600;
        const y = (1 - hit.uv.y) * 1000;
        if (x >= 24 && x <= 576 && y >= 740 && y <= 816) confirmGesturePick();
        if (x >= 24 && x <= 576 && y >= 838 && y <= 914 && gestureStatus?.configured) {
          if (["succeeded", "held", "failed"].includes(gestureSelection.phase)) restartGesturePick();
          else gestureAction("cancel");
        }
      }
    }
    input.pinched = pressed;
  }
}

function number(value) {
  return Number(value).toFixed(4);
}

function stateText(state) {
  if (!state.connected) return `${state.handedness.toUpperCase()} CONTROLLER\nDisconnected`;
  const p = state.position;
  const q = state.rotation;
  return [
    `${state.handedness.toUpperCase()} CONTROLLER`,
    `Position: ${number(p.x)} ${number(p.y)} ${number(p.z)}`,
    `Rotation: ${number(q.x)} ${number(q.y)} ${number(q.z)} ${number(q.w)}`,
    `Trigger:  ${number(state.trigger)}`,
    `Grip:     ${number(state.squeeze)}`,
  ].join("\n");
}

function updateState(state) {
  if (!state.connected || !state.grip) return;
  state.grip.getWorldPosition(state.position);
  state.grip.getWorldQuaternion(state.rotation);
  const buttons = state.inputSource?.gamepad?.buttons ?? [];
  state.trigger = buttons[0]?.value ?? 0;
  state.squeeze = buttons[1]?.value ?? 0;
}

function drawPanel(leftText, rightText) {
  panelContext.fillStyle = "rgba(2, 15, 7, 0.94)";
  panelContext.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
  panelContext.strokeStyle = "#55dd77";
  panelContext.lineWidth = 5;
  panelContext.strokeRect(5, 5, panelCanvas.width - 10, panelCanvas.height - 10);
  panelContext.fillStyle = "#e8fff0";
  panelContext.font = "28px monospace";
  [leftText, rightText].forEach((text, column) => {
    text.split("\n").forEach((line, row) => panelContext.fillText(line, 35 + column * 500, 65 + row * 62));
  });
  panelTexture.needsUpdate = true;
}

statusElement.textContent = emulatorActive
  ? "WebXR emulator active — press START EMULATED VR."
  : "Native WebXR ready — press ENTER VR.";

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  animateVirtualRobot(virtualRobots.left, deltaSeconds);
  animateVirtualRobot(virtualRobots.right, deltaSeconds);
  updateState(states.left);
  updateState(states.right);
  const leftText = stateText(states.left);
  const rightText = stateText(states.right);
  document.querySelector("#left").textContent = leftText;
  document.querySelector("#right").textContent = rightText;
  drawPanel(leftText, rightText);
  const now = performance.now();
  drawGestureCamera(now);
  drawGestureRail();
  updateGestureInput(now);
  if (socket?.readyState === WebSocket.OPEN && now - lastSendTime >= 1000 / 60) {
    const handPayload = (state) => gesturePosePayload({
      connected: state.connected,
      position: state.position.toArray(),
      rotation: state.rotation.toArray(),
      trigger: state.trigger,
      grip: state.squeeze,
    });
    socket.send(JSON.stringify({
      sequence: sequence++,
      timestamp: Date.now() / 1000,
      left: handPayload(states.left),
      right: handPayload(states.right),
    }));
    lastSendTime = now;
  }
  renderer.render(scene, camera);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
