import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import { GLView } from "expo-gl";
import type { ExpoWebGLRenderingContext } from "expo-gl/build/GLView.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { colors } from "../theme";

// Dedicated onboarding hero model. Kept independent from Home's arm.glb /
// ArmModelViewer — same native GLB-loading mechanism, but this viewer is
// decorative-only (no gestures, no diagnostic markers): it holds a fixed
// 3/4 pose and idles with a subtle sway + float, rather than spinning.
const modelAsset = require("../../assets/models/SO-Arm101.glb");

type Props = {
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Same sphere-based fit as Home's ArmModelViewer. The sphere is
// rotation-invariant, so the robot stays clear of the frame regardless of
// yaw — more headroom than the small idle sway below actually needs, but
// it's shared, tested framing math and not worth diverging from.
const CAMERA_FIT_MARGIN = 1.2;
// The hero holds this angle — a flattering 3/4 view of both arms — and
// only ever sways a little around it, never spins past it.
const BASE_YAW = -0.42;
// A sine wave's velocity is zero at both extremes, which is exactly what
// an ease-in-out turnaround feels like — no separate easing curve needed,
// and it loops perfectly since sin() is already periodic.
const YAW_SWAY_AMPLITUDE = THREE.MathUtils.degToRad(12);
const YAW_SWAY_PERIOD = 7; // seconds for one full left–right–left cycle
// Subtle vertical breathing, a few px on screen. Deliberately not a clean
// multiple of YAW_SWAY_PERIOD so the combined sway+float motion doesn't
// resettle into an obviously mechanical repeating pattern.
const FLOAT_PERIOD = 5.2; // seconds
const FLOAT_AMPLITUDE_RATIO = 0.012; // fraction of the model's bounding radius
// Fixed lean, radians — applied once, never animated. Small on purpose:
// the pivot is the bounding sphere's center, not the feet, so a larger
// tilt would visibly drift the base.
const STATIC_PITCH_TILT = -0.05;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_LENGTH = 12;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const TEXTURE_CACHE_PREFIX = "so-arm101-onboarding-texture";

type NativeTextureSource = {
  height: number;
  uri: string;
  width: number;
};

type GlbChunk = {
  data: Uint8Array;
  type: number;
};

type GlbImageDef = {
  bufferView?: number;
  mimeType?: string;
  name?: string;
  uri?: string;
};

type GlbBufferViewDef = {
  buffer?: number;
  byteLength?: number;
  byteOffset?: number;
};

type GlbJson = {
  bufferViews?: GlbBufferViewDef[];
  images?: GlbImageDef[];
};

class NativeFileTextureLoader {
  readonly isImageBitmapLoader = false;
  private readonly sourcesByUri: Map<string, NativeTextureSource>;

  constructor(sources: NativeTextureSource[]) {
    this.sourcesByUri = new Map(sources.map((source) => [source.uri, source]));
  }

  load(
    uri: string,
    onLoad?: (texture: THREE.Texture) => void,
    _onProgress?: unknown,
    onError?: (error: unknown) => void
  ) {
    try {
      const source = this.sourcesByUri.get(uri);
      if (!source) throw new Error(`Missing native texture source: ${uri}`);

      const image = {
        height: source.height,
        localUri: source.uri,
        uri: source.uri,
        width: source.width
      } as unknown as HTMLImageElement;
      const texture = new THREE.Texture(image);
      texture.needsUpdate = true;

      onLoad?.(texture);
      return texture;
    } catch (error) {
      onError?.(error);
      return new THREE.Texture();
    }
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeUtf8(text: string) {
  const output: number[] = [];

  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) {
      output.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      output.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      output.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      output.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }

  return new Uint8Array(output);
}

function readGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== GLB_VERSION) {
    throw new Error("SO-Arm101.glb is not a glTF 2.0 binary");
  }

  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength) {
    throw new Error("SO-Arm101.glb is truncated");
  }

  const chunks: GlbChunk[] = [];
  let json: GlbJson | null = null;
  let jsonChunkIndex = -1;
  let binChunk: Uint8Array | null = null;
  let offset = GLB_HEADER_LENGTH;
  const decoder = new TextDecoder();

  while (offset + 8 <= declaredLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;

    const chunk = bytes.slice(offset, offset + chunkLength);
    chunks.push({ data: chunk, type: chunkType });

    if (chunkType === GLB_JSON_CHUNK) {
      json = JSON.parse(decoder.decode(chunk)) as GlbJson;
      jsonChunkIndex = chunks.length - 1;
    } else if (chunkType === GLB_BIN_CHUNK) {
      binChunk = chunk;
    }

    offset += chunkLength;
  }

  if (!json || jsonChunkIndex < 0 || !binChunk) {
    throw new Error("SO-Arm101.glb is missing JSON or BIN chunks");
  }

  return { binChunk, chunks, json, jsonChunkIndex };
}

function getTextureExtension(mimeType: string | undefined) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  throw new Error(`Unsupported SO-Arm101 texture type: ${mimeType ?? "unknown"}`);
}

function getPngDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  };
}

function getJpegDimensions(bytes: Uint8Array) {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const chunkLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8]
      };
    }

    offset += 2 + chunkLength;
  }

  throw new Error("Could not read SO-Arm101 JPEG texture dimensions");
}

function getTextureDimensions(bytes: Uint8Array, mimeType: string | undefined) {
  if (mimeType === "image/png") return getPngDimensions(bytes);
  if (mimeType === "image/jpeg") return getJpegDimensions(bytes);
  throw new Error(`Unsupported SO-Arm101 texture type: ${mimeType ?? "unknown"}`);
}

function rewriteGlbJsonChunk(chunks: GlbChunk[], jsonChunkIndex: number, json: GlbJson) {
  const jsonBytes = encodeUtf8(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const paddedJson = new Uint8Array(paddedJsonLength);
  paddedJson.fill(0x20);
  paddedJson.set(jsonBytes);

  const outputChunks = chunks.map((chunk, index) =>
    index === jsonChunkIndex ? { data: paddedJson, type: GLB_JSON_CHUNK } : chunk
  );
  const totalLength = GLB_HEADER_LENGTH + outputChunks.reduce((sum, chunk) => sum + 8 + chunk.data.byteLength, 0);
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  let offset = GLB_HEADER_LENGTH;
  outputChunks.forEach((chunk) => {
    view.setUint32(offset, chunk.data.byteLength, true);
    view.setUint32(offset + 4, chunk.type, true);
    offset += 8;
    output.set(chunk.data, offset);
    offset += chunk.data.byteLength;
  });

  return toArrayBuffer(output);
}

function writeTextureToCache(index: number, bytes: Uint8Array, mimeType: string | undefined) {
  const extension = getTextureExtension(mimeType);
  const file = new File(Paths.cache, `${TEXTURE_CACHE_PREFIX}-${index}.${extension}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(bytes));
  return file.uri;
}

function createNativeTextureHandler(textures: NativeTextureSource[]) {
  const manager = new THREE.LoadingManager();
  const loader = new NativeFileTextureLoader(textures);
  manager.addHandler(new RegExp(`${TEXTURE_CACHE_PREFIX}-\\d+\\.(png|jpe?g)$`, "i"), loader as unknown as THREE.Loader);
  return manager;
}

function prepareNativeGlbWithFileTextures(bytes: Uint8Array) {
  const { binChunk, chunks, json, jsonChunkIndex } = readGlb(bytes);
  const images = json.images ?? [];
  const bufferViews = json.bufferViews ?? [];
  const textures: NativeTextureSource[] = [];

  images.forEach((image, index) => {
    if (image.bufferView === undefined) return;

    const bufferView = bufferViews[image.bufferView];
    if (!bufferView) return;

    const bufferIndex = bufferView.buffer ?? 0;
    if (bufferIndex !== 0) return;

    const byteOffset = bufferView.byteOffset ?? 0;
    const byteLength = bufferView.byteLength ?? 0;
    const imageBytes = binChunk.subarray(byteOffset, byteOffset + byteLength);
    const { width, height } = getTextureDimensions(imageBytes, image.mimeType);
    const uri = writeTextureToCache(index, imageBytes, image.mimeType);

    textures.push({ height, uri, width });
    image.uri = uri;
    delete image.bufferView;
  });

  return {
    buffer: rewriteGlbJsonChunk(chunks, jsonChunkIndex, json),
    textureManager: textures.length > 0 ? createNativeTextureHandler(textures) : undefined
  };
}

// A camera sitting dead level with the sphere center reads as a flat,
// straight-on mugshot. Dropping the camera slightly below center and
// aiming a touch above it fakes a low "hero shot" angle — the same trick
// product photography uses to make an object look upright and imposing
// rather than hunched — without touching the model's own pose.
const CAMERA_HEIGHT_RATIO = -0.05;
const LOOK_AT_HEIGHT_RATIO = 0.12;

function fitCameraToBoundingSphere(camera: THREE.PerspectiveCamera, boundingRadius: number) {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const fitDistance = (boundingRadius / Math.sin(verticalFov / 2)) * CAMERA_FIT_MARGIN;

  camera.position.set(0, boundingRadius * CAMERA_HEIGHT_RATIO, fitDistance);
  camera.lookAt(0, boundingRadius * LOOK_AT_HEIGHT_RATIO, 0);
  camera.near = Math.max(fitDistance * 0.01, 0.001);
  camera.far = fitDistance * 12;
  camera.updateProjectionMatrix();

  return fitDistance;
}

function addGroundShadow(scene: THREE.Scene, boundingRadius: number, floorY: number) {
  const shadowColor = new THREE.Color(colors.surface2);
  [
    { radius: boundingRadius * 0.5, opacity: 0.4 },
    { radius: boundingRadius * 0.32, opacity: 0.28 }
  ].forEach(({ radius, opacity }, index) => {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 64),
      new THREE.MeshBasicMaterial({ color: shadowColor, transparent: true, opacity, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = floorY - boundingRadius * 0.001 * index;
    scene.add(disc);
  });
}

function createRenderer(gl: ExpoWebGLRenderingContext) {
  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as HTMLCanvasElement;

  return new THREE.WebGLRenderer({
    alpha: true,
    canvas,
    context: gl as unknown as WebGLRenderingContext
  });
}

function ensureReactNativeUserAgent() {
  if (typeof navigator === "undefined" || navigator.userAgent) return;

  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "OmniArm React Native"
  });
}

// See ArmModelViewer.tsx for the full explanation: Hermes/RN's fetch
// polyfill never registered the ProgressEvent global that three.js's
// FileLoader constructs while downloading. Guards any model with external
// buffers/textures fetched through that path.
function ensureProgressEventPolyfill() {
  const target = globalThis as unknown as { ProgressEvent?: unknown };
  if (typeof target.ProgressEvent !== "undefined") return;

  class ProgressEventPolyfill {
    readonly type: string;
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;

    constructor(type: string, init?: { lengthComputable?: boolean; loaded?: number; total?: number }) {
      this.type = type;
      this.lengthComputable = init?.lengthComputable ?? false;
      this.loaded = init?.loaded ?? 0;
      this.total = init?.total ?? 0;
    }
  }

  target.ProgressEvent = ProgressEventPolyfill;
}

// Same native-vs-web split as ArmModelViewer.tsx: RN's fetch/Response can't
// reliably hand back an arraybuffer for file:// URIs under Hermes, so on
// native we read the bytes via expo-file-system and parse them directly.
async function loadGltfModel(asset: Asset): Promise<{ scene: THREE.Object3D }> {
  const uri = asset.localUri ?? asset.uri;

  if (Platform.OS === "web") {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(uri, resolve, undefined, reject);
    });
  }

  const bytes = await new File(uri).bytes();
  const { buffer, textureManager } = prepareNativeGlbWithFileTextures(bytes);
  const loader = new GLTFLoader(textureManager);

  return new Promise((resolve, reject) => {
    loader.parse(buffer, "", resolve, reject);
  });
}

export function OnboardingHero({ reduceMotion = false, style }: Props) {
  const frameRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
        const renderer = createRenderer(gl);
        renderer.setSize(width, height);
        // Transparent clear so the hero card's own gradient backdrop
        // (a separate SVG layer beneath this canvas) shows through
        // everywhere the model and its floor shadow don't paint —
        // scene.background is intentionally left unset.
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);

        const group = new THREE.Group();
        // A small fixed forward-lean (independent of the animated sway
        // below) counters the model's resting pose reading as "head
        // drooping down" — it lifts the upper body without disturbing
        // the sway or the feet's contact point much.
        group.rotation.set(STATIC_PITCH_TILT, BASE_YAW, 0);
        scene.add(group);

        // Lower ambient than the diagnostic viewer's flat 1.2 so the
        // key/fill pair actually shapes the surfaces instead of washing
        // them out — this is what reads as "khối" (volume) instead of flat.
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(4, 5, 5);
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        fill.position.set(-3, -1, 3);
        const rim = new THREE.DirectionalLight(0xc6f24e, 0.9);
        rim.position.set(-4, 2, -3);
        scene.add(ambient, key, fill, rim);

        const asset = Asset.fromModule(modelAsset);
        await asset.downloadAsync();
        ensureReactNativeUserAgent();
        ensureProgressEventPolyfill();

        const gltf = await loadGltfModel(asset);
        const model = gltf.scene;
        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const center = sphere.center.clone();
        const boundingRadius = Math.max(sphere.radius, 0.001);

        model.position.sub(center);
        group.add(model);

        fitCameraToBoundingSphere(camera, boundingRadius);

        const floorY = box.min.y - center.y - boundingRadius * 0.02;
        addGroundShadow(scene, boundingRadius, floorY);

        const floatAmplitude = boundingRadius * FLOAT_AMPLITUDE_RATIO;

        const render = (time: number) => {
          frameRef.current = requestAnimationFrame(render);

          if (!reduceMotion) {
            // `last === null` only on this loop's very first tick — skip
            // the delta there instead of measuring it against an rAF
            // timestamp from a manual "time 0" kickoff. Mixing a fake 0
            // with the real (time-since-page-load) clock rAF actually
            // uses would otherwise produce one enormous first delta and
            // snap the sway to a random phase instead of starting at rest.
            const last = lastTickRef.current;
            lastTickRef.current = time;
            if (last !== null) {
              elapsedRef.current += (time - last) / 1000;
            }

            const yawPhase = (elapsedRef.current / YAW_SWAY_PERIOD) * Math.PI * 2;
            group.rotation.y = BASE_YAW + Math.sin(yawPhase) * YAW_SWAY_AMPLITUDE;

            const floatPhase = (elapsedRef.current / FLOAT_PERIOD) * Math.PI * 2;
            group.position.y = Math.sin(floatPhase) * floatAmplitude;
          }

          renderer.render(scene, camera);
          gl.endFrameEXP();
        };

        // One immediate static render at the resting pose (elapsedRef is
        // still 0), then hand off to rAF for the animated loop — keeps
        // the very first frame on-screen without an extra fake timestamp
        // polluting the delta math above.
        renderer.render(scene, camera);
        gl.endFrameEXP();
        frameRef.current = requestAnimationFrame(render);
      } catch (error) {
        console.warn("Failed to load SO-Arm101.glb", error);
        setFailed(true);
      }
    },
    [reduceMotion]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  if (failed) {
    return <View style={[styles.fallback, style]} />;
  }

  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill
  },
  gl: {
    flex: 1
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg
  }
});
