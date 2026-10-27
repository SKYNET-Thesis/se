/**
 * Homepage media manifest. Components reference assets by entry, never by raw path,
 * so an asset can be replaced (image, video or model) without layout changes.
 *
 * Only `approved` assets with a `src` may render publicly. Anything else renders its
 * designed fallback; the public Homepage must never show placeholder content.
 */
export type AssetKind = 'image' | 'screenshot' | 'video' | 'model3d' | 'illustration';
export type AssetStatus = 'planned' | 'draft' | 'approved';
export type AssetFallbackKind = 'so101-illustration' | 'learning-stage' | 'type-only';

export interface MediaCredit {
  text: string;
  licence?: string;
  href?: string;
}

export interface MediaAsset {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
  alt: string;
  credit?: MediaCredit;
  fallback: AssetFallbackKind;
  usedIn: string[];
  note?: string;
}

export const homeMedia = {
  so101Model: {
    id: 'R01',
    kind: 'model3d',
    status: 'draft',
    src: '/assets/so101/urdf/so101_new_calib.urdf',
    alt: '3D model of the SO-101 robot arm',
    credit: { text: 'SO-101 arm design by TheRobotStudio and Hugging Face. 3D viewer adapted from LeLab.', licence: 'Viewer: Apache-2.0. Hardware design licence to verify.' },
    fallback: 'so101-illustration',
    usedIn: ['hero-a', 'hero-c'],
    note: 'Draft until the hardware design licence is verified; offered in development builds only.',
  },
  heroPoster: {
    id: 'M01',
    kind: 'image',
    status: 'planned',
    alt: 'SO-101 robot arm reaching Target A on the 600 by 400 millimetre learning stage',
    fallback: 'so101-illustration',
    usedIn: ['hero-a', 'hero-b'],
    note: 'Render from the repository viewer, 4:5 at 1600 by 2000.',
  },
  heroPosterWide: {
    id: 'M01W',
    kind: 'image',
    status: 'planned',
    alt: 'SO-101 robot arm on the 600 by 400 millimetre learning stage, gripper open',
    fallback: 'so101-illustration',
    usedIn: ['hero-d'],
    note: 'Render from the repository viewer, 6:5 at 1800 by 1500, dark lab ground, gripper open (initial state).',
  },
  lessonOnePoster: {
    id: 'M02',
    kind: 'image',
    status: 'planned',
    alt: 'SO-101 robot arm with its gripper open during lesson one',
    fallback: 'so101-illustration',
    usedIn: ['hero-c'],
  },
  so101Illustration: {
    id: 'M03',
    kind: 'illustration',
    status: 'approved',
    alt: 'Illustration of the SO-101 robot arm',
    fallback: 'so101-illustration',
    usedIn: ['hero-a', 'hero-b', 'hero-c'],
    note: 'Drawn in code; schematic, not a measured drawing.',
  },
  learningStage: {
    id: 'M15',
    kind: 'illustration',
    status: 'approved',
    alt: 'Plan of the 600 by 400 millimetre learning stage with Target A',
    fallback: 'learning-stage',
    usedIn: ['hero-a', 'hero-b'],
    note: 'Drawn in code from TABLE (kinematics.ts) and the seeded Target A.',
  },
} satisfies Record<string, MediaAsset>;

export function isPublishable(asset: MediaAsset): boolean {
  return asset.status === 'approved' && Boolean(asset.src);
}
