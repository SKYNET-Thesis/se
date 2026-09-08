import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";
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
      optionalFeatures: ["local-floor", "bounded-floor"],
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
  if (socket?.readyState === WebSocket.OPEN && now - lastSendTime >= 1000 / 60) {
    const handPayload = (state) => ({
      connected: state.connected,
      enabled: state.connected && state.squeeze >= 0.5,
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
