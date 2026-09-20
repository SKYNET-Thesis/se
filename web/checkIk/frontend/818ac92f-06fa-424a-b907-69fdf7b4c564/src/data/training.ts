import type { TrainedModel, TrainingJob } from '../types';

const lossCurve = (points: number, total: number) =>
Array.from({ length: points }, (_, i) => {
  const step = Math.round((i + 1) / points * total * 0.42);
  const base = 1.42 * Math.exp(-i / (points / 2.6)) + 0.11;
  const jitter = i * 37 % 11 / 320;
  return { step, loss: Number((base + jitter).toFixed(3)) };
});

export const initialJobs: TrainingJob[] = [
{
  id: 'job-act-fold',
  name: 'act_fold_towel_bimanual_v3',
  datasetName: 'fold_towel_bimanual',
  policy: 'ACT',
  compute: 'Local GPU · RTX 4090',
  status: 'running',
  step: 4180,
  totalSteps: 10000,
  loss: 0.184,
  etaMin: 38,
  gpuUtilPct: 87,
  memoryGb: 14.2,
  startedAt: '22 Aug 2026 · 08:52',
  location: 'local',
  losses: lossCurve(26, 10000),
  logs: [
  '[08:52:04] Loading dataset fold_towel_bimanual (62 episodes, 3 cameras)',
  '[08:52:31] Policy ACT · chunk_size=100 · n_action_steps=100',
  '[08:52:33] CUDA device 0 · RTX 4090 · 24 GB',
  '[09:14:52] step 4000 | loss 0.192 | lr 1.0e-5 | 4.6 it/s',
  '[09:16:10] checkpoint saved: outputs/act_fold_towel_bimanual_v3/step_4000',
  '[09:18:44] step 4180 | loss 0.184 | lr 1.0e-5 | 4.5 it/s']

},
{
  id: 'job-act-cube',
  name: 'act_cube_handoff_v1',
  datasetName: 'cube_handoff',
  policy: 'ACT',
  compute: 'Local GPU · RTX 4090',
  status: 'completed',
  step: 10000,
  totalSteps: 10000,
  loss: 0.127,
  etaMin: null,
  gpuUtilPct: null,
  memoryGb: null,
  startedAt: '15 Aug 2026 · 19:10',
  location: 'local',
  losses: lossCurve(24, 10000).map((p, i, a) => ({ step: Math.round((i + 1) / a.length * 10000), loss: p.loss })),
  logs: [
  '[19:10:02] Loading dataset cube_handoff (48 episodes, 3 cameras)',
  '[22:47:19] step 10000 | loss 0.127 | training complete',
  '[22:47:25] checkpoint saved: outputs/act_cube_handoff_v1/step_10000']

}];


export const initialModels: TrainedModel[] = [
{
  id: 'm-cube',
  name: 'act_cube_handoff_v1',
  policy: 'ACT',
  dataset: 'cube_handoff',
  arms: 'Dual Arm',
  robot: 'SO-101',
  trainedAt: '15 Aug 2026',
  checkpoints: 5,
  location: 'outputs/act_cube_handoff_v1',
  uploaded: false,
  cameras: 3
},
{
  id: 'm-plug',
  name: 'act_plug_insertion_v2',
  policy: 'ACT',
  dataset: 'plug_insertion',
  arms: 'Single Arm',
  robot: 'SO-101',
  trainedAt: '10 Aug 2026',
  checkpoints: 3,
  location: 'outputs/act_plug_insertion_v2',
  uploaded: true,
  cameras: 2
},
{
  id: 'm-towel-old',
  name: 'act_fold_towel_v1',
  policy: 'ACT',
  dataset: 'fold_towel_bimanual (partial, 31 eps)',
  arms: 'Dual Arm',
  robot: 'SO-101',
  trainedAt: '02 Aug 2026',
  checkpoints: 4,
  location: 'outputs/act_fold_towel_v1',
  uploaded: false,
  cameras: 4
}];


export const policies = [
{
  id: 'act',
  name: 'ACT',
  title: 'Action Chunking Transformer',
  blurb:
  'Predicts short chunks of future actions from camera frames and joint states. Strong default for SO-101 imitation learning from 25–100 demonstrations.',
  supported: true
},
{
  id: 'diffusion',
  name: 'Diffusion Policy',
  title: 'Visuomotor diffusion',
  blurb:
  'Smoother multimodal trajectories, needs more data and longer training. Not exposed by the connected backend.',
  supported: false
},
{
  id: 'pi0',
  name: 'π0',
  title: 'Vision-language-action',
  blurb: 'Requires a checkpoint download and GPU memory beyond the reported local target.',
  supported: false
}];