import type { Assignment } from '../types/learning';
import { daysFromNow } from '../utils/format';

/** DEMO CONTENT — seeded relative to today so due dates stay meaningful. */
export const demoAssignments: Assignment[] = [
{
  id: 'asg-reach',
  courseId: 'rob-101',
  lessonId: 'motion-reach',
  title: 'Reach test',
  summary: 'Move the left arm to three reachable points and fix the ones that are not.',
  instructions: [
  'Open the "Reach test (draft)" program in the Studio.',
  'Run Validate and read every problem.',
  'Correct the out-of-range coordinate so the target sits on the table and within reach.',
  'Remove or attach the disconnected block, then run the simulation.'],

  objectives: ['Read validation problems and locate the block responsible', 'Choose coordinates inside an arm’s reach'],
  criteria: [
  { id: 'c1', text: 'Program validates with no errors', check: { kind: 'no_errors' } },
  { id: 'c2', text: 'Uses Move Arm to Position', check: { kind: 'uses_op', op: 'move_to' } },
  { id: 'c3', text: 'Simulation runs to completion', check: { kind: 'run_completes' } }],

  dueDate: daysFromNow(2),
  points: 10,
  published: true,
  starterId: 'reach-draft'
},
{
  id: 'asg-wave',
  courseId: 'rob-101',
  lessonId: 'motion-first-program',
  title: 'Wave hello',
  summary: 'Make the right arm raise and wave using a repeat loop.',
  instructions: [
  'Start from a blank program.',
  'Use the right arm, move it home, then raise it to a visible point.',
  'Use a repeat block to rotate the base joint back and forth at least three times.',
  'Return home at the end.'],

  objectives: ['Sequence movement blocks', 'Use a repeat loop'],
  criteria: [
  { id: 'c1', text: 'Program validates with no errors', check: { kind: 'no_errors' } },
  { id: 'c2', text: 'Uses a Repeat block', check: { kind: 'uses_op', op: 'repeat' } },
  { id: 'c3', text: 'Returns home', check: { kind: 'uses_op', op: 'move_home' } },
  { id: 'c4', text: 'Simulation runs to completion', check: { kind: 'run_completes' } }],

  dueDate: daysFromNow(5),
  points: 10,
  published: true,
  starterId: 'blank'
},
{
  id: 'asg-sort-red',
  courseId: 'rob-120',
  lessonId: 'pick-grasp',
  title: 'Sort the red cube',
  summary: 'Pick the red cube and place it in Bin A without dropping it.',
  instructions: [
  'Use the left arm; the red cube starts at (120, 150).',
  'Approach from above, descend slowly and close the gripper.',
  'Carry it to Bin A and lower it before opening.',
  'Return the arm home.'],

  objectives: ['Apply the approach–grasp–retreat pattern', 'Release at a safe height'],
  criteria: [
  { id: 'c1', text: 'Program validates with no errors', check: { kind: 'no_errors' } },
  { id: 'c2', text: 'Red cube ends in Bin A', check: { kind: 'object_in_zone', objectId: 'red', zone: 'A' } },
  { id: 'c3', text: 'Approach is slow and deliberate', check: { kind: 'manual' } }],

  dueDate: daysFromNow(4),
  points: 15,
  published: true,
  starterId: 'blank'
},
{
  id: 'asg-condition',
  courseId: 'rob-120',
  lessonId: 'pick-conditions',
  title: 'Grasp with a fallback',
  summary: 'Check whether the grasp worked and retry from a corrected position if it did not.',
  instructions: [
  'Attempt to grasp the red cube from a slightly offset position.',
  'Use if/else with "left gripper is holding an object".',
  'In the else branch, reopen, correct the position and grasp again.',
  'Place the cube in Bin A.'],

  objectives: ['Use if/else with a condition', 'Design a recovery path'],
  criteria: [
  { id: 'c1', text: 'Uses an If / Else block', check: { kind: 'uses_op', op: 'if' } },
  { id: 'c2', text: 'Red cube ends in Bin A', check: { kind: 'object_in_zone', objectId: 'red', zone: 'A' } },
  { id: 'c3', text: 'Recovery path is clearly structured', check: { kind: 'manual' } }],

  dueDate: daysFromNow(9),
  points: 20,
  published: true,
  starterId: 'blank'
},
{
  id: 'asg-handoff',
  courseId: 'rob-210',
  lessonId: 'dual-handoff',
  title: 'The handoff',
  summary: 'Use both arms to bring the blue cube into the handoff zone.',
  instructions: [
  'Open the handoff starter.',
  'Complete the sequence so the right arm places the blue cube in zone B.',
  'Use Move Both Arms and Wait for Both Arms to coordinate.'],

  objectives: ['Coordinate two arms with a synchronisation point'],
  criteria: [
  { id: 'c1', text: 'Uses Move Both Arms', check: { kind: 'uses_op', op: 'move_both' } },
  { id: 'c2', text: 'Uses Wait for Both Arms', check: { kind: 'uses_op', op: 'sync' } },
  { id: 'c3', text: 'Blue cube ends in Handoff B', check: { kind: 'object_in_zone', objectId: 'blue', zone: 'B' } }],

  dueDate: daysFromNow(12),
  points: 25,
  published: true,
  starterId: 'handoff-skeleton'
}];