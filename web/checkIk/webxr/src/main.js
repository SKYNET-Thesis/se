import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";
import robotModelUrl from "../../arm.glb?url";
import "./style.css";

const query = new URLSearchParams(location.search);
const passthroughMode = query.get("mode") === "real";
const activeHand = query.get("hand") === "left" ? "left" : "right";
const requestedSessionMode = passthroughMode ? "immersive-ar" : "immersive-vr";

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
scene.background = passthroughMode ? null : vrBackground;

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 1.5);
camera.lookAt(0, 1.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, passthroughMode ? 0 : 1);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

const statusElement = document.querySelector("#status");
const xrToggle = document.querySelector("#xr-toggle");
let xrSession = null;
xrToggle.textContent = emulatorActive ? "START EMULATED VR" : passthroughMode ? "ENTER PASSTHROUGH" : "ENTER VR";
xrToggle.addEventListener("click", async () => {
  try {
    if (xrSession) {
      await xrSession.end();
      return;
    }
    const sessionMode = requestedSessionMode;
    statusElement.textContent = `Requesting ${sessionMode} session…`;
    const session = await navigator.xr.requestSession(sessionMode, {
      optionalFeatures: ["local-floor", "bounded-floor", "dom-overlay", "hand-tracking"],
      domOverlay: { root: document.body },
    });
    const mixedReality = sessionMode === "immersive-ar";
    scene.background = mixedReality ? null : vrBackground;
    grid.visible = !mixedReality;
    xrSession = session;
    session.addEventListener("end", () => {
      xrSession = null;
      scene.background = passthroughMode ? null : vrBackground;
      grid.visible = !passthroughMode;
      xrToggle.textContent = emulatorActive ? "START EMULATED VR" : passthroughMode ? "ENTER PASSTHROUGH" : "ENTER VR";
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
grid.visible = !passthroughMode;
scene.add(grid);

// Hybrid near field: real 3D geometry provides parallax while walking around
// the teleoperation station; the distant command center is a 360 panorama.
const nearFloor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 96),
  new THREE.MeshStandardMaterial({ color: 0x18212e, roughness: 0.92, metalness: 0.08 }),
);
nearFloor.rotation.x = -Math.PI / 2;
nearFloor.position.y = -0.012;
nearFloor.receiveShadow = true;
scene.add(nearFloor);
nearFloor.visible = !passthroughMode;

// Virtual workbench: the user stands at +Z, with both robot bases close to
// them and both arms extending away along -Z, matching the phosphobot layout.
const fallbackTable = new THREE.Mesh(
  new THREE.BoxGeometry(1.25, 0.08, 1.55),
  new THREE.MeshStandardMaterial({ color: 0x9b7048, roughness: 0.88 }),
);
fallbackTable.position.set(0, 0.72, -1.02);
fallbackTable.receiveShadow = true;
scene.add(fallbackTable);
fallbackTable.visible = !passthroughMode;

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
const handFrameGizmos = {
  left: new THREE.AxesHelper(0.12),
  right: new THREE.AxesHelper(0.12),
};
for (const gizmo of Object.values(handFrameGizmos)) {
  gizmo.visible = false;
  gizmo.renderOrder = 20;
  scene.add(gizmo);
}

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

function boundsOf(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function placeAsset(object, { targetSpan, centerX, centerZ, floorY }) {
  let box = boundsOf(object);
  const size = box.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(size.x, size.z);
  if (!Number.isFinite(horizontalSpan) || horizontalSpan <= 1e-6) {
    throw new Error("Asset has invalid or empty bounds");
  }
  object.scale.multiplyScalar(targetSpan / horizontalSpan);
  box = boundsOf(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x += centerX - center.x;
  object.position.y += floorY - box.min.y;
  object.position.z += centerZ - center.z;
  object.updateWorldMatrix(true, true);
  return boundsOf(object);
}

const environmentLoader = new GLTFLoader();
if (!passthroughMode) new THREE.TextureLoader().load(
  "/assets/command_center_360.jpg",
  (panorama) => {
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.wrapS = THREE.RepeatWrapping;
    panorama.needsUpdate = true;

    // scene.background can disappear in Quest's immersive compositor.  An
    // inward-facing sphere is ordinary stereo geometry, so it renders in both
    // XR eyes consistently while remaining centered around the play space.
    const skySphere = new THREE.Mesh(
      new THREE.SphereGeometry(45, 64, 32),
      new THREE.MeshBasicMaterial({
        map: panorama,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    skySphere.name = "CommandCenter360Sphere";
    skySphere.rotation.y = Math.PI;
    skySphere.frustumCulled = false;
    skySphere.renderOrder = -1000;
    scene.add(skySphere);
    grid.visible = false;
    environmentStatus.textContent = "Hybrid command center: 360 background + 3D workspace loaded";
  },
  undefined,
  (error) => {
    console.error("Failed to load command-center panorama", error);
    environmentStatus.textContent = "Hybrid background failed; using fallback grid";
  },
);

if (!passthroughMode) environmentLoader.load(
  "/assets/lab_table.glb",
  (gltf) => {
    const labTable = gltf.scene;
    labTable.name = "UnityLabTable";
    labTable.rotation.y = Math.PI / 2;
    const boxBeforeScale = boundsOf(labTable);
    const height = boxBeforeScale.getSize(new THREE.Vector3()).y;
    if (!Number.isFinite(height) || height <= 1e-6) throw new Error("Lab table has invalid bounds");
    labTable.scale.multiplyScalar(0.76 / height);
    let box = boundsOf(labTable);
    const center = box.getCenter(new THREE.Vector3());
    labTable.position.add(new THREE.Vector3(-center.x, -box.min.y, -1.02 - center.z));
    scene.add(labTable);
    fallbackTable.visible = false;
  },
  undefined,
  (error) => console.error("Failed to load Unity lab table; keeping fallback", error),
);

if (!passthroughMode) environmentLoader.load(
  "/assets/laboratory_environment.glb",
  (gltf) => {
    const sourceChair = gltf.scene.getObjectByName("chair (1)") ?? gltf.scene.getObjectByName("chair");
    if (!sourceChair) throw new Error("Chair node is missing from laboratory environment");
    const chairTemplate = sourceChair.clone(true);
    chairTemplate.position.set(0, 0, 0);
    chairTemplate.rotation.set(0, 0, 0);
    chairTemplate.scale.set(1, 1, 1);
    const initial = boundsOf(chairTemplate);
    const height = initial.getSize(new THREE.Vector3()).y;
    if (!Number.isFinite(height) || height <= 1e-6) throw new Error("Chair has invalid bounds");
    chairTemplate.scale.multiplyScalar(0.92 / height);

    const addChair = (name, x, z, yaw) => {
      const chair = chairTemplate.clone(true);
      chair.name = name;
      chair.rotation.y = yaw;
      const box = boundsOf(chair);
      const center = box.getCenter(new THREE.Vector3());
      chair.position.add(new THREE.Vector3(x - center.x, -box.min.y, z - center.z));
      chair.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      scene.add(chair);
    };
    addChair("UnityLabChairLeft", -1.35, 0.35, 0);
    addChair("UnityLabChairRight", 1.35, 0.35, 0);
  },
  undefined,
  (error) => console.error("Failed to load Unity lab chairs", error),
);

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
  // Keep the two bases far enough apart that the arms do not overlap at the
  // bent teleoperation rest pose.  Moving the pair slightly farther from the
  // viewer also prevents either arm being clipped at narrow browser ratios.
  root.position.set(hand === "left" ? -0.34 : 0.34, 0.78, -0.68);
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
  // Always consume the newest target. Animation damping below is enough to
  // remove visible quantization; another EMA here created a noticeable tail.
  robot.targetQ = [...result.joint_positions];
  robot.targetGripper = result.gripper ?? 0;
}

function animateVirtualRobot(robot, deltaSeconds) {
  if (!robot) return;
  jointNames.forEach((name, index) => {
    const joint = robot.joints[name];
    robot.displayedQ[index] = THREE.MathUtils.damp(
      robot.displayedQ[index], robot.targetQ[index], 45, deltaSeconds,
    );
    jointRotation.setFromAxisAngle(jointAxis, robot.displayedQ[index]);
    joint.node.quaternion.copy(joint.rest).multiply(jointRotation);
  });
  if (robot.gripper) {
    robot.displayedGripper = THREE.MathUtils.damp(
      robot.displayedGripper, robot.targetGripper, 45, deltaSeconds,
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

if (!passthroughMode) new GLTFLoader().load(
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
  socket.addEventListener("open", () => {
    socketStatus.textContent = "WebSocket: bridge connected — waiting for server mode";
  });
  socket.addEventListener("message", (event) => {
    const reply = JSON.parse(event.data);
    const mode = reply.status === "hardware_ok" ? "REAL ROBOT" : reply.status === "offline_ik_ok" ? "OFFLINE IK" : reply.status;
    const active = reply.commanded_hands ?? reply.active_hands ?? [];
    socketStatus.textContent = `WebSocket: ${mode}${active.length ? ` — active ${active.join(", ")}` : passthroughMode ? " — control OFF" : " — Grip released"}`;
    for (const [hand, result] of Object.entries(reply.results ?? {})) {
      // Offline: show the current IK solution immediately. Real robot: show
      // the exact slew-limited command accepted by the follower bus, so the
      // virtual and physical arms advance together rather than one chasing
      // the other.
      const accepted = reply.status === "hardware_ok" ? reply.hardware_pose?.[hand] : null;
      setVirtualRobotPose(hand, accepted ? { success: true, ...accepted } : result);
    }
  });
  socket.addEventListener("close", () => {
    // Never carry a latched motion-enable across a bridge restart or network
    // outage. The operator must deliberately press A/X again after reconnect.
    for (const state of Object.values(states)) {
      state.teleopEnabled = false;
      state.primaryWasPressed = false;
    }
    socketStatus.textContent = "WebSocket: disconnected; retrying…";
    reconnectTimer = setTimeout(connectSocket, 1000);
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
    teleopEnabled: false,
    primaryWasPressed: false,
    sourceType: "controller",
    hand: null,
    handTracked: false,
    middlePinchStartedAt: null,
    middlePinchLatched: false,
    pinchDistance: null,
  };
}

const HAND_TOGGLE_DISTANCE_M = 0.025;
const HAND_TOGGLE_HOLD_MS = 650;
const HAND_GRIP_CLOSED_M = 0.018;
const HAND_GRIP_OPEN_M = 0.075;

function jointWorldPosition(hand, name, target) {
  const joint = hand.joints?.[name];
  if (!joint || !joint.visible) return false;
  joint.getWorldPosition(target);
  return Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z);
}

function resetHandTracking(state) {
  state.handTracked = false;
  state.middlePinchStartedAt = null;
  state.middlePinchLatched = false;
  state.pinchDistance = null;
  state.teleopEnabled = false;
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

// Optical hand tracking shares the existing Cartesian/IK protocol. The wrist
// drives the TCP, thumb/index drives the gripper, and thumb/middle is a
// separate deliberate toggle so closing the gripper cannot enable motion.
for (let index = 0; index < 2; index += 1) {
  const hand = renderer.xr.getHand(index);
  scene.add(hand);
  hand.addEventListener("connected", (event) => {
    const handedness = event.data.handedness;
    if (!(handedness in states) || !event.data.hand) return;
    Object.assign(states[handedness], {
      connected: true,
      sourceType: "hand",
      hand,
      inputSource: event.data,
    });
  });
  hand.addEventListener("disconnected", (event) => {
    const handedness = event.data?.handedness;
    if (!(handedness in states)) return;
    const state = states[handedness];
    if (state.hand === hand) Object.assign(state, makeState(handedness));
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
if (passthroughMode) {
  panel.scale.setScalar(0.48);
  panel.position.set(activeHand === "left" ? -0.42 : 0.42, 1.25, -1.15);
}
scene.add(panel);

function number(value) {
  return Number(value).toFixed(4);
}

function stateText(state) {
  if (!state.connected) return `${state.handedness.toUpperCase()} INPUT\nDisconnected`;
  const p = state.position;
  const q = state.rotation;
  return [
    `${state.handedness.toUpperCase()} ${state.sourceType.toUpperCase()}`,
    `Position: ${number(p.x)} ${number(p.y)} ${number(p.z)}`,
    `Rotation: ${number(q.x)} ${number(q.y)} ${number(q.z)} ${number(q.w)}`,
    `Trigger:  ${number(state.trigger)}`,
    `Grip:     ${number(state.squeeze)}`,
    state.sourceType === "hand"
      ? `Pinch:    ${state.pinchDistance == null ? "Not tracked" : `${number(state.pinchDistance)} m`}`
      : "",
    passthroughMode
      ? `Teleop:   ${state.teleopEnabled ? "ON" : "OFF"} (${state.sourceType === "hand" ? "thumb+middle hold" : "A/X toggles"})`
      : "",
  ].filter(Boolean).join("\n");
}

function updateState(state) {
  if (!state.connected) return;
  if (state.sourceType === "hand") {
    const wrist = state.hand?.joints?.wrist;
    const thumb = new THREE.Vector3();
    const index = new THREE.Vector3();
    const middle = new THREE.Vector3();
    const indexBase = new THREE.Vector3();
    const middleBase = new THREE.Vector3();
    const pinkyBase = new THREE.Vector3();
    const tracked = wrist?.visible
      && jointWorldPosition(state.hand, "thumb-tip", thumb)
      && jointWorldPosition(state.hand, "index-finger-tip", index)
      && jointWorldPosition(state.hand, "middle-finger-tip", middle)
      && jointWorldPosition(state.hand, "index-finger-metacarpal", indexBase)
      && jointWorldPosition(state.hand, "middle-finger-metacarpal", middleBase)
      && jointWorldPosition(state.hand, "pinky-finger-metacarpal", pinkyBase);
    if (!tracked) {
      resetHandTracking(state);
      return;
    }
    state.handTracked = true;
    const wristPosition = new THREE.Vector3();
    wrist.getWorldPosition(wristPosition);
    // Average several rigid palm landmarks. This is less sensitive to one
    // noisy XRJointPose than using the wrist joint alone.
    state.position.copy(wristPosition)
      .add(indexBase)
      .add(middleBase)
      .add(pinkyBase)
      .multiplyScalar(0.25);

    // Build an orthonormal palm frame from multiple landmarks, mirroring the
    // robust hand-frame approach used by BeaVR. The backend currently keeps
    // hand-mode wrist joints locked; this frame can be enabled only after its
    // physical axis signs have been verified offline.
    const palmX = pinkyBase.clone().sub(indexBase);
    const palmYHint = middleBase.clone().sub(wristPosition);
    const palmZ = palmX.clone().cross(palmYHint);
    if (palmX.lengthSq() < 1e-8 || palmYHint.lengthSq() < 1e-8 || palmZ.lengthSq() < 1e-10) {
      resetHandTracking(state);
      return;
    }
    palmX.normalize();
    palmYHint.normalize();
    palmZ.normalize();
    const palmY = palmZ.clone().cross(palmX).normalize();
    const palmMatrix = new THREE.Matrix4().makeBasis(palmX, palmY, palmZ);
    state.rotation.setFromRotationMatrix(palmMatrix).normalize();
    state.pinchDistance = thumb.distanceTo(index);
    const gripOpenFraction = THREE.MathUtils.clamp(
      (state.pinchDistance - HAND_GRIP_CLOSED_M) / (HAND_GRIP_OPEN_M - HAND_GRIP_CLOSED_M),
      0,
      1,
    );
    state.trigger += 0.35 * ((1 - gripOpenFraction) - state.trigger);
    state.squeeze = 0;

    const togglePinched = thumb.distanceTo(middle) <= HAND_TOGGLE_DISTANCE_M;
    if (togglePinched && state.middlePinchStartedAt == null && !state.middlePinchLatched) {
      state.middlePinchStartedAt = performance.now();
    }
    if (togglePinched && !state.middlePinchLatched
        && performance.now() - state.middlePinchStartedAt >= HAND_TOGGLE_HOLD_MS) {
      state.teleopEnabled = !state.teleopEnabled;
      state.middlePinchLatched = true;
    }
    if (!togglePinched) {
      state.middlePinchStartedAt = null;
      state.middlePinchLatched = false;
    }
    return;
  }
  if (!state.grip) return;
  state.grip.getWorldPosition(state.position);
  state.grip.getWorldQuaternion(state.rotation);
  const buttons = state.inputSource?.gamepad?.buttons ?? [];
  state.trigger = buttons[0]?.value ?? 0;
  state.squeeze = buttons[1]?.value ?? 0;
  // Quest's primary face button is A on the right controller and X on the
  // left controller in the WebXR "xr-standard" gamepad mapping. Real mode
  // uses an edge-triggered latch like Phospho: press once to clutch in, press
  // again to clutch out. Offline mode keeps the original hold-Grip behavior.
  const primaryPressed = buttons[4]?.pressed ?? false;
  if (passthroughMode && primaryPressed && !state.primaryWasPressed) {
    state.teleopEnabled = !state.teleopEnabled;
  }
  state.primaryWasPressed = primaryPressed;
}

function updateHandFrameGizmo(state) {
  const gizmo = handFrameGizmos[state.handedness];
  const visible = state.sourceType === "hand" && state.handTracked;
  gizmo.visible = visible;
  if (!visible) return;
  gizmo.position.copy(state.position);
  gizmo.quaternion.copy(state.rotation);
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
  : passthroughMode
    ? `Passthrough ready — ${activeHand.toUpperCase()} controller controls the real ${activeHand} follower.`
    : "Native WebXR ready — press ENTER VR.";
modelStatus.textContent = passthroughMode
  ? "Passthrough mode: GLB digital twins disabled"
  : modelStatus.textContent;
environmentStatus.textContent = passthroughMode
  ? "Real surroundings visible through Quest passthrough"
  : environmentStatus.textContent;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  animateVirtualRobot(virtualRobots.left, deltaSeconds);
  animateVirtualRobot(virtualRobots.right, deltaSeconds);
  updateState(states.left);
  updateState(states.right);
  updateHandFrameGizmo(states.left);
  updateHandFrameGizmo(states.right);
  const leftText = stateText(states.left);
  const rightText = stateText(states.right);
  document.querySelector("#left").textContent = leftText;
  document.querySelector("#right").textContent = rightText;
  drawPanel(leftText, rightText);
  const now = performance.now();
  if (socket?.readyState === WebSocket.OPEN && now - lastSendTime >= 1000 / 60) {
    const handPayload = (state) => ({
      connected: state.connected,
      enabled: state.connected && (
        state.sourceType === "hand"
          ? state.handTracked && state.teleopEnabled && state.handedness === activeHand
          : passthroughMode
          ? state.teleopEnabled && state.handedness === activeHand
          : state.squeeze >= 0.5
      ),
      position: state.position.toArray(),
      rotation: state.rotation.toArray(),
      trigger: state.trigger,
      grip: state.squeeze,
      source: state.sourceType,
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
