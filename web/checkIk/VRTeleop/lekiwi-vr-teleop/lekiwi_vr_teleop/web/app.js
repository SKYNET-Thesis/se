/*
 * WebXR client for LeKiwi teleoperation.
 *
 * Reads both Touch controllers, converts their poses into the arm base frame, and streams
 * them to the Python relay over a WebSocket. Draws the robot's camera streams and a
 * telemetry board as world-locked panels so the operator never has to leave VR.
 *
 * Deliberately dependency-free: no CDN, no bundler. The headset may be reached over
 * `adb reverse` with no route to the internet.
 */

'use strict';

// ---------------------------------------------------------------- frame conversion

// v_base = VR_TO_BASE * v_vr. WebXR local-floor is +X right, +Y up, -Z forward;
// the SO-101 base frame is +X forward, +Y left, +Z up. Mirrored in Python by frames.py —
// keep the two in sync.
const VR_TO_BASE = [
  [0, 0, -1],
  [-1, 0, 0],
  [0, 1, 0],
];

function positionToBase(p) {
  return [
    VR_TO_BASE[0][0] * p.x + VR_TO_BASE[0][1] * p.y + VR_TO_BASE[0][2] * p.z,
    VR_TO_BASE[1][0] * p.x + VR_TO_BASE[1][1] * p.y + VR_TO_BASE[1][2] * p.z,
    VR_TO_BASE[2][0] * p.x + VR_TO_BASE[2][1] * p.y + VR_TO_BASE[2][2] * p.z,
  ];
}

/* Rotate an orientation quaternion into the base frame: R_base = M * R_vr * M^T.
 * Done on 3x3 matrices because the change of basis is a fixed rotation and this keeps the
 * derivation readable next to VR_TO_BASE. */
function quaternionToBase(q) {
  const { x, y, z, w } = q;
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const m = VR_TO_BASE;
  const mr = [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[i][0] * r[0][j] + m[i][1] * r[1][j] + m[i][2] * r[2][j]));
  const out = [0, 1, 2].map((i) => [0, 1, 2].map((j) => mr[i][0] * m[j][0] + mr[i][1] * m[j][1] + mr[i][2] * m[j][2]));
  return matrixToQuat(out);
}

function matrixToQuat(m) {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let qw, qx, qy, qz;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    qw = 0.25 * s;
    qx = (m[2][1] - m[1][2]) / s;
    qy = (m[0][2] - m[2][0]) / s;
    qz = (m[1][0] - m[0][1]) / s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2;
    qw = (m[2][1] - m[1][2]) / s;
    qx = 0.25 * s;
    qy = (m[0][1] + m[1][0]) / s;
    qz = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2;
    qw = (m[0][2] - m[2][0]) / s;
    qx = (m[0][1] + m[1][0]) / s;
    qy = 0.25 * s;
    qz = (m[1][2] + m[2][1]) / s;
  } else {
    const s = Math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2;
    qw = (m[1][0] - m[0][1]) / s;
    qx = (m[0][2] + m[2][0]) / s;
    qy = (m[1][2] + m[2][1]) / s;
    qz = 0.25 * s;
  }
  return [qx, qy, qz, qw];
}

// ---------------------------------------------------------------- tiny mat4 helpers

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* Panel model matrix: yaw about +Y, then translate. Scale carries the panel size. */
function panelMatrix(position, yaw, width, height) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * width, 0, -s * width, 0,
    0, height, 0, 0,
    s, 0, c, 0,
    position[0], position[1], position[2], 1,
  ]);
}

// ---------------------------------------------------------------- WebGL panels

const VERTEX_SHADER = `
attribute vec2 aPos;
uniform mat4 uMVP;
varying vec2 vUV;
void main() {
  vUV = vec2(aPos.x + 0.5, 0.5 - aPos.y);
  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUV;
void main() {
  // The texture's own alpha is honoured, not discarded: the controller markers are
  // transparent outside their glyph, and in passthrough the room must show through.
  vec4 texel = texture2D(uTex, vUV);
  gl_FragColor = vec4(texel.rgb, texel.a * uAlpha);
}`;

class PanelRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = this._buildProgram();
    this.aPos = gl.getAttribLocation(this.program, 'aPos');
    this.uMVP = gl.getUniformLocation(this.program, 'uMVP');
    this.uTex = gl.getUniformLocation(this.program, 'uTex');
    this.uAlpha = gl.getUniformLocation(this.program, 'uAlpha');
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );
  }

  _buildProgram() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // One opaque pixel, so a panel whose stream has not arrived yet still draws.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 24, 32, 255]));
    return texture;
  }

  upload(texture, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  draw(texture, mvp, alpha) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uTex, 0);
    gl.uniform1f(this.uAlpha, alpha);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// ---------------------------------------------------------------- panel layout

/* Offsets from the operator's HEAD, not absolute heights in the room.
 *
 * These were absolute local-floor positions at first, around y = 1.3 m, which assumes a
 * standing adult. The headset reported headY = 0.84 m — seated — putting every panel half
 * a metre above the field of view: drawn, composited, and never seen. Anchoring to the
 * head makes the layout independent of posture, floor calibration and which way the
 * operator happened to face when the session started. */
/* The skeleton hangs below the front camera panel, near enough that a glance takes it in
 * without leaving the camera view: scale 0.5 puts a 0.45 m arm at ~22 cm, and the offset
 * is ~28 deg below the line of sight, clear of the panel's bottom edge.
 *
 * The yaw is not zero, and that is a deliberate trade. Facing the model the same way the
 * operator faces would keep "left is left" — but at shoulder_pan near zero the arm's whole
 * plane is then edge-on, and the shoulder, elbow and wrist bends collapse into one line at
 * exactly the moment they matter most. Turned 40 deg the plane is oblique and all four
 * segments read separately. The operator's control frame is their own hand; this is an
 * instrument, and an instrument that cannot be read is worse than one that is turned. */
const GHOST = { offset: [0, -0.62, -1.15], yaw: -0.7, scale: 0.5 };

/* With two arms each skeleton moves aside, so they read as a pair rather than overlapping
 * into one unreadable tangle. With one arm nothing shifts. */
const GHOST_SPREAD = { left: -0.42, right: 0.42 };

function ghostPlacement(anchor, hand, arms) {
  const spread = arms > 1 ? GHOST_SPREAD[hand] || 0 : 0;
  const panel = { ...GHOST, offset: [GHOST.offset[0] + spread, GHOST.offset[1], GHOST.offset[2]] };
  return window.armGhostPlacement(placePanel(anchor, panel), GHOST.scale, anchor.yaw + GHOST.yaw);
}

const PANELS = [
  { key: 'front', offset: [0, -0.05, -1.4], yaw: 0, width: 1.0, height: 0.75 },
  { key: 'wrist', offset: [1.0, -0.2, -0.95], yaw: -0.6, width: 0.6, height: 0.45 },
  { key: 'telemetry', offset: [-1.0, -0.15, -0.95], yaw: 0.6, width: 0.85, height: 0.64 },
];

/* Rotation about the WebXR up axis, applied to a position and to an orientation.
 *
 * Controller poses are de-yawed by the anchor heading before they leave the page, so hand
 * motion is measured relative to the direction the operator is FACING rather than to the
 * arbitrary heading the room's coordinate system happened to start with. Without it,
 * "push the hand away" means a different robot-frame direction every time the operator
 * turns on the spot, which is exactly as unpredictable as it sounds. Tapping the stick
 * (recentre) re-latches the heading. */
function rotateY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

function rotateQuaternionY(q, angle) {
  const s = Math.sin(angle / 2);
  const c = Math.cos(angle / 2);
  // (0, s, 0, c) * (x, y, z, w)
  return {
    x: c * q.x + s * q.z,
    y: c * q.y + s * q.w,
    z: c * q.z - s * q.x,
    w: c * q.w - s * q.y,
  };
}

/* Yaw only: panels stay upright however the operator tilts their head. */
function yawOf(quaternion) {
  const { x, y, z, w } = quaternion;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function placePanel(anchor, panel) {
  const c = Math.cos(anchor.yaw);
  const s = Math.sin(anchor.yaw);
  const [ox, oy, oz] = panel.offset;
  return [
    anchor.position[0] + c * ox + s * oz,
    anchor.position[1] + oy,
    anchor.position[2] - s * ox + c * oz,
  ];
}

const PANEL_TITLES = { front: 'CAMERA THÂN ROBOT', wrist: 'CAMERA CỔ TAY' };

const EXIT_HOLD_MS = 1500;

/* Hold B/Y this long, with the clutch held, to send the arm to its ready posture. Long
 * enough that it cannot be brushed; short enough to be worth doing. */
const READY_HOLD_MS = 1000;

/* Short joint labels. The wire names do not fit the board at a legible size, and a
 * truncated "shoulder_lif" is worse than a word the operator reads at a glance. */
const HAND_LABELS = { left: 'trái', right: 'phải' };

const JOINT_LABELS = {
  shoulder_pan: 'xoay vai',
  shoulder_lift: 'nâng vai',
  elbow_flex: 'khuỷu',
  wrist_flex: 'gập cổ tay',
  wrist_roll: 'xoay cổ tay',
  gripper: 'kẹp',
};

// ---------------------------------------------------------------- application

class TeleopClient {
  constructor() {
    this.ws = null;
    this.session = null;
    this.refSpace = null;
    this.gl = null;
    this.renderer = null;
    this.textures = {};
    this.images = {};
    this.telemetryCanvas = null;
    this.status = {};
    this.rttMs = null;
    this.stopped = false;
    this.frameCount = 0;
    this.handClutch = { left: false, right: false };
    this.handGestureDown = { left: false, right: false };
    this.handGestureChangedAt = { left: 0, right: 0 };
    const requestedHand = new URLSearchParams(location.search).get('hand');
    this.selectedHand = ['left', 'right'].includes(requestedHand) ? requestedHand : null;
    this.resumeHeldSince = null;
    this.lastPoseSentAt = 0;
    this.log = document.querySelector('#log');
  }

  // -------------------------------------------------------------- transport

  connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.ws.addEventListener('open', () => {
      this.note('Đã mở kết nối với robot');
      this.send({ type: 'session', active: this.session !== null });
      this.pingTimer = setInterval(() => this.send({ type: 'ping', t: performance.now() }), 1000);
    });
    this.ws.addEventListener('close', () => {
      this.note('Mất kết nối - đang thử lại sau 1 giây');
      clearInterval(this.pingTimer);
      setTimeout(() => this.connect(), 1000);
    });
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'pong') {
        this.rttMs = performance.now() - payload.t;
      } else if (payload.type === 'status') {
        this.status = payload;
        this.stopped = payload.stopped;
        this.renderStatus();
      }
    });
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  note(text) {
    if (this.log) {
      this.log.textContent = text;
    }
  }

  /* There is no console inside the headset: an exception thrown in the XR frame loop is
   * completely silent, and the symptom is "everything stopped drawing". Ship errors to
   * the relay so they land in the terminal. Rate-limited so a per-frame throw cannot
   * flood the socket the control data shares. */
  reportError(where, error) {
    const message = `${where}: ${(error && error.message) || error}`;
    this.note(message);
    const now = performance.now();
    if (this.lastErrorSentAt && now - this.lastErrorSentAt < 1000) return;
    this.lastErrorSentAt = now;
    this.send({
      type: 'error',
      message,
      stack: error && error.stack ? String(error.stack).slice(0, 600) : null,
    });
  }

  // -------------------------------------------------------------- session

  /* `mode` is 'immersive-ar' (passthrough: the operator sees the real room, the real
   * robot and their own hands, with the panels floating over it) or 'immersive-vr'
   * (opaque). Passthrough is the default: this robot is driven from the same room it
   * stands in, and looking at the physical machine matters more than a clean backdrop. */
  async enterSession(mode) {
    try {
      await this._enterSession(mode);
    } catch (error) {
      this.reportError('enterSession', error);
    }
  }

  async _enterSession(mode) {
    if (!navigator.xr) {
      this.note('Không có WebXR: hãy mở trang bằng HTTPS hoặc localhost qua adb reverse.');
      return;
    }
    if (!(await navigator.xr.isSessionSupported(mode))) {
      this.note(`Trình duyệt này không hỗ trợ ${mode}.`);
      return;
    }
    this.mode = mode;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      xrCompatible: true,
      // Passthrough composites the layer over the camera feed, so the framebuffer needs
      // a real alpha channel to punch through.
      alpha: mode === 'immersive-ar',
      antialias: true,
      // The arm skeleton is the only thing on this page that needs to occlude itself;
      // the flat panels are drawn in painter's order and never ask for depth.
      depth: true,
    });
    this.gl = gl;
    this.renderer = new PanelRenderer(gl);
    this._initPanels();
    this._initGhost();

    this.session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      // Without this the headset exposes NO input sources at all when the controllers are
      // asleep and the operator is using bare hands — the session looks alive while
      // session.inputSources stays empty.
      optionalFeatures: ['hand-tracking'],
    });
    this.session.updateRenderState({ baseLayer: new XRWebGLLayer(this.session, gl) });
    this.refSpace = await this.session.requestReferenceSpace('local-floor');
    // Pinch (hands) and trigger (controllers) both surface as select events. Tracked so
    // bare hands, which have no stick button, still have a way out of the session.
    this.selecting = new Set();
    this.session.addEventListener('selectstart', (event) => {
      if (event.inputSource.handedness) this.selecting.add(event.inputSource.handedness);
    });
    this.session.addEventListener('selectend', (event) => {
      this.selecting.delete(event.inputSource.handedness);
    });
    this.session.addEventListener('end', () => {
      this.session = null;
      this.handClutch = { left: false, right: false };
      this.handGestureDown = { left: false, right: false };
      this.send({ type: 'session', active: false });
      this.note('Đã thoát VR. Robot dừng và giữ nguyên tư thế.');
    });
    this.send({ type: 'session', active: true });
    this.note('Phiên VR đang hoạt động.');
    this.session.requestAnimationFrame((t, frame) => this.onFrame(t, frame));
  }

  _initGhost() {
    // Never fatal: a shader that fails to build must cost the operator a diagram, not the
    // session. Everything else on this page still flies the robot.
    try {
      this.ghosts = {};
      this.ghostGl = this.gl;
    } catch (error) {
      this.ghosts = null;
      this.reportError('ghost', error);
    }
  }

  /* One skeleton per arm, built on first sight of that arm in telemetry. Which arms exist
   * is the robot's business, not the page's: a two-armed robot simply reports two. */
  ghostFor(hand) {
    if (!this.ghosts) return null;
    if (!this.ghosts[hand]) {
      try {
        this.ghosts[hand] = new window.ArmGhost(this.ghostGl);
      } catch (error) {
        this.ghosts = null;
        this.reportError('ghost', error);
        return null;
      }
    }
    return this.ghosts[hand];
  }

  _initPanels() {
    for (const panel of PANELS) {
      this.textures[panel.key] = this.renderer.createTexture();
    }
    for (const key of ['front', 'wrist']) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      // MJPEG multipart: the browser keeps swapping the decoded frame behind this element.
      img.src = `/camera/${key}`;
      this.images[key] = img;
    }
    this.telemetryCanvas = document.createElement('canvas');
    this.telemetryCanvas.width = 512;
    this.telemetryCanvas.height = 384;
    this.placeholderCanvas = document.createElement('canvas');
    this.placeholderCanvas.width = 512;
    this.placeholderCanvas.height = 384;
    this.streamLive = { front: false, wrist: false };

    // Markers drawn at each tracked hand. Without them an opaque session is a black void
    // in which the operator cannot see where their own hands are.
    this.markerTextures = {
      left: this.renderer.createTexture(),
      right: this.renderer.createTexture(),
    };
    this.renderer.upload(this.markerTextures.left, this.drawMarker('#4e8ac0'));
    this.renderer.upload(this.markerTextures.right, this.drawMarker('#c9a24e'));
  }

  /* The gesture depends on what the operator is holding, so the hint has to as well:
   * a bare hand has no stick button, a controller has no pinch. */
  recentre(pose) {
    const { position, orientation } = pose.transform;
    this.anchor = {
      position: [position.x, position.y, position.z],
      yaw: yawOf(orientation),
    };
    this.recentredAt = performance.now();
  }

  exitHint() {
    const kinds = Object.values(this.lastControllers || {}).map((c) => c.kind);
    if (kinds.length > 0 && kinds.every((kind) => kind === 'hand')) {
      return 'chụm cả hai tay 1,5 giây · chụm nhanh để đặt lại bảng';
    }
    return 'giữ nút stick 1,5 giây · nhấn nhanh để đặt lại bảng';
  }

  drawMarker(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(64, 64, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(64, 20);
    ctx.lineTo(64, 108);
    ctx.moveTo(20, 64);
    ctx.lineTo(108, 64);
    ctx.stroke();
    return canvas;
  }

  /* A camera with no stream must not look like a panel that failed to render: say so. */
  drawPlaceholder(key) {
    const ctx = this.placeholderCanvas.getContext('2d');
    ctx.fillStyle = '#161a21';
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = '#2b3441';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 488, 360);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5f6b7b';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(PANEL_TITLES[key] || key, 256, 168);
    ctx.font = '22px sans-serif';
    ctx.fillText('không có tín hiệu', 256, 210);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#48525f';
    ctx.fillText('robot chưa kết nối', 256, 244);
    // The centre panel is what an operator looks at first, so the way out is repeated
    // here rather than only on the telemetry board off to the left.
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#7f8b9b';
    ctx.fillText(`thoát VR: ${this.exitHint()}`, 256, 318);
    ctx.textAlign = 'left';
    return this.placeholderCanvas;
  }

  // -------------------------------------------------------------- frame loop

  onFrame(time, frame) {
    // A callback queued before session.end() still fires afterwards, and touching that
    // frame throws "XRFrame access outside the callback that produced it".
    if (!this.session) return;
    // Re-registered first, so a throw below cannot kill the loop outright.
    this.session.requestAnimationFrame((t, f) => this.onFrame(t, f));
    try {
      this.step(time, frame);
    } catch (error) {
      this.reportError('frame', error);
    }
  }

  step(time, frame) {
    this.frameCount += 1;

    const controllers = this.readControllers(frame);
    this.lastControllers = controllers;
    this.handleButtons(controllers);

    // The control loop runs at 30 Hz; streaming every headset frame (72-90 Hz) would only
    // add queueing latency. 60 Hz keeps two fresh samples per control tick.
    /* A session that streams poses while reporting no controllers looks identical, from
     * outside the headset, to a session that is not running at all. Say so, once every few
     * seconds, for as long as it lasts. */
    if (Object.keys(controllers).length === 0) {
      if (!this.lastNoControllerAt || time - this.lastNoControllerAt > 4000) {
        this.lastNoControllerAt = time;
        this.send({
          type: 'diag',
          // Zero input sources in a live session used to report nothing whatsoever, which
          // is the state a sleeping controller leaves behind — and the one hardest to
          // tell from a broken page.
          note: this.session.inputSources.length
            ? 'no usable controllers'
            : 'no input sources at all — controllers asleep?',
          sources: this.sourceReport || [],
        });
      }
    }

    if (time - this.lastPoseSentAt >= 1000 / 60) {
      this.lastPoseSentAt = time;
      this.send({
        type: 'pose',
        sessionActive: true,
        rttMs: this.rttMs,
        controllers: Object.fromEntries(
          Object.entries(controllers).map(([hand, c]) => [
            hand,
            {
              position: c.position,
              orientation: c.orientation,
              trigger: c.trigger,
              squeeze: c.squeeze,
              stickX: c.stickX,
              stickY: c.stickY,
              tracked: c.tracked,
              kind: c.kind,
              buttons: c.buttons,
              ready: !!this.readyHands && !!this.readyHands[hand],
            },
          ]),
        ),
      });
    }

    this.render(frame);
  }

  /* Button indices are the W3C "xr-standard" mapping (WebXR Gamepads Module, 3.3), and
   * Quest 3 Touch controllers follow it exactly — measured, not assumed:
   *
   *   [0] trigger   [1] squeeze   [3] thumbstick press   [4] A / X   [5] B / Y
   *
   * On a capture of a live session, index 0 was pressed on exactly the same 122 frames
   * that `trigger > 0.5`, and index 1 on exactly the same 37 frames as `squeeze > 0.5`.
   * Recorded here because a session was once spent suspecting this mapping for a fault
   * that was in the STOP state machine, and the mapping had nothing to do with it.
   */
  readControllers(frame) {
    const out = {};
    /* Why a source was rejected, for the diagnostic below. "inputSources = 2" while the
     * robot sees no controllers at all has now happened twice, and the count alone cannot
     * tell a sleeping Touch from a bare hand from a transient pinch pointer. */
    this.sourceReport = [];
    for (const source of this.session.inputSources) {
      this.sourceReport.push({
        hand: source.handedness || 'none',
        ray: source.targetRayMode || '?',
        pad: !!source.gamepad,
        joints: !!source.hand,
      });
      if (!source.handedness || source.handedness === 'none') continue;
      if (this.selectedHand && source.handedness !== this.selectedHand) continue;
      const gamepad = source.gamepad;
      const state = {
        kind: source.hand ? 'hand' : 'controller',
        position: [0, 0, 0],
        orientation: [0, 0, 0, 1],
        trigger: gamepad ? (gamepad.buttons[0] ? gamepad.buttons[0].value : 0) : 0,
        squeeze: gamepad ? (gamepad.buttons[1] ? gamepad.buttons[1].value : 0) : 0,
        stickX: gamepad && gamepad.axes.length > 2 ? gamepad.axes[2] : 0,
        stickY: gamepad && gamepad.axes.length > 3 ? gamepad.axes[3] : 0,
        primary: gamepad && gamepad.buttons[4] ? gamepad.buttons[4].pressed : false,
        secondary: gamepad && gamepad.buttons[5] ? gamepad.buttons[5].pressed : false,
        stickPress: gamepad && gamepad.buttons[3] ? gamepad.buttons[3].pressed : false,
        // Every button, by index. Which physical button carries which index is a property
        // of the device and the browser, not of the spec's goodwill: assuming it cost a
        // session where the resume key latched the stop it was meant to clear.
        buttons: gamepad ? gamepad.buttons.map((b) => (b.pressed ? 1 : 0)) : [],
        tracked: false,
      };
      if (source.hand) {
        const handState = this.readHand(frame, source);
        if (handState) Object.assign(state, handState);
      }
      // Controllers must use gripSpace: targetRaySpace describes the pointing ray, not
      // the physical hand/controller pose used for manipulation.
      const space = source.hand ? null : source.gripSpace;
      if (space) {
        const pose = frame.getPose(space, this.refSpace);
        if (pose) {
          state.rawPosition = [
            pose.transform.position.x,
            pose.transform.position.y,
            pose.transform.position.z,
          ];
          const heading = this.anchor ? -this.anchor.yaw : 0;
          state.position = positionToBase(rotateY(pose.transform.position, heading));
          state.orientation = quaternionToBase(
            rotateQuaternionY(pose.transform.orientation, heading),
          );
          state.tracked = true;
        }
      }
      // Quest reports hands and controllers simultaneously, so one handedness can arrive
      // twice. Whichever came last used to win, which is why a controller in hand still
      // read as a bare hand. A source with a gamepad is the one that can actually
      // command the robot, so it wins.
      const existing = out[source.handedness];
      if (!existing || (existing.kind === 'hand' && state.kind === 'controller')) {
        out[source.handedness] = state;
      }
    }
    return out;
  }

  readHand(frame, source) {
    const names = [
      'wrist', 'thumb-tip', 'index-finger-tip', 'middle-finger-tip',
      'index-finger-metacarpal', 'middle-finger-metacarpal', 'pinky-finger-metacarpal',
    ];
    const points = {};
    for (const name of names) {
      const joint = source.hand.get(name);
      const pose = joint && frame.getJointPose(joint, this.refSpace);
      if (!pose) return null;
      const p = pose.transform.position;
      points[name] = [p.x, p.y, p.z];
    }

    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (v) => {
      const n = Math.hypot(...v);
      return n > 1e-6 ? v.map((x) => x / n) : null;
    };
    const distance = (a, b) => Math.hypot(...sub(a, b));
    const wrist = points.wrist;
    const middle = points['middle-finger-metacarpal'];
    let forward = norm(sub(middle, wrist));
    let lateral = norm(sub(points['index-finger-metacarpal'], points['pinky-finger-metacarpal']));
    if (!forward || !lateral) return null;
    let normal = norm(cross(forward, lateral));
    if (!normal) return null;
    lateral = norm(cross(normal, forward));
    if (!lateral) return null;

    const palm = [0, 1, 2].map((i) => (
      wrist[i] + points['index-finger-metacarpal'][i] + middle[i] + points['pinky-finger-metacarpal'][i]
    ) / 4);
    const rotation = [
      [forward[0], lateral[0], normal[0]],
      [forward[1], lateral[1], normal[1]],
      [forward[2], lateral[2], normal[2]],
    ];
    const rawQuat = matrixToQuat(rotation);
    const heading = this.anchor ? -this.anchor.yaw : 0;
    const rotatedPosition = rotateY({ x: palm[0], y: palm[1], z: palm[2] }, heading);
    const orientation = quaternionToBase(rotateQuaternionY(
      { x: rawQuat[0], y: rawQuat[1], z: rawQuat[2], w: rawQuat[3] }, heading,
    ));

    const thumb = points['thumb-tip'];
    const middleTip = points['middle-finger-tip'];
    const gestureDistance = distance(thumb, middleTip);
    const hand = source.handedness;
    const down = this.handGestureDown[hand];
    const now = performance.now();
    if (!down && gestureDistance < 0.035 && now - this.handGestureChangedAt[hand] > 500) {
      this.handGestureDown[hand] = true;
      this.handGestureChangedAt[hand] = now;
      this.handClutch[hand] = !this.handClutch[hand];
    } else if (down && gestureDistance > 0.055) {
      this.handGestureDown[hand] = false;
      this.handGestureChangedAt[hand] = now;
    }

    const pinchDistance = distance(thumb, points['index-finger-tip']);
    const trigger = Math.max(0, Math.min(1, (0.09 - pinchDistance) / 0.07));
    return {
      position: positionToBase(rotatedPosition),
      orientation,
      rawPosition: palm,
      trigger,
      squeeze: this.handClutch[hand] ? 1 : 0,
      tracked: true,
      gestureDistance,
      pinchDistance,
    };
  }

  handleButtons(controllers) {
    const any = (predicate) => Object.values(controllers).some(predicate);

    // Way out from inside the session. The headset's own system button is the normal
    // route, but an operator wearing a robot control panel must never be unable to leave
    // from within the app itself. Two gestures, because the available buttons depend on
    // what is in the operator's hands:
    //   controllers - hold either stick button;
    //   bare hands  - pinch with BOTH hands (a hand has no stick button at all, which
    //                 left hands-only mode with no way out).
    // Press-and-hold, not a tap: leaving mid-task by brushing a control is its own hazard,
    // and a single stray pinch is very easy to make.
    const bothPinching = this.selecting && this.selecting.has('left') && this.selecting.has('right');
    const exiting = any((c) => c.stickPress) || bothPinching;
    if (exiting) {
      if (!this.exitHeldSince) {
        this.exitHeldSince = performance.now();
      } else if (performance.now() - this.exitHeldSince > EXIT_HOLD_MS) {
        this.exitHeldSince = null;
        this.exitProgress = 0;
        this.session.end();
        return;
      }
    } else {
      // Released before the hold completed: treat a short press as "recentre the panels
      // in front of me". Same control, so an operator who cannot find the panels reaches
      // for the same button whether they want them back or want out.
      if (this.exitHeldSince && performance.now() - this.exitHeldSince < EXIT_HOLD_MS) {
        this.anchor = null;
      }
      this.exitHeldSince = null;
    }
    this.exitProgress = this.exitHeldSince
      ? Math.min(1, (performance.now() - this.exitHeldSince) / EXIT_HOLD_MS)
      : 0;
    // A / X: latch the emergency stop immediately.
    /* Ready-posture request: B/Y held, clutch held, not stopped. Requiring the grip keeps
     * the deadman in charge of a motion that crosses most of the workspace — let go and it
     * stops — and B/Y is otherwise idle except as the resume-from-STOP key. */
    this.readyHands = this.readyHands || {};
    this.readyHeldSince = this.readyHeldSince || {};
    for (const [hand, c] of Object.entries(controllers)) {
      const asking = !this.stopped && c && c.secondary && c.squeeze > 0.5;
      if (!asking) {
        this.readyHeldSince[hand] = null;
        this.readyHands[hand] = false;
        continue;
      }
      if (!this.readyHeldSince[hand]) this.readyHeldSince[hand] = performance.now();
      this.readyHands[hand] = performance.now() - this.readyHeldSince[hand] > READY_HOLD_MS;
    }

    /* STOP latches on the PRESS, not on the button being down.
     *
     * Level-triggering it meant that while the key was held — or while a device reported
     * the wrong index as pressed — the resume timer below was cleared on every frame and
     * the function returned before ever reaching it. The stop could then never be undone
     * from inside the headset: exactly the trap reported as "STOP fires constantly and
     * nothing else works". An edge cannot do that: it fires once and then lets go. */
    const primaryNow = any((c) => c.primary);
    if (primaryNow && !this.primaryWasDown && !this.stopped) {
      this.stopped = true;
      this.send({ type: 'stop' });
    }
    this.primaryWasDown = primaryNow;

    // B / Y held for a second: release it. Deliberately not a tap — a stop must not be
    // undone by brushing a button.
    if (this.stopped && any((c) => c.secondary)) {
      if (this.resumeHeldSince === null) {
        this.resumeHeldSince = performance.now();
      } else if (performance.now() - this.resumeHeldSince > 1000) {
        this.send({ type: 'resume' });
        this.resumeHeldSince = null;
      }
    } else {
      this.resumeHeldSince = null;
    }
  }

  // -------------------------------------------------------------- rendering

  render(frame) {
    const gl = this.gl;
    const pose = frame.getViewerPose(this.refSpace);
    if (!pose) return;

    // Anchor the layout to wherever the operator's head is, on the first frame and on
    // every recentre.
    if (!this.anchor) this.recentre(pose);

    const layer = this.session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    // Passthrough: clear to fully transparent so the real room composites through.
    if (this.mode === 'immersive-ar') {
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.clearColor(0.02, 0.03, 0.05, 1.0);
    }
    // On the diagnostic frame, sample glGetError per stage: a single error code at the
    // end of the frame says something is wrong but not which call did it.
    const sampling = this.frameCount === 30;
    const stages = {};
    if (sampling) gl.getError(); // drain anything left from setup
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (sampling) stages.afterClear = gl.getError();

    // Camera panels at ~24 Hz: the MJPEG streams are 30 FPS at best and re-uploading a
    // 640x480 texture on every headset frame is wasted bandwidth.
    if (this.frameCount % 3 === 0) {
      for (const key of ['front', 'wrist']) {
        const img = this.images[key];
        if (img && img.complete && img.naturalWidth > 0) {
          this.renderer.upload(this.textures[key], img);
          this.streamLive[key] = true;
        } else if (!this.streamLive[key]) {
          this.renderer.upload(this.textures[key], this.drawPlaceholder(key));
        }
      }
      this.drawTelemetry();
    }
    for (const [hand, arm] of Object.entries((this.status.telemetry || {}).arms || {})) {
      const ghost = this.ghostFor(hand);
      if (ghost) ghost.update(arm.joints, arm.jointsTarget);
    }
    if (sampling) stages.afterUpload = gl.getError();

    let drawnPanels = 0;
    let drawnBones = 0;
    for (const view of pose.views) {
      const viewport = layer.getViewport(view);
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      const viewProjection = mat4Multiply(view.projectionMatrix, view.transform.inverse.matrix);
      for (const panel of PANELS) {
        const model = panelMatrix(
          placePanel(this.anchor, panel),
          this.anchor.yaw + panel.yaw,
          panel.width,
          panel.height,
        );
        this.renderer.draw(this.textures[panel.key], mat4Multiply(viewProjection, model), 1.0);
      }
      for (const [hand, controller] of Object.entries(this.lastControllers || {})) {
        if (!controller.tracked || !controller.rawPosition || !this.markerTextures[hand]) continue;
        const model = panelMatrix(controller.rawPosition, 0, 0.09, 0.09);
        this.renderer.draw(this.markerTextures[hand], mat4Multiply(viewProjection, model), 0.9);
      }
      const arms = Object.keys((this.status.telemetry || {}).arms || {});
      for (const hand of arms) {
        const ghost = this.ghostFor(hand);
        if (ghost) {
          drawnBones += ghost.draw(viewProjection, ghostPlacement(this.anchor, hand, arms.length));
        }
      }
      drawnPanels += PANELS.length;
    }

    // One-shot report from inside a live session. Without it, "the panels are gone" is
    // indistinguishable from "nothing was drawn", "drawn off-screen" and "drawn but
    // composited away" — three different bugs with the same symptom in the headset.
    if (sampling) {
      stages.afterDraw = gl.getError();
      const viewport = layer.getViewport(pose.views[0]);
      this.send({
        type: 'diag',
        mode: this.mode,
        views: pose.views.length,
        drawnPanels,
        drawnBones,
        inputSources: this.session.inputSources.length,
        sources: this.sourceReport || [],
        viewport: [viewport.width, viewport.height],
        glStages: stages,
        headY: Number(pose.transform.position.y.toFixed(2)),
        anchorY: Number(this.anchor.position[1].toFixed(2)),
        framebufferBound: !!layer.framebuffer,
      });
    }
  }

  /* The telemetry board is the only thing an operator in VR can look at to decide whether
   * the system is alive. It must therefore read as "alive" before a robot is ever
   * attached: live grip/trigger bars and stick values let the whole input chain be checked
   * from inside the headset, with nobody watching a terminal. */
  drawTelemetry() {
    const ctx = this.telemetryCanvas.getContext('2d');
    const t = this.status.telemetry || {};
    const controllers = this.lastControllers || {};

    ctx.fillStyle = '#12151a';
    ctx.fillRect(0, 0, 512, 384);

    // Header: the single most important line, readable across the room.
    // A stalled control loop must never read as a healthy robot: the panel would show
    // plausible joint angles from before the robot vanished. Age is measured by the relay
    // thread, so it stays truthful even when the loop is blocked rather than erroring.
    const stalled = this.status.telemetryAgeS === null || this.status.telemetryAgeS > 1.0;
    const arms = t.arms || {};
    const hands = Object.keys(arms).sort();
    const active = hands.filter((hand) => arms[hand].engaged);
    ctx.fillStyle = stalled ? '#5c3a12' : this.stopped ? '#7a1d29' : active.length ? '#1c4a2e' : '#1a1f27';
    ctx.fillRect(0, 0, 512, 56);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = stalled ? '#f0b45e' : this.stopped ? '#ffb4bb' : active.length ? '#8ce0a6' : '#83d0ff';
    // Names the engaged arms rather than saying "the arm": with two, which one is live is
    // the first thing the operator needs and the easiest to get wrong.
    const activeLabel =
      hands.length > 1 ? `ĐANG CHẠY: ${active.map((h) => HAND_LABELS[h]).join(' + ')}` : 'TAY ROBOT ĐANG CHẠY';
    ctx.fillText(
      stalled
        ? 'MẤT KẾT NỐI ROBOT'
        : this.stopped
          ? 'ĐÃ DỪNG - GIỮ B/Y 1 GIÂY'
          : active.length
            ? activeLabel
            : 'ROBOT ĐANG GIỮ TƯ THẾ',
      18,
      38,
    );

    const bar = (x, y, value, color) => {
      ctx.fillStyle = '#232a34';
      ctx.fillRect(x, y, 150, 16);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.max(0, Math.min(1, value)) * 150, 16);
    };

    ctx.font = 'bold 17px sans-serif';
    ctx.fillStyle = '#7f8b9b';
    ctx.fillText('THIẾT BỊ ĐIỀU KHIỂN', 18, 84);

    /* Two arms need two blocks below, and the board is 384 px tall. So the controller
     * section drops its second line — stick and hand position — when a second arm appears.
     * Those two readouts are bring-up instruments, most useful before a robot is attached;
     * grip and trigger are the ones that matter while flying, and they stay. */
    const compact = hands.length > 1;
    let y = 106;
    for (const hand of ['left', 'right']) {
      const c = controllers[hand];
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = c && c.tracked ? '#e8edf4' : '#5f6b7b';
      ctx.fillText(hand === 'left' ? 'TRÁI' : 'PHẢI', 18, y + 14);
      if (!c || !c.tracked) {
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#5f6b7b';
        ctx.fillText('không được theo dõi', 90, y + 14);
      } else if (c.kind === 'hand') {
        ctx.font = '15px sans-serif';
        ctx.fillStyle = c.squeeze > 0.5 ? '#8ce0a6' : '#c9a24e';
        ctx.fillText(
          c.squeeze > 0.5 ? 'tay trần · teleop đang bật' : 'tay trần · cái+giữa để bật',
          90,
          y + 14,
        );
        ctx.font = '15px monospace';
        ctx.fillStyle = '#7f8b9b';
        ctx.fillText(
          `xyz ${c.position.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' ')}`,
          90,
          y + 36,
        );
      } else {
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#9ca7b5';
        ctx.fillText('grip', 90, y + 13);
        bar(130, y, c.squeeze, c.squeeze > 0.5 ? '#4ec97a' : '#4e8ac0');
        ctx.fillStyle = '#9ca7b5';
        ctx.fillText('cò', 292, y + 13);
        bar(332, y, c.trigger, '#c9a24e');
        if (!compact) {
          ctx.font = '15px monospace';
          ctx.fillStyle = '#7f8b9b';
          ctx.fillText(
            `stick ${c.stickX >= 0 ? '+' : ''}${c.stickX.toFixed(2)} ${c.stickY >= 0 ? '+' : ''}${c.stickY.toFixed(2)}`,
            130,
            y + 36,
          );
          ctx.fillText(
            `xyz ${c.position.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' ')}`,
            292,
            y + 36,
          );
        }
      }
      y += compact ? 30 : 62;
    }

    /* One block per arm: jaw, joints and the reason the arm is not where the hand is.
     *
     * With one arm the joints get a row each. With two there is no room for ten rows on a
     * 512x384 board, and there does not need to be — the 3D skeletons carry the joints, and
     * what the numbers add is the lag, so only the worst lagging joint is named. */
    const solo = !compact;
    let blockY = y + 8;
    for (const hand of hands) {
      const arm = arms[hand];
      const jaw = arm.joints ? arm.joints.gripper : undefined;
      const wanted = arm.jointsTarget ? arm.jointsTarget.gripper : undefined;
      const clamp01 = (v) => Math.max(0, Math.min(1, v / 100));

      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = arm.approachingReady ? '#f0b45e' : arm.engaged ? '#8ce0a6' : '#7f8b9b';
      const title = arm.approachingReady
        ? 'ĐANG VỀ TƯ THẾ LÀM VIỆC'
        : solo
          ? 'KẸP'
          : `${HAND_LABELS[hand].toUpperCase()} · KẸP`;
      ctx.fillText(title, 18, blockY + 14);
      // A simulated arm must never be mistaken for the robot's own pose. In a dry run the
      // skeleton follows perfectly and the real arm has not moved at all.
      if (arm.simulated) {
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#c9a24e';
        ctx.fillText('MÔ PHỎNG - robot không di chuyển', 148, blockY + 13);
      }

      if (jaw !== undefined) {
        ctx.fillStyle = '#232a34';
        ctx.fillRect(148, blockY, 150, 16);
        ctx.fillStyle = arm.gripperHolding ? '#4ec97a' : arm.gripperTaken ? '#6ab0c7' : '#c9a24e';
        ctx.fillRect(148, blockY, 150 * clamp01(jaw), 16);
        // Where the finger is asking the jaw to be. When it sits left of the bar's own edge
        // the jaw is pressing on something: that gap IS the grip force, and it is the only
        // report of it this arm can make — there is no force sensor and no haptic return.
        if (wanted !== undefined) {
          ctx.fillStyle = '#f0b45e';
          ctx.fillRect(148 + 150 * clamp01(wanted) - 1, blockY - 4, 3, 24);
        }
        ctx.font = '15px sans-serif';
        let jawText = `${Math.round(jaw)}`;
        ctx.fillStyle = arm.gripperTaken ? '#7f8b9b' : '#f0b45e';
        if (arm.engaged && !arm.gripperTaken) jawText = 'đưa ngón kẹp tới vị trí hiện tại';
        else if (arm.gripperHolding) {
          jawText = `đang giữ · ${Math.round(jaw)}`;
          ctx.fillStyle = '#4ec97a';
        }
        ctx.fillText(jawText, 308, blockY + 13);
      }
      blockY += 24;

      // Joints: measured, then how far the command is ahead of it. That second number is
      // the servo lag on that joint, and it is the same quantity the 3D skeletons draw as
      // the gap between them; the board gives it in degrees for when the eye is not enough.
      const measured = arm.joints || {};
      const targets = arm.jointsTarget || {};
      const names = Object.keys(measured).filter((name) => name !== 'gripper');
      if (solo && names.length) {
        ctx.font = '15px monospace';
        names.forEach((name, index) => {
          const x = 18 + (index % 3) * 166;
          const row = blockY + 14 + Math.floor(index / 3) * 21;
          ctx.fillStyle = '#7f8b9b';
          ctx.fillText(JOINT_LABELS[name] || name.slice(0, 8), x, row);
          ctx.fillStyle = '#e8edf4';
          ctx.fillText(measured[name].toFixed(0).padStart(5), x + 72, row);
          if (targets[name] !== undefined) {
            const lag = targets[name] - measured[name];
            ctx.fillStyle = Math.abs(lag) > 8 ? '#e8734a' : Math.abs(lag) > 3 ? '#f0b45e' : '#4a5563';
            ctx.fillText(`${lag >= 0 ? '+' : ''}${lag.toFixed(0)}`, x + 122, row);
          }
        });
        blockY += 21 * Math.ceil(names.length / 3);
      } else if (names.length) {
        let worst = null;
        for (const name of names) {
          if (targets[name] === undefined) continue;
          const lag = Math.abs(targets[name] - measured[name]);
          if (!worst || lag > worst.lag) worst = { name, lag };
        }
        if (worst) {
          ctx.font = '15px monospace';
          ctx.fillStyle = worst.lag > 8 ? '#e8734a' : worst.lag > 3 ? '#f0b45e' : '#4a5563';
          ctx.fillText(`trễ ${JOINT_LABELS[worst.name] || worst.name} ${worst.lag.toFixed(0)}°`, 18, blockY + 14);
          blockY += 20;
        }
      }

      /* Why the arm is not where the hand is. Four distinct causes, and without naming them
       * every one of them feels identical from inside the headset: the arm stops following. */
      const reasons = [];
      if (arm.reachErrorM > 0.01) reasons.push('ngoài tầm với');
      if (Math.abs(arm.pitchErrorDeg || 0) > 5) reasons.push('không đạt được góc nghiêng');
      if (arm.trackingErrorDeg > 12) reasons.push(`robot trễ ${Math.round(arm.trackingErrorDeg)}°`);
      if (arm.rateLimited) reasons.push('tay di chuyển quá nhanh');
      ctx.font = '15px sans-serif';
      ctx.fillStyle = reasons.length ? '#f0b45e' : '#4a5563';
      // Out of reach almost always means the arm is stowed in a corner of its workspace,
      // and no amount of hand motion gets it out. Name the way out, not just the symptom.
      let line = reasons.length ? reasons.join(' · ') : 'đang đi theo bàn tay';
      if (arm.approachingReady) line = 'giữ grip và B/Y';
      // Re-clutching is the ordinary way out and is not discoverable on its own: the
      // hand-to-arm correspondence is fixed at the moment the grip closes, so an operator
      // whose own arm has run out of room must let go, move it back, and take hold again.
      else if (arm.reachErrorM > 0.01) line += '  →  tắt clutch, đưa tay về rồi bật lại';
      ctx.fillText(line, 18, blockY + 14);
      blockY += solo ? 22 : 26;
    }

    if (!hands.length) {
      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#5f6b7b';
      ctx.fillText('không có dữ liệu - robot chưa kết nối', 90, 250);
    }

    // Footer: base command and the health of the link itself.
    const base = t.base || {};
    ctx.fillStyle = '#1a1f27';
    ctx.fillRect(0, 340, 512, 44);
    ctx.font = '17px monospace';
    ctx.fillStyle = '#9ca7b5';
    // Spelled out rather than using θ: the monospace face the headset falls back to has
    // no glyph for it and silently renders a lookalike digit.
    ctx.fillText(
      `đế x${(base['x.vel'] || 0).toFixed(2)} y${(base['y.vel'] || 0).toFixed(2)} xoay${(base['theta.vel'] || 0).toFixed(0)}`,
      18,
      358,
    );
    ctx.fillStyle = this.rttMs !== null && this.rttMs < 50 ? '#4ec97a' : '#c9a24e';
    ctx.fillText(`rtt ${this.rttMs === null ? '--' : this.rttMs.toFixed(0)} ms`, 330, 358);

    // Exit affordance. Worded for whatever is actually in the operator's hands, and with
    // a filling bar so the hold confirms itself the moment it is tried.
    ctx.font = '15px sans-serif';
    ctx.fillStyle = this.exitProgress ? '#e8edf4' : '#7f8b9b';
    ctx.fillText(`thoát: ${this.exitHint()}`, 18, 374);
    if (this.exitProgress) {
      ctx.fillStyle = '#232a34';
      ctx.fillRect(18, 378, 476, 5);
      ctx.fillStyle = '#c95e4e';
      ctx.fillRect(18, 378, 476 * this.exitProgress, 5);
    }

    this.renderer.upload(this.textures.telemetry, this.telemetryCanvas);
  }

  renderStatus() {
    const el = document.querySelector('#status');
    if (!el) return;
    const t = this.status.telemetry || {};
    const parts = [
      this.status.sessionActive ? 'VR đang hoạt động' : 'VR chưa chạy',
      this.stopped ? 'ĐÃ DỪNG' : 'được phép chạy',
      t.robotConnected ? 'robot đã kết nối' : 'robot chưa kết nối',
      `khung ${this.status.framesReceived || 0}`,
      `rtt ${this.rttMs ? this.rttMs.toFixed(0) + ' ms' : '--'}`,
    ];
    if (t.error) parts.push(`lỗi: ${t.error}`);
    el.textContent = parts.join(' · ');
  }
}

// Registering the worker is what lets the Quest offer "install" and put a launchable
// icon in the app library. It caches nothing — see web/sw.js.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const client = new TeleopClient();
client.connect();
// Catch what escapes the frame loop's own try/catch: setup, promise rejections, the WS.
window.addEventListener('error', (event) => client.reportError('window', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => client.reportError('promise', event.reason));
document.querySelector('#enter-ar').addEventListener('click', () => client.enterSession('immersive-ar'));
document.querySelector('#enter-vr').addEventListener('click', () => client.enterSession('immersive-vr'));
document.querySelector('#stop').addEventListener('click', () => fetch('/api/stop', { method: 'POST' }));
document.querySelector('#resume').addEventListener('click', () => fetch('/api/resume', { method: 'POST' }));
setInterval(() => client.renderStatus(), 500);
