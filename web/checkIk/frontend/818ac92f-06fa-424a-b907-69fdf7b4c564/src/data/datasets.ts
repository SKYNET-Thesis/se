import type { Dataset, DatasetEpisode } from '../types';

const makeEpisodes = (
count: number,
arms: DatasetEpisode['arms'],
cameras: number,
vr = false)
: DatasetEpisode[] =>
Array.from({ length: count }, (_, i) => {
  const idx = count - i;
  return {
    id: `ep-${arms}-${idx}`,
    index: idx,
    durationSec: 24 + idx * 7 % 41,
    recordedAt: `${20 - i % 9} Aug 2026 · ${String(9 + i % 8).padStart(2, '0')}:${String(i * 13 % 60).padStart(2, '0')}`,
    arms,
    vr: vr && i % 4 === 0,
    cameras,
    quality: i % 11 === 3 ? 'review' : 'good',
    notes:
    i % 11 === 3 ?
    'Follower lagged on the handoff — flagged for review.' :
    'Nominal run.'
  };
});

export const initialDatasets: Dataset[] = [
{
  id: 'ds-fold-towel',
  name: 'fold_towel_bimanual',
  repoId: 'lelab-bench-a/fold_towel_bimanual',
  type: 'Dual Arm',
  episodes: 62,
  durationMin: 48,
  cameras: 3,
  sizeGb: 12.4,
  uploadStatus: 'local-only',
  vrRecorded: false,
  lastModified: '21 Aug 2026 · 17:22',
  trainingReady: true,
  episodeList: makeEpisodes(14, 'dual', 3)
},
{
  id: 'ds-cube-handoff',
  name: 'cube_handoff',
  repoId: 'lelab-bench-a/cube_handoff',
  type: 'Dual Arm',
  episodes: 48,
  durationMin: 31,
  cameras: 3,
  sizeGb: 8.9,
  uploadStatus: 'uploaded',
  vrRecorded: true,
  lastModified: '15 Aug 2026 · 11:05',
  trainingReady: true,
  episodeList: makeEpisodes(12, 'dual', 3, true)
},
{
  id: 'ds-plug-insertion',
  name: 'plug_insertion',
  repoId: null,
  type: 'Single Arm',
  episodes: 25,
  durationMin: 14,
  cameras: 2,
  sizeGb: 3.1,
  uploadStatus: 'local-only',
  vrRecorded: false,
  lastModified: '09 Aug 2026 · 14:48',
  trainingReady: false,
  episodeList: makeEpisodes(9, 'left', 2)
}];