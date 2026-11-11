import type { HomeAssetId } from '../../home/media/homeAssets';
import type { ModesPreset } from '../V2Scene';

/**
 * The learning experiences of the "Ways to learn" chapter. The chapter renders whatever is in
 * LEARNING_EXPERIENCES: to add a later SO-ARM101 experience, add an entry with its words, its asset
 * IDs, its camera preset and an interaction `kind` (reuse one, or register a new kind in
 * ModesChapter's KINDS). The layout does not change.
 *
 * Every line describes VISTA as it exists today. The interactions on the Homepage are illustrations
 * that run on the page; `where` says where the real experience runs.
 */
export type Availability = 'practice' | 'session';

/** How the visitor interacts with an experience on the Homepage. */
export type InteractionKind = 'program' | 'follower' | 'episode';

export interface LearningExperience {
  id: string;
  name: string;
  availability: Availability;
  /** Where the real experience runs. Never implies the physical robot moves. */
  where: string;
  /** What a student comes away able to do. */
  outcome: string;
  /** What this Homepage illustration is, in one line. */
  illustration: string;
  /** Its honest limits. */
  limits: string;
  /** Manifest slots for approved screenshots or video of the real experience (IDs unchanged). */
  assets: HomeAssetId[];
  kind: InteractionKind;
  /** Camera (window space), light and arm for this experience on the shared stage. */
  preset: ModesPreset;
}

export const LEARNING_EXPERIENCES: LearningExperience[] = [
  {
    id: 'program',
    name: 'Program and preview',
    availability: 'practice',
    where: 'In Practice',
    outcome: 'Build a program from blocks and see what every block does before anything runs.',
    illustration: 'Lesson one’s real blocks and the steps they compile to, previewed on the SO-101 model.',
    limits: 'A preview, not a physics simulation.',
    assets: ['home.modes.blockly', 'home.modes.preview'],
    kind: 'program',
    preset: { rig: { azimuth: 2.05, elevation: 0.28, distance: 2.9, targetY: 0.55, targetZ: 0.2, fov: 28, fit: 2.0, ax: 0.62, ay: 0.38 }, light: 1, glow: 0, restArm: true },
  },
  {
    id: 'vr',
    name: 'VR learning',
    availability: 'session',
    where: 'A separate VR session, offline, with the VR runtime',
    outcome: 'Move a hand or controller and watch a simulated arm follow it.',
    illustration: 'An illustration on this page: the pad stands in for the hand. The VR runtime is not running here.',
    limits: 'Offline, with a simulated follower. The physical robot stays locked.',
    assets: ['home.modes.vr'],
    kind: 'follower',
    preset: { rig: { azimuth: 0.75, elevation: 0.24, distance: 3.7, targetY: 0.42, targetZ: 0.05, fov: 28, fit: 1.2, ax: 0.58 }, light: 0.78, glow: 0.35, restArm: false },
  },
  {
    id: 'demo',
    name: 'Teach by demonstration',
    availability: 'session',
    where: 'A separate session, one episode at a time',
    outcome: 'Record what you commanded and what the robot observed, then review the episode.',
    illustration: 'An illustration on this page: record the pad, then replay it on the preview. Nothing is saved or sent.',
    limits: 'Episodes are for review. No model is trained.',
    assets: ['home.modes.demonstration'],
    kind: 'episode',
    preset: { rig: { azimuth: -0.8, elevation: 0.42, distance: 3.25, targetY: 0.36, targetZ: 0.05, fov: 28, fit: 0.95, ax: 0.58, ay: 0.49 }, light: 0.92, glow: 0, restArm: false },
  },
];

/** Experiences VISTA has that another Homepage chapter already shows. */
export const COVERED_ELSEWHERE = [
  { name: 'Reach a Target', text: 'Coordinates on the 600 × 400 mm stage, shown in Find Target A in 3D above.', href: '#v2-space' },
] as const;
