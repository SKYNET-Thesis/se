import type { Course } from '../types/learning';

/** DEMO CONTENT — authored for the VISTA prototype; no course backend is connected. */
export const demoCourses: Course[] = [
{
  id: 'rob-101',
  code: 'ROB 101',
  title: 'Foundations of Robot Motion',
  summary: 'Coordinates, joints, and reach: how a robot arm turns a target point into motion on the tabletop.',
  level: 'Introductory',
  image: "/0afeddbc-ceca-4316-bdb8-c4034c57dc33.jpg",
  imageAlt: 'Close-up of a white robot arm joint',
  instructor: 'Daniel Reyes',
  published: true,
  lessons: [
  {
    id: 'motion-frames',
    title: 'Coordinate frames on the tabletop',
    minutes: 15,
    summary: 'Every target the robot moves to is a point in a shared coordinate frame.',
    objectives: [
    'Describe the X, Y and Z axes of the VISTA table frame',
    'Read a target such as (120, 150, 20) and locate it on the table',
    'Explain why all coordinates use millimetres'],

    sections: [
    {
      kind: 'text',
      heading: 'One frame for everything',
      body: 'The VISTA table is 600 mm wide and 400 mm deep. Its origin (0, 0, 0) is the front-left corner of the table surface. X grows to the right, Y grows away from you, and Z grows upward from the table. Both arms, every object and every zone are described in this same frame, which is what lets two arms cooperate.'
    },
    {
      kind: 'terms',
      heading: 'Key terms',
      items: [
      { term: 'Frame', definition: 'A fixed origin plus three perpendicular axes used to describe positions.' },
      { term: 'Target', definition: 'The (x, y, z) point the gripper centre should move to.' },
      { term: 'Clearance', definition: 'Height kept above the table to avoid scraping it. VISTA requires z ≥ 10 mm.' }]

    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Try it',
      body: 'In the Studio simulation, hover over the table grid. The faint lines are spaced every 100 mm.'
    }]

  },
  {
    id: 'motion-reach',
    title: 'Joints, links and reach',
    minutes: 20,
    summary: 'Why some points are reachable and others are not.',
    objectives: [
    'Name the base, shoulder, elbow and wrist joints',
    'Explain how link length limits the reachable workspace',
    'Predict whether a target is reachable for the left or right arm'],

    sections: [
    {
      kind: 'text',
      heading: 'From joints to a point',
      body: 'Each VISTA arm has a rotating base, a shoulder and an elbow that move a 220 mm upper link and a 200 mm forearm. The wrist only rotates the gripper. Together the links can stretch at most 420 mm from the shoulder, so every arm has a reachable region shaped roughly like a dome. Points outside that dome cannot be reached however the joints are set.'
    },
    {
      kind: 'steps',
      heading: 'Checking a target by hand',
      items: [
      'Find the arm base: left is at (150, −30), right is at (450, −30).',
      'Measure the horizontal distance from the base to the target.',
      'Combine it with the height difference from the 120 mm shoulder.',
      'If the result is more than 420 mm, the target is out of reach.']

    },
    {
      kind: 'callout',
      tone: 'safety',
      title: 'On real hardware',
      body: 'Real robots enforce joint limits, speed limits and emergency stops in their controller. The Studio checks reach to help you learn, but it is not a safety system.'
    }]

  },
  {
    id: 'motion-first-program',
    title: 'Your first program: home and back',
    minutes: 25,
    summary: 'Build a short Blockly program and watch it run in the simulator.',
    objectives: [
    'Start a program with the "when program starts" block',
    'Select an arm with "use … arm"',
    'Combine Move Home and Move Arm to Position into a sequence'],

    sections: [
    {
      kind: 'text',
      heading: 'Programs are sequences',
      body: 'A robot program is a list of instructions that runs top to bottom. In VISTA every program begins with "when program starts". Movement and gripper blocks must sit inside a "use left arm" or "use right arm" block, so the robot always knows which arm you mean.'
    },
    {
      kind: 'steps',
      heading: 'Build it',
      items: [
      'Open the Studio and create a blank program.',
      'Add "use right arm" under the start block.',
      'Inside it, add "move selected arm home", then "move to x 450 y 260 z 220".',
      'Press Validate, then Run simulation.']

    }]

  }]

},
{
  id: 'rob-120',
  code: 'ROB 120',
  title: 'Pick and Place',
  summary: 'Approach, grasp, lift and place: the core manipulation pattern behind most industrial robot tasks.',
  level: 'Intermediate',
  image: "/c8fac07b-a6e9-4efb-a8be-833b4d842685.jpg",
  imageAlt: 'Robot gripper picking up a red cube',
  instructor: 'Daniel Reyes',
  published: true,
  lessons: [
  {
    id: 'pick-grasp',
    title: 'Approach, grasp, retreat',
    minutes: 25,
    summary: 'A safe grasp is three moves, not one.',
    objectives: [
    'Plan an approach point above an object',
    'Descend slowly and close the gripper',
    'Retreat vertically before moving sideways'],

    sections: [
    {
      kind: 'text',
      heading: 'Why approach from above',
      body: 'Moving straight to an object risks sweeping through it. Instead, move to a point about 100 mm directly above the object, descend at low speed, close the gripper, then lift back up. In the VISTA simulator a grasp succeeds when the gripper is within 30 mm of the object and below 50 mm.'
    },
    {
      kind: 'steps',
      heading: 'The pattern',
      items: ['Open the gripper.', 'Move above the object (z ≈ 120).', 'Descend to z ≈ 20 at 30% speed.', 'Close the gripper.', 'Lift to z ≈ 150.']
    }]

  },
  {
    id: 'pick-place',
    title: 'Placing with precision',
    minutes: 20,
    summary: 'Lower before you let go.',
    objectives: ['Move a held object to a target zone', 'Lower the object before releasing', 'Return the arm home after placing'],
    sections: [
    {
      kind: 'text',
      heading: 'Release height matters',
      body: 'If you open the gripper high above a zone, the object drops. The simulator reports a drop when you release above 70 mm. Lower to around 30 mm, open, then retreat upward.'
    }]

  },
  {
    id: 'pick-conditions',
    title: 'Making decisions with conditions',
    minutes: 30,
    summary: 'Use if/else to react to what actually happened.',
    objectives: ['Use the if/else block with a condition', 'Check whether a gripper is holding an object', 'Design a retry path when a grasp fails'],
    sections: [
    {
      kind: 'text',
      heading: 'Checking the result',
      body: 'After closing the gripper you can ask "is the left gripper holding an object?" If not, the grasp missed and the program can try a different approach. In this course the condition reads the simulated state; on real hardware it would require a gripper sensor.'
    }]

  }]

},
{
  id: 'rob-210',
  code: 'ROB 210',
  title: 'Dual-Arm Coordination',
  summary: 'Share a workspace safely, move two arms at once, and hand objects from one gripper to the other.',
  level: 'Advanced',
  image: "/52253a78-7746-4435-adf7-172a94a13ce1.jpg",
  imageAlt: 'Two robot arms handing a blue cube between grippers',
  instructor: 'Daniel Reyes',
  published: true,
  lessons: [
  {
    id: 'dual-workspace',
    title: 'Two arms, one workspace',
    minutes: 20,
    summary: 'Overlapping reach is both an opportunity and a hazard.',
    objectives: ['Identify the region both arms can reach', 'Explain why shared regions need coordination'],
    sections: [
    {
      kind: 'text',
      heading: 'The overlap',
      body: 'The left arm covers the left and centre of the table; the right arm covers the right and centre. Zone B, the handoff area, sits where both can reach. Anything that happens there must be coordinated.'
    }]

  },
  {
    id: 'dual-sync',
    title: 'Synchronising motion',
    minutes: 25,
    summary: 'Move both arms at once, then wait for both to finish.',
    objectives: ['Use Move Both Arms to start simultaneous motion', 'Use Wait for Both Arms as a synchronisation point'],
    sections: [
    {
      kind: 'text',
      heading: 'Non-blocking motion',
      body: '"Move both arms" starts both motions and lets the program continue immediately. Use "wait for both arms" before any step that depends on both arms having arrived. Without it, the next block may start while an arm is still moving.'
    }]

  },
  {
    id: 'dual-handoff',
    title: 'The handoff',
    minutes: 35,
    summary: 'Pass an object from one gripper to the other.',
    objectives: ['Sequence a pick, meet, transfer and place across two arms', 'Release only after the receiving gripper has closed'],
    sections: [
    {
      kind: 'steps',
      heading: 'Handoff sequence',
      items: [
      'Right arm picks the blue cube.',
      'Both arms move to the handoff zone and wait for each other.',
      'Right arm places the cube in zone B and retreats.',
      'Left arm picks it from zone B and moves it on.']

    }]

  }]

}];