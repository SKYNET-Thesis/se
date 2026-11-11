/**
 * Lesson one ("Open & Close Gripper", seed lesson 1) as students build it in Practice.
 * Block labels and colours mirror blocklyConfig.ts. The simulator starts with the gripper open
 * (createInitialState), so "open gripper" causes no visible change; only "close gripper" moves the jaw.
 */
export const LESSON_ONE = [
  { id: 'select', short: 'Left arm selected', color: '#7A4F8F', inner: false, result: 'Left arm selected. The gripper starts open.', jaw: 'open' },
  { id: 'open', short: 'Gripper stays open', color: '#94600F', inner: true, result: 'No visible change: the gripper is already open.', jaw: 'open' },
  { id: 'wait', short: 'Holding for 1 s', color: '#5B6573', inner: true, result: 'The arm holds its pose for one second.', jaw: 'open' },
  { id: 'close', short: 'Gripper closed', color: '#94600F', inner: true, result: 'The gripper closes.', jaw: 'closed' },
] as const;

export type LessonOneStep = (typeof LESSON_ONE)[number];

/** Rules seeded for the Gripper Sequence Challenge (learning_challenge_conditions). */
export const LESSON_ONE_RULES = [
  'Left arm is selected',
  'Gripper opens, then closes',
  'Left gripper ends closed',
] as const;
