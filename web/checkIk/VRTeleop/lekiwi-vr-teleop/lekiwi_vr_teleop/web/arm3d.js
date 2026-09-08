/* A 3D skeleton of the SO-101, drawn twice: where the arm is, and where it has been told
 * to be.
 *
 * Two things made the arm hard to drive, and one picture answers both. "Which joint will
 * move" is answered by seeing the joints before they move — the commanded ghost leads the
 * measured one. And the servo lag, which varies with network jitter and so cannot be
 * honestly reported as a single number, is simply the gap between the two skeletons.
 *
 * The forward kinematics here mirror `so101_chain.py` exactly, including the same
 * constants. That duplication is deliberate: the status channel runs at ~10 Hz while the
 * headset draws at 72-90, so the page holds joint ANGLES and interpolates them per frame.
 * Interpolating link poses instead would break the chain and the arm would visibly come
 * apart mid-motion. `tests/test_arm3d.py` re-runs this file's arithmetic against the
 * Python module so the two cannot drift.
 */

const CHAIN = {
  panAxisX: 0.0388353,
  shoulder: [0.030399, 0.1166],
  upperArmLen: 0.116,
  upperArmAngle: 76.0323,
  forearmLen: 0.135,
  forearmAngle: 2.2075,
  toolAlong: 0.159227,
};

const DEG = Math.PI / 180;

/* Pivot positions in the arm base frame, shoulder to tool. Mirrors so101_chain.forward. */
function armPoints(joints) {
  const pan = -(joints.shoulder_pan || 0) * DEG;
  const lift = joints.shoulder_lift || 0;
  const elbow = joints.elbow_flex || 0;
  const flex = joints.wrist_flex || 0;

  const a1 = (CHAIN.upperArmAngle - lift) * DEG;
  const a2 = (CHAIN.forearmAngle - lift - elbow) * DEG;
  const pitch = -(lift + elbow + flex) * DEG;

  const s = CHAIN.shoulder;
  const e = [s[0] + CHAIN.upperArmLen * Math.cos(a1), s[1] + CHAIN.upperArmLen * Math.sin(a1)];
  const w = [e[0] + CHAIN.forearmLen * Math.cos(a2), e[1] + CHAIN.forearmLen * Math.sin(a2)];
  const t = [w[0] + CHAIN.toolAlong * Math.cos(pitch), w[1] + CHAIN.toolAlong * Math.sin(pitch)];

  const toBase = (p) => [
    CHAIN.panAxisX + p[0] * Math.cos(pan),
    p[0] * Math.sin(pan),
    p[1],
  ];
  return {
    base: [CHAIN.panAxisX, 0, 0],
    shoulder: toBase(s),
    elbow: toBase(e),
    wrist: toBase(w),
    tool: toBase(t),
    approach: [Math.cos(pitch) * Math.cos(pan), Math.cos(pitch) * Math.sin(pan), Math.sin(pitch)],
  };
}

/* Which joints each bone's pose depends on, so a bone can be tinted by the lag of the
 * joints that actually drive it. Colouring a bone by one joint would be a lie: the wrist
 * segment's position depends on everything upstream of it. */
const BONES = [
  { from: 'base', to: 'shoulder', joints: ['shoulder_pan'], radius: 0.011 },
  { from: 'shoulder', to: 'elbow', joints: ['shoulder_pan', 'shoulder_lift'], radius: 0.011 },
  { from: 'elbow', to: 'wrist', joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex'], radius: 0.009 },
  {
    from: 'wrist',
    to: 'tool',
    joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex'],
    radius: 0.007,
  },
];

const VERTEX_SHADER_3D = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
varying float vShade;
void main() {
  // Gouraud, one fixed light. At a 25 cm model this is indistinguishable from anything
  // better, and it keeps the fragment shader free of a normal matrix.
  vec3 n = normalize((uModel * vec4(aNormal, 0.0)).xyz);
  vShade = 0.45 + 0.55 * max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAGMENT_SHADER_3D = `
precision mediump float;
uniform vec4 uColor;
varying float vShade;
void main() {
  gl_FragColor = vec4(uColor.rgb * vShade, uColor.a);
}`;

/* A unit cube with per-face normals: 24 vertices, because a shared corner cannot carry
 * three different normals. */
function unitCube() {
  const faces = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  ];
  const vertices = [];
  const indices = [];
  faces.forEach((face, f) => {
    face.v.forEach((v) => vertices.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5, ...face.n));
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/* Model matrix for a box spanning `from` to `to`, `radius` thick, in column-major order.
 *
 * Built by hand rather than with a look-at helper: the bone's own axis is the only
 * constrained direction, so any two perpendiculars will do, and picking them explicitly
 * avoids the degenerate case where a canned "up" vector happens to be parallel to the bone
 * — which for a vertical shoulder segment is not an edge case but the resting pose.
 */
function boneMatrix(from, to, radius, world) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const z = [d[0] / len, d[1] / len, d[2] / len];
  const seed = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let x = [
    seed[1] * z[2] - seed[2] * z[1],
    seed[2] * z[0] - seed[0] * z[2],
    seed[0] * z[1] - seed[1] * z[0],
  ];
  const xn = Math.hypot(x[0], x[1], x[2]) || 1e-6;
  x = [x[0] / xn, x[1] / xn, x[2] / xn];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  // Columns scaled by the box dimensions, then the whole thing placed by `world`.
  const local = [
    x[0] * radius * 2, x[1] * radius * 2, x[2] * radius * 2, 0,
    y[0] * radius * 2, y[1] * radius * 2, y[2] * radius * 2, 0,
    z[0] * len, z[1] * len, z[2] * len, 0,
    mid[0], mid[1], mid[2], 1,
  ];
  return multiply4(world, local);
}

/* Column-major 4x4 multiply, matching app.js's mat4Multiply convention. */
function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* Place the model: robot base frame (x forward, y left, z up, metres) into the headset's
 * frame (x right, y up, z back), scaled down and set where the operator is looking. */
function placement(origin, scale, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Robot +x (forward) -> headset -z, robot +y (left) -> headset -x, robot +z (up) -> +y,
  // then yawed so the model faces the operator the same way the panels do.
  const cols = [
    [-s * scale, 0, -c * scale],
    [-c * scale, 0, s * scale],
    [0, scale, 0],
  ];
  return new Float32Array([
    cols[0][0], cols[0][1], cols[0][2], 0,
    cols[1][0], cols[1][1], cols[1][2], 0,
    cols[2][0], cols[2][1], cols[2][2], 0,
    origin[0], origin[1], origin[2], 1,
  ]);
}

class ArmGhost {
  constructor(gl) {
    this.gl = gl;
    this.program = this._build();
    this.aPos = gl.getAttribLocation(this.program, 'aPos');
    this.aNormal = gl.getAttribLocation(this.program, 'aNormal');
    this.uMVP = gl.getUniformLocation(this.program, 'uMVP');
    this.uModel = gl.getUniformLocation(this.program, 'uModel');
    this.uColor = gl.getUniformLocation(this.program, 'uColor');

    const cube = unitCube();
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, cube.vertices, gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cube.indices, gl.STATIC_DRAW);
    this.indexCount = cube.indices.length;

    // Displayed joint angles, eased toward the reported ones. The status channel is far
    // slower than the display, so stepping straight to each new value would visibly stutter.
    this.shown = null;
    this.shownTarget = null;
  }

  _build() {
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
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER_3D));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_3D));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  /* Ease the drawn angles toward the reported ones. Joint space, never link poses. */
  update(measured, target) {
    const ease = (shown, next) => {
      if (!next) return shown;
      if (!shown) return { ...next };
      const out = {};
      for (const name of Object.keys(next)) {
        const from = shown[name] === undefined ? next[name] : shown[name];
        out[name] = from + (next[name] - from) * 0.35;
      }
      return out;
    };
    this.shown = ease(this.shown, measured);
    this.shownTarget = ease(this.shownTarget, target);
  }

  /* Both skeletons for one eye. `world` places the model in the headset frame. */
  draw(viewProjection, world) {
    if (!this.shown) return 0;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    // Depth testing only for this pass: the panels rely on painter's order and enabling it
    // globally would change how they composite. Nothing here should occlude the room —
    // the depth buffer holds only our own geometry, and passthrough is composited behind.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    let drawn = 0;
    gl.depthMask(true);
    drawn += this._skeleton(viewProjection, world, this.shown, null, 1.0);
    if (this.shownTarget) {
      // Translucent, and with depth writes off so its own back faces do not z-fight into a
      // mess. Opaque first, so it occludes the ghost rather than the other way round.
      gl.depthMask(false);
      drawn += this._skeleton(viewProjection, world, this.shownTarget, this.shown, 0.4);
      gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
    return drawn;
  }

  _skeleton(viewProjection, world, joints, compareTo, alpha) {
    const gl = this.gl;
    const points = armPoints(joints);
    let drawn = 0;
    for (const bone of BONES) {
      const model = boneMatrix(points[bone.from], points[bone.to], bone.radius, world);
      // Tint by how far this bone's joints are from the other skeleton's: a bone about to
      // swing, or one lagging badly, goes amber then red.
      let lag = 0;
      if (compareTo) {
        for (const name of bone.joints) {
          lag = Math.max(lag, Math.abs((joints[name] || 0) - (compareTo[name] || 0)));
        }
      }
      const heat = Math.min(lag / 12, 1);
      const color = compareTo
        ? [1.0, 0.75 - 0.55 * heat, 0.35 - 0.3 * heat, alpha]
        : [0.42, 0.68, 0.78, alpha];
      gl.uniform4fv(this.uColor, color);
      gl.uniformMatrix4fv(this.uModel, false, model);
      gl.uniformMatrix4fv(this.uMVP, false, multiply4(viewProjection, model));
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
      drawn += 1;
    }
    // A stub along the approach axis, so which way the jaw faces is readable.
    const tip = points.tool.map((v, i) => v + points.approach[i] * 0.045);
    const model = boneMatrix(points.tool, tip, 0.013, world);
    gl.uniform4fv(this.uColor, compareTo ? [1.0, 0.75, 0.35, alpha] : [0.85, 0.9, 0.95, alpha]);
    gl.uniformMatrix4fv(this.uModel, false, model);
    gl.uniformMatrix4fv(this.uMVP, false, multiply4(viewProjection, model));
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    return drawn + 1;
  }
}

window.ArmGhost = ArmGhost;
window.armPoints = armPoints;
window.armGhostPlacement = placement;
