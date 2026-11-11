import type { FrameRatio } from './MediaFrame';
import type { AssetStatus } from './manifest';

/**
 * Homepage asset manifest. Every visual area has a stable ID; layout components never
 * reference file paths. To replace a fallback: put the file in public/media/home/<folder>/,
 * set `src` (and `poster`/`sources` for video), then set `status: 'approved'`.
 * See docs/HOMEPAGE_ASSET_GUIDE.md.
 */
export type HomeAssetId =
  | 'home.hero.robot'
  | 'home.lesson.blocks'
  | 'home.lesson.preview'
  | 'home.loop.learn'
  | 'home.loop.program'
  | 'home.loop.preview'
  | 'home.loop.evaluate'
  | 'home.loop.reflect'
  | 'home.learning3d.stage'
  | 'home.roles.student'
  | 'home.roles.teacher'
  | 'home.roles.school'
  | 'home.modes.blockly'
  | 'home.modes.preview'
  | 'home.modes.vr'
  | 'home.modes.demonstration'
  | 'home.safety.visual'
  | 'home.final.robot'
  // Homepage V2 (H6.2). The 18 IDs above are unchanged.
  | 'home.v2.robot.poster';

export type HomeFallbackId =
  | 'lab-bay'
  | 'lesson-blocks'
  | 'lesson-preview'
  | 'ui-lesson'
  | 'ui-program'
  | 'ui-preview'
  | 'ui-evaluate'
  | 'ui-reflect'
  | 'learning-stage'
  | 'ui-student'
  | 'ui-teacher'
  | 'ui-school'
  | 'ui-vr'
  | 'ui-demonstration'
  | 'safety-lock'
  | 'so101-light'
  | 'robot-dark'
  | 'robot-light'
  | 'loop-learn'
  | 'loop-program'
  | 'loop-preview'
  | 'loop-evaluate'
  | 'loop-reflect'
  // H4.2 fallbacks. Earlier ids stay valid so older manifests keep rendering.
  | 'stage-axonometric'
  | 'role-student'
  | 'role-teacher'
  | 'role-school'
  | 'mode-blockly'
  | 'mode-vr'
  | 'mode-demonstration'
  | 'safety-blocks'
  // H4.3: S6 and S7 no longer repeat the S1/S3 Blockly stack and full arm.
  | 'mode-preview'
  | 'safety-boundary';

export interface HomeAsset {
  id: HomeAssetId;
  kind: 'image' | 'screenshot' | 'video' | 'model3d';
  status: AssetStatus;
  /** Image/screenshot file, or the primary video file. */
  src?: string;
  srcSet?: string;
  sizes?: string;
  /** Video poster frame (required for video). */
  poster?: string;
  sources?: Array<{ src: string; type: string }>;
  width?: number;
  height?: number;
  /** Mobile ratio, plus an optional desktop (lg) ratio. The fallback uses the same geometry. */
  ratio: { base: FrameRatio; lg?: FrameRatio };
  objectPosition?: string;
  /** `contain` for transparent cut-outs that stand on a stage; `cover` (default) for full-bleed media. */
  fit?: 'cover' | 'contain';
  /** Wrap in BrowserFrame chrome; `screen` names the real VISTA screen shown. */
  chrome?: { screen: string };
  alt: string;
  caption?: string;
  credit?: string;
  licence?: string;
  /** Source page for the credit (licence deed or original upload). */
  creditHref?: string;
  fallback: HomeFallbackId;
  /** Storage folder under public/media/home/. */
  folder: 'hero' | 'lesson' | 'learning-loop' | 'learning-3d' | 'roles' | 'modes' | 'safety';
  /** Replacement guidance shown in development builds only. */
  recommended: string;
}

const screenshot = (screen: string): Pick<HomeAsset, 'kind' | 'chrome' | 'ratio'> => ({ kind: 'screenshot', chrome: { screen }, ratio: { base: '16:10' } });
/** Learning-loop screens: square on phones (the stage content stays legible), 16:10 on desktop. */
const loopScreen = (screen: string): Pick<HomeAsset, 'kind' | 'chrome' | 'ratio' | 'objectPosition'> => ({ kind: 'screenshot', chrome: { screen }, ratio: { base: '1:1', lg: '16:10' }, objectPosition: '0% 0%' });

export const homeAssets: Record<HomeAssetId, HomeAsset> = {
  'home.hero.robot': {
    id: 'home.hero.robot', kind: 'image', status: 'planned', ratio: { base: '6:5' }, fit: 'contain', objectPosition: '50% 100%',
    alt: 'SO-101 robot arm, gripper open',
    fallback: 'robot-dark', folder: 'hero', recommended: 'Transparent cut-out render of the SO-101 (PNG/WebP with alpha), 1800×1500 (6:5), arm standing on the bottom edge, gripper open, light material for the dark stage.',
  },
  'home.lesson.blocks': {
    id: 'home.lesson.blocks', kind: 'screenshot', status: 'planned', ratio: { base: '4:5', lg: '1:1' }, objectPosition: '0% 0%',
    alt: 'Lesson one program built from VISTA blocks in Practice',
    fallback: 'lesson-blocks', folder: 'lesson', recommended: 'Reserved: not rendered in the H4.1 layout (the lesson section shows the blocks as its interactive step list). Crop of the Practice Blockly workspace, 1400×1400, WebP ≤ 220 KB.',
  },
  'home.lesson.preview': {
    id: 'home.lesson.preview', kind: 'image', status: 'planned', ratio: { base: '6:5' }, fit: 'contain', objectPosition: '50% 100%',
    alt: 'The SO-101 robot arm in the lesson one preview',
    fallback: 'robot-light', folder: 'lesson', recommended: 'Transparent cut-out render of the SO-101 (PNG/WebP with alpha), 1500×1250 (6:5), arm standing on the bottom edge. Note: an approved image replaces the drawn arm, so its per-step jaw movement is then shown only in the step text.',
  },
  'home.loop.learn': { id: 'home.loop.learn', ...loopScreen('Lesson'), status: 'planned', alt: 'Lesson viewer showing the lesson mission', fallback: 'loop-learn', folder: 'learning-loop', recommended: 'Screenshot 2880×1800 (16:10), WebP ≤ 250 KB, demo data only. Shown without browser chrome.' },
  'home.loop.program': { id: 'home.loop.program', ...loopScreen('Practice'), status: 'planned', alt: 'Practice workspace with the lesson blocks', fallback: 'loop-program', folder: 'learning-loop', recommended: 'Screenshot 2880×1800 (16:10), WebP ≤ 250 KB, demo data only. Shown without browser chrome.' },
  'home.loop.preview': { id: 'home.loop.preview', ...loopScreen('Practice: 3D preview'), status: 'planned', alt: 'Practice 3D step preview of the SO-101 arm', fallback: 'loop-preview', folder: 'learning-loop', recommended: 'Screenshot 2880×1800 (16:10), WebP ≤ 250 KB. Shown without browser chrome.' },
  'home.loop.evaluate': { id: 'home.loop.evaluate', ...loopScreen('Practice: rule checks'), status: 'planned', alt: 'Rule check results with passed and failed rules', fallback: 'loop-evaluate', folder: 'learning-loop', recommended: 'Screenshot 2880×1800 (16:10), WebP ≤ 250 KB. Shown without browser chrome.' },
  'home.loop.reflect': { id: 'home.loop.reflect', ...loopScreen('Submission feedback'), status: 'planned', alt: 'Teacher feedback and the learner reflection', fallback: 'loop-reflect', folder: 'learning-loop', recommended: 'Screenshot 2880×1800 (16:10), WebP ≤ 250 KB, no personal data. Shown without browser chrome.' },
  'home.learning3d.stage': {
    id: 'home.learning3d.stage', kind: 'video', status: 'planned', ratio: { base: '4:3', lg: '3:2' },
    alt: 'The 600 by 400 millimetre learning stage in 3D, with Target A raised 120 millimetres above it',
    caption: 'The learning frame in 3D: a classroom visualisation, not a physics simulation or a measurement from a robot.',
    fallback: 'stage-axonometric', folder: 'learning-3d', recommended: 'Render or loop of the Reach a Target preview, 1800×1200 (3:2), WebM + MP4 ≤ 2.5 MB with poster (or a WebP still). Keep the stage and Target A inside the central 4:3 area: phones crop to 4:3.',
  },
  'home.roles.student': { id: 'home.roles.student', ...screenshot('My Learning'), ratio: { base: '4:3' }, objectPosition: '0% 0%', status: 'planned', alt: 'My Learning listing the lessons assigned to a student', fallback: 'role-student', folder: 'roles', recommended: 'Screenshot 2400×1800 (4:3), WebP ≤ 220 KB, demo data only. Shown without browser chrome on a tinted sheet; key content top-left.' },
  'home.roles.teacher': { id: 'home.roles.teacher', ...screenshot('Submission review'), ratio: { base: '4:3' }, objectPosition: '0% 0%', status: 'planned', alt: 'Teacher submission review with rule checks and written feedback', fallback: 'role-teacher', folder: 'roles', recommended: 'Screenshot 2400×1800 (4:3), WebP ≤ 220 KB, demo data only. Shown without browser chrome on a tinted sheet; key content top-left.' },
  'home.roles.school': { id: 'home.roles.school', ...screenshot('School administration'), ratio: { base: '4:3' }, objectPosition: '0% 0%', status: 'planned', alt: 'School administration with a classroom, its teachers and its students', fallback: 'role-school', folder: 'roles', recommended: 'Screenshot 2400×1800 (4:3), WebP ≤ 220 KB, demo data only. Shown without browser chrome on a tinted sheet; key content top-left.' },
  'home.modes.blockly': { id: 'home.modes.blockly', kind: 'screenshot', status: 'planned', ratio: { base: '4:3', lg: '16:10' }, objectPosition: '0% 0%', alt: 'Blockly programming in Practice with a lesson-limited toolbox', fallback: 'mode-blockly', folder: 'modes', recommended: 'Screenshot 2560×1600 (16:10), WebP ≤ 220 KB. Phones crop to 4:3 from the top-left.' },
  'home.modes.preview': { id: 'home.modes.preview', kind: 'screenshot', status: 'planned', ratio: { base: '4:3', lg: '9:8' }, alt: '3D step preview of the SO-101 arm', fallback: 'mode-preview', folder: 'modes', recommended: 'Screenshot or render 1800×1600 (9:8), WebP ≤ 180 KB, arm centred. Phones crop to 4:3.' },
  'home.modes.vr': { id: 'home.modes.vr', kind: 'screenshot', status: 'planned', ratio: { base: '4:3', lg: '9:8' }, alt: 'VR learning session in offline simulated-follower mode, physical robot locked', fallback: 'mode-vr', folder: 'modes', recommended: 'Screenshot or headset capture 1800×1600 (9:8), WebP ≤ 180 KB. Must show offline mode; never the physical robot moving. Phones crop to 4:3.' },
  'home.modes.demonstration': { id: 'home.modes.demonstration', kind: 'screenshot', status: 'planned', ratio: { base: '4:3', lg: '16:10' }, objectPosition: '0% 0%', alt: 'Teach by Demonstration recording and review', fallback: 'mode-demonstration', folder: 'modes', recommended: 'Screenshot 2560×1600 (16:10), WebP ≤ 180 KB. Phones crop to 4:3 from the top-left.' },
  'home.safety.visual': { id: 'home.safety.visual', kind: 'image', status: 'planned', ratio: { base: '1:1', lg: '6:5' }, alt: 'The same program reaches the 3D preview, while the path to the physical robot stops at a lock', fallback: 'safety-boundary', folder: 'safety', recommended: 'Optional photo of the physical SO-101 at rest and powered down, 1800×1500 (6:5), dark grade, WebP ≤ 200 KB. Phones crop to 1:1 around the centre.' },
  /**
   * V2: the production-safe stand-in for the live 3D arm, used wherever the 3D model may not render
   * (licence not yet cleared, or no WebGL). Shown full-bleed behind the 3D chapters with a dark scrim.
   */
  'home.v2.robot.poster': { id: 'home.v2.robot.poster', kind: 'image', status: 'planned', ratio: { base: '4:5', lg: '16:9' }, objectPosition: '70% 50%', alt: 'The SO-101 robot arm on a dark studio stage', fallback: 'stage-axonometric', folder: 'hero', recommended: 'Studio photograph of VISTA’s own SO-101 (or a licence-cleared render), 3840×2160 (16:9), dark graphite ground, arm right of centre with the left 45% calm for text; phones crop 4:5 around 70% x. WebP ≤ 450 KB.' },
  /** Reserved since H4.2: the closing section no longer repeats the robot. Kept so existing references resolve. */
  'home.final.robot': { id: 'home.final.robot', kind: 'image', status: 'planned', ratio: { base: '4:3', lg: '4:5' }, objectPosition: '50% 100%', alt: 'SO-101 robot arm at rest', fallback: 'so101-light', folder: 'hero', recommended: 'Reserved: not rendered in the H4.2 layout (the page closes on the VISTA wordmark). Render or photo 1600×2000 (4:5), light ground, WebP ≤ 200 KB.' },
};

/** Credits for every approved asset that is not VISTA's own, for the footer. */
export function approvedCredits(): Array<{ id: HomeAssetId; text: string; licence?: string; href?: string }> {
  return Object.values(homeAssets)
    .filter((asset) => isApproved(asset) && asset.credit)
    .map((asset) => ({ id: asset.id, text: asset.credit as string, licence: asset.licence, href: asset.creditHref }));
}

export function isApproved(asset: HomeAsset): boolean {
  if (asset.status !== 'approved') return false;
  return asset.kind === 'video' ? Boolean((asset.src || asset.sources?.length) && asset.poster) : Boolean(asset.src);
}
