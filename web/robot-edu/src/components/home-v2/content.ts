import type { HomeAssetId } from '../home/media/homeAssets';

/**
 * Homepage V2 copy and data. Every statement here describes VISTA as it exists today; the wording is
 * provisional on purpose, because further SO-ARM101 learning capabilities will be added later.
 */

export const NAV = [
  { id: 'v2-lesson', label: 'Lesson' },
  { id: 'v2-journey', label: 'Learning loop' },
  { id: 'v2-space', label: '3D stage' },
  { id: 'v2-roles', label: 'Roles' },
  { id: 'v2-modes', label: 'Modes' },
  { id: 'v2-safety', label: 'Safety' },
  { id: 'v2-schools', label: 'Schools' },
] as const;

export interface JourneyStage { name: string; text: string; asset: HomeAssetId }

/** The loop every lesson follows (S3). Screens are the existing home.loop.* asset slots. */
export const JOURNEY: JourneyStage[] = [
  { name: 'Learn', text: 'Read the lesson and its mission before writing any code.', asset: 'home.loop.learn' },
  { name: 'Program', text: 'Build the program with VISTA blocks in Practice. Work saves to the assignment.', asset: 'home.loop.program' },
  { name: 'Preview', text: 'Play the program step by step on the SO-101 preview before submitting it.', asset: 'home.loop.preview' },
  { name: 'Evaluate', text: 'Rule checks mark each rule passed or failed, with evidence from the preview trace. They are not a grade.', asset: 'home.loop.evaluate' },
  { name: 'Reflect', text: 'Read the teacher’s feedback and write a short reflection on the submission.', asset: 'home.loop.reflect' },
];

export interface Role { id: 'student' | 'teacher' | 'school'; word: string; name: string; lead: string; points: [string, string]; asset: HomeAssetId; accent: string }

export const ROLES: Role[] = [
  { id: 'student', word: 'Students', name: 'Students', lead: 'Practise one lesson at a time and watch every step before you submit.', points: ['My Learning lists the lessons assigned through your classrooms.', 'Rule checks mark each rule passed or failed. They are not a grade.'], asset: 'home.roles.student', accent: '#7fd8c8' },
  { id: 'teacher', word: 'Teachers', name: 'Teachers', lead: 'See your own classes and answer the work your students submit.', points: ['My Classes lists only the classrooms where you teach.', 'Send written feedback, and assess against the rubric when an assignment has one.'], asset: 'home.roles.teacher', accent: '#c9aedb' },
  { id: 'school', word: 'Schools', name: 'School administrators', lead: 'Set up your school’s people and classrooms in one place.', points: ['Create classrooms, then assign teachers and enrol students.', 'CSV import offers templates and a local preview. It does not create accounts yet.'], asset: 'home.roles.school', accent: '#aeb9c7' },
];

export type ModeAvailability = 'practice' | 'session';

export interface LearningMode { id: string; name: string; status: string; availability: ModeAvailability; text: string; limits: string; asset: HomeAssetId }

/**
 * The learning modes documented today (S6). Extensible by design: add a new SO-ARM101 learning method
 * here, with its own asset ID, once it exists. The gallery renders any number of entries.
 */
export const LEARNING_MODES: LearningMode[] = [
  { id: 'blockly', name: 'Block programming', status: 'In Practice', availability: 'practice', text: 'Lessons can limit the toolbox to the blocks they teach, so students start with exactly what the mission needs.', limits: 'Blocks compile to the canonical steps the VISTA server understands.', asset: 'home.modes.blockly' },
  { id: 'preview', name: '3D step preview', status: 'In Practice, preview only', availability: 'practice', text: 'Plays each block on the SO-101 model, one step at a time.', limits: 'A visualisation, not a physics simulation.', asset: 'home.modes.preview' },
  { id: 'vr', name: 'VR learning', status: 'Offline, simulated follower', availability: 'session', text: 'Hand or controller motion drives a simulated arm.', limits: 'Needs the VR runtime. The physical robot stays locked.', asset: 'home.modes.vr' },
  { id: 'demonstration', name: 'Teach by demonstration', status: 'Records one episode at a time', availability: 'session', text: 'Students record what the robot observed and what they commanded.', limits: 'No model is trained.', asset: 'home.modes.demonstration' },
];

/** Condensed from the physical execution safety boundary (docs/robot-safety-boundary.md). */
export const SAFETY_GATES = [
  'A signed-in learner with permission and an active classroom.',
  'A submitted program version that has not changed.',
  'Supported steps only: home, gripper and wait, on one arm.',
  'A confirmation tied to that version, arm and motion profile.',
  'A calibrated, available robot with its motion lock released.',
  'A working Stop path before any command is sent.',
] as const;

export type Actor = 'School administrator' | 'Student' | 'Teacher';

export const SCHOOL_FLOW: Array<{ title: string; text: string; actor: Actor }> = [
  { title: 'Members and classrooms', text: 'The administrator sees who belongs to the school and creates its classrooms.', actor: 'School administrator' },
  { title: 'Teachers and students', text: 'The administrator assigns teachers and enrols students in each classroom.', actor: 'School administrator' },
  { title: 'Lessons to practise', text: 'Students find the lessons assigned to their classrooms in My Learning.', actor: 'Student' },
  { title: 'Review and feedback', text: 'Teachers review submissions from their own classes and send feedback.', actor: 'Teacher' },
];

export const ACTOR_ACCENT: Record<Actor, string> = { 'School administrator': '#aeb9c7', Student: '#7fd8c8', Teacher: '#c9aedb' };

/** Required attribution. Approved third-party media credits are appended from the manifest. */
export const CREDITS = [
  'SO-101 robot arm design by TheRobotStudio and Hugging Face. Its hardware design licence is still being verified, so this 3D preview is a development build only.',
  'The 3D arm is loaded with urdf-loader (Apache-2.0) and rendered with three.js (MIT).',
  'Typefaces: Inter, Inter Tight and JetBrains Mono (SIL Open Font License 1.1).', // taste-skill-ignore: attribution
] as const;
