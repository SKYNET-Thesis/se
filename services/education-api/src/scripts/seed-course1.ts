import { Prisma, PrismaClient } from "@prisma/client";
import { SYMBOLIC_ACTIONS, SymbolicRuleCompilerService } from "../modules/learning/symbolic-rules/symbolic-rule-compiler.service";

type JsonObject = Record<string, unknown>;
type Condition = { ruleKey: string; ruleConfig: JsonObject; description: string };
type CourseBlueprint = typeof COURSE_1_BLUEPRINT;

const knowledgeQuestions = [
  { id: "q1", prompt: "Which robot component connects links and allows rotational motion?", options: ["joint", "linkage", "chassis"] },
  { id: "q2", prompt: "What is the primary role of the camera in the workspace?", options: ["visual_inspection", "power_supply", "joint_braking"] },
  { id: "q3", prompt: "Before commanding the gripper to grasp, what workspace condition must be confirmed?", options: ["clear_workspace", "blind_approach", "maximum_speed"] },
  { id: "q4", prompt: "Which command returns all robot arm joints to a known safe configuration?", options: ["home", "emergency_power", "open_gripper"] },
  { id: "q5", prompt: "What is the required immediate safety response to unexpected motion in the workspace?", options: ["stop", "continue", "ignore"] },
];

export const COURSE_1_BLUEPRINT = {
  title: "Robotics Fundamentals",
  description: "Course 1: a five-lesson path from robot safety and Blockly fundamentals to an authorized physical experiment.",
  competencies: [
    { code: "C1.SAFETY.AWARENESS", title: "Robot safety awareness", description: "Applies safe preparation and stop behavior.", domain: "robotics" },
    { code: "C1.MOTION.SEQUENCE", title: "Motion sequencing", description: "Builds deterministic robot motion programs.", domain: "robotics" },
    { code: "C1.MANIPULATION.GRIPPER", title: "Gripper manipulation", description: "Controls grasp and release sequences.", domain: "robotics" },
    { code: "C1.MANIPULATION.PICK_PLACE", title: "Pick and place", description: "Builds a complete pick-and-place sequence.", domain: "robotics" },
    { code: "C1.RUNTIME.SAFETY", title: "Physical runtime safety", description: "Uses persisted evidence before physical execution.", domain: "scientific_practice" },
  ],
  lessons: [
    {
      ordinal: 1, title: "Meet Your Robot", prerequisiteOrdinal: null,
      content: {
        version: 1,
        summary: "Identify safe robot-lab behavior, components, joints, gripper, camera, workspace bounds, and essential commands.",
        learningObjectives: [
          "Identify the main structural components of the robot arm and joints.",
          "Understand the role of visual workspace inspection and camera view.",
          "Know the home command and required safety response to unexpected motion.",
        ],
        conceptSections: [
          {
            title: "Robot Arm Anatomy & Joints",
            content: "A robotic arm consists of rigid links connected by motorized joints that provide rotational degrees of freedom, ending in a specialized tool called an end-effector (gripper).",
          },
          {
            title: "Workspace & Camera View",
            content: "Before commanding any robot movement, the workspace must be inspected via camera to confirm no obstacles or humans are within the robot's reachable envelope.",
          },
          {
            title: "Home Position & Emergency Stop",
            content: "The home command returns all joints to a known safe configuration. If any unexpected motion occurs, you must immediately trigger a stop.",
          },
        ],
        robotConcept: "The robot operates inside a defined 3D workspace. Motors and joints execute commands sequentially, but physical robots have no awareness of obstacles unless sensors and cameras are checked beforehand.",
        taskPreview: "Complete the safety knowledge check to verify your readiness before beginning robot motion programming.",
        estimatedMinutes: 15,
        safetyNotes: [
          "Always ensure the robot workspace is clear of obstacles before starting motion.",
          "Never place hands within reach of the robot while a program is running.",
          "Identify the emergency stop location before operating any robotic equipment.",
        ],
        completionCriteria: "Pass the safety knowledge check with a score of at least 80%.",
        objective: "Identify safe robot-lab behavior, components, joints, gripper, camera, workspace bounds, and essential commands.",
        media: [],
        lessonType: "knowledge_check",
      },
      objective: { code: "C1-L1", description: "Identify robot components, joints, gripper, camera, workspace bounds, and safety procedures.", competencyCode: "C1.SAFETY.AWARENESS" },
      challenge: { title: "Safety Knowledge Check", description: "Demonstrate the safety knowledge required before programming.", successCriteria: { kind: "knowledge_check", passPercent: 80, answerKey: { q1: "joint", q2: "visual_inspection", q3: "clear_workspace", q4: "home", q5: "stop" } }, conditions: [] as Condition[] },
      assignment: { title: "Safety Knowledge Check", instructions: "Answer every question. The server calculates the result.", allowedBlocks: [], constraints: { kind: "knowledge_check", questions: knowledgeQuestions } },
    },
    {
      ordinal: 2, title: "Move the Robot", prerequisiteOrdinal: 1,
      content: {
        version: 1,
        summary: "Learn deterministic motion sequencing by homing the robot and commanding it to reach a defined target position.",
        learningObjectives: [
          "Use home, target motion, wait, and sequence blocks in order.",
          "Understand how the robot plans motion to reach a 3D target position.",
          "Observe preview simulation to verify the robot trajectory before execution.",
        ],
        conceptSections: [
          {
            title: "Deterministic Sequencing",
            content: "Robots execute instructions one step at a time in sequence. The home command ensures the robot starts from an exact, known position.",
          },
          {
            title: "Target Positioning",
            content: "Instead of manual joint angles, modern robotics specifies target positions in 3D workspace coordinates. The system calculates the motion required to reach the target.",
          },
          {
            title: "Pauses & Motion Timing",
            content: "Adding wait commands allows mechanical vibrations to settle and lets the system stabilize between rapid maneuvers.",
          },
        ],
        robotConcept: "The robot computes the required arm pose to place the gripper at the commanded 3D coordinates. Sequencing home -> move to target -> wait creates safe, reproducible movement.",
        taskPreview: "Program the left arm to home, move to Target A, and wait for motion stabilization.",
        estimatedMinutes: 20,
        safetyNotes: [
          "Confirm the target coordinates are within the safe reachable envelope.",
          "Always include a home step at the start of a program to reset joint state.",
        ],
        completionCriteria: "Complete the target-position simulation successfully with all required actions in order.",
        objective: "Move the robot to a target pose with a deterministic sequence.",
        media: [],
        lessonType: "symbolic",
      },
      objective: { code: "C1-L2", description: "Use home, target motion, wait, and sequence correctly.", competencyCode: "C1.MOTION.SEQUENCE" },
      challenge: { title: "Reach Target A", description: "Home the left arm and move it to Target A.", successCriteria: { kind: "symbolic_rules" }, conditions: [{ ruleKey: "ordered_actions", ruleConfig: { actions: ["home", "preview.move_xyz", "wait"] }, description: "Motion actions appear in order." }, { ruleKey: "preview_target_match", ruleConfig: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } }, description: "The preview target matches Target A." }] },
      assignment: { title: "Reach Target A", instructions: "Build and submit the target-pose sequence.", allowedBlocks: ["arm.select", "home", "preview.move_xyz", "wait"], constraints: { kind: "symbolic_program", target: { frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } } } },
    },
    {
      ordinal: 3, title: "Grab & Release", prerequisiteOrdinal: 2,
      content: {
        version: 1,
        summary: "Master gripper manipulation by coordinating approach, grasp, lift, and release actions.",
        learningObjectives: [
          "Control gripper opening and closing at precise points in a motion sequence.",
          "Understand why approaching an object must precede closing the gripper.",
          "Execute a safe lift and release cycle without collision.",
        ],
        conceptSections: [
          {
            title: "The Grasping Sequence",
            content: "Closing the gripper does not automatically mean an object is grasped. The robot must first approach the object to align the fingers before gripping.",
          },
          {
            title: "Gripper States",
            content: "The gripper has distinct open and closed states. Gripper commands must be synchronized with arm positioning to ensure the object is securely held.",
          },
          {
            title: "Safe Release",
            content: "After lifting, releasing an object requires moving to a designated drop position and commanding gripper open, ensuring the arm finishes in an open state.",
          },
        ],
        robotConcept: "Gripping requires precise spatial alignment. If the gripper closes prematurely while moving, it risks knocking the object away or damaging mechanical linkages.",
        taskPreview: "Program the left arm to approach the object, close the gripper, lift the object, and finish with the gripper open.",
        estimatedMinutes: 25,
        safetyNotes: [
          "Never close the gripper while moving at high speeds toward an object.",
          "Verify that the final gripper state is open so the robot is ready for the next task.",
        ],
        completionCriteria: "Successfully grasp, lift, and release the required object with the gripper finishing open.",
        objective: "Control a gripper with an observable sequence.",
        media: [],
        lessonType: "symbolic",
      },
      objective: { code: "C1-L3", description: "Approach, grasp, lift, and release an object deterministically.", competencyCode: "C1.MANIPULATION.GRIPPER" },
      challenge: { title: "Grab and Release an Object", description: "Approach, close the left gripper, lift, then release.", successCriteria: { kind: "symbolic_rules" }, conditions: [{ ruleKey: "ordered_actions", ruleConfig: { actions: ["preview.move_xyz", "gripper.close", "preview.move_xyz", "gripper.open"] }, description: "Manipulation actions appear in order." }, { ruleKey: "final_gripper_state", ruleConfig: { arm: "left", state: "open" }, description: "The gripper finishes open." }] },
      assignment: { title: "Grab and Release an Object", instructions: "Build and submit the required manipulation sequence.", allowedBlocks: ["arm.select", "preview.move_xyz", "gripper.open", "wait", "gripper.close"], constraints: { kind: "symbolic_program" } },
    },
    {
      ordinal: 4, title: "Pick & Place", prerequisiteOrdinal: 3,
      content: {
        version: 1,
        summary: "Synthesize movement and manipulation into a complete, verified pick-and-place sequence that qualifies for physical execution.",
        learningObjectives: [
          "Build an end-to-end pick-and-place workflow: Approach -> Grasp -> Lift -> Transfer -> Release -> Home.",
          "Interpret deterministic simulation feedback to verify object placement in the target zone.",
          "Produce an immutable qualified ProgramVersion required for the physical robot lab.",
        ],
        conceptSections: [
          {
            title: "End-to-End Pick & Place",
            content: "Pick-and-place is the foundational task of industrial robotics: picking an item from an initial pickup zone and accurately placing it in a target destination.",
          },
          {
            title: "Waypoints & Obstacle Clearance",
            content: "A direct straight-line move between pick and place locations can cause collisions. Moving to a clearance height after grasping ensures the object clears the surface.",
          },
          {
            title: "Authoritative Evidence Qualification",
            content: "Successful completion in deterministic simulation produces a verified program version that serves as the prerequisite proof for physical lab operation.",
          },
        ],
        robotConcept: "The robot must lift the object sufficiently high before translating horizontally toward the target zone, then lower and release it, and finally return home to clear the workspace.",
        taskPreview: "Program the robot to pick up the object, transfer it to the target zone, release it, and return to home.",
        estimatedMinutes: 30,
        safetyNotes: [
          "Ensure sufficient lift height so the carried object does not scrape the table surface.",
          "End the sequence with a home command to leave the robot in a safe neutral state.",
        ],
        completionCriteria: "Release the required object inside the target zone according to the deterministic task simulator.",
        objective: "Produce immutable qualifying simulation evidence.",
        media: [],
        lessonType: "symbolic",
      },
      objective: { code: "C1-L4", description: "Complete pick-and-place and interpret authoritative feedback.", competencyCode: "C1.MANIPULATION.PICK_PLACE" },
      challenge: { title: "Pick and Place to Target Zone", description: "Pick up the object and release it at the target zone.", successCriteria: { kind: "symbolic_rules" }, conditions: [{ ruleKey: "ordered_actions", ruleConfig: { actions: ["home", "preview.move_xyz", "gripper.close", "preview.move_xyz", "gripper.open", "home"] }, description: "The complete pick-and-place sequence appears in order." }, { ruleKey: "home_action_present", ruleConfig: { arm: "left" }, description: "A symbolic left-arm home action is present." }] },
      assignment: { title: "Pick and Place to Target Zone", instructions: "Submit the exact program version that must qualify for physical execution.", allowedBlocks: ["arm.select", "home", "preview.move_xyz", "gripper.open", "wait", "gripper.close"], constraints: { kind: "symbolic_program", unlocksPhysicalLesson: true } },
    },
    {
      ordinal: 5, title: "Physical Robot Lab", prerequisiteOrdinal: 4,
      content: {
        version: 1,
        summary: "Execute your qualified Pick & Place program on the physical robot under strict safety protocols and review persisted execution evidence.",
        learningObjectives: [
          "Understand why simulated validation is mandatory before running on physical hardware.",
          "Inspect robot readiness, physical workspace clearance, and emergency stop awareness.",
          "Execute the exact qualified ProgramVersion from C1-L4 on the physical robot.",
          "Analyze physical experiment telemetry and verify real-world task completion.",
        ],
        conceptSections: [
          {
            title: "Simulation to Reality (Sim-to-Real)",
            content: "In physical robotics, you do not write new untested code on hardware. You execute the exact immutable program version that passed simulated validation in C1-L4.",
          },
          {
            title: "Pre-Flight Safety Protocols",
            content: "Before authorizing execution: verify power, ensure the physical workspace is clear of bystanders, and keep your hand ready near the software/hardware emergency stop.",
          },
          {
            title: "Telemetry & Execution Evidence",
            content: "During physical execution, joint states and telemetry are recorded to produce a permanent experiment artifact confirming safe, successful completion.",
          },
        ],
        robotConcept: "Physical robots have mass, inertia, and real-world friction. Pre-validated programs ensure that physical motion matches simulated trajectories without damaging hardware or surroundings.",
        taskPreview: "Authorize and monitor the physical robot execution using your validated Pick & Place program from C1-L4.",
        estimatedMinutes: 20,
        safetyNotes: [
          "E-Stop Awareness: Maintain visual focus on the robot arm throughout the run.",
          "Do not enter the safety envelope until the physical run status is reported as complete.",
        ],
        completionCriteria: "Complete the physical robot experiment successfully with validated telemetry evidence.",
        objective: "Run the qualified immutable program under physical safety controls.",
        media: [],
        lessonType: "physical",
      },
      objective: { code: "C1-L5", description: "Execute and review an authorized physical experiment safely.", competencyCode: "C1.RUNTIME.SAFETY" },
      challenge: { title: "Run the Qualified Program", description: "Use the exact L4-qualified ProgramVersion; runtime eligibility is always rechecked.", successCriteria: { kind: "physical_evidence", implementationPhase: "P0.9" }, conditions: [] as Condition[] },
      assignment: { title: "Run the Qualified Program", instructions: "Physical completion is based on future persisted experiment evidence, never this seed.", allowedBlocks: [], constraints: { kind: "physical_lab", completionAuthority: "future_physical_evidence", requiresPriorSymbolicPass: true } },
    },
  ],
} as const;

export function validateCourse1Blueprint(blueprint: CourseBlueprint): void {
  if (blueprint.lessons.length !== 5) throw new Error("Course 1 must contain exactly five lessons.");
  const compiler = new SymbolicRuleCompilerService();
  const codes = new Set<string>();
  blueprint.competencies.forEach((item) => { if (codes.has(item.code)) throw new Error(`Duplicate competency code ${item.code}.`); codes.add(item.code); });
  blueprint.lessons.forEach((lesson, index) => {
    if (lesson.ordinal !== index + 1 || lesson.prerequisiteOrdinal !== (index === 0 ? null : index)) throw new Error("Course 1 prerequisite chain must be linear and ordered.");
    const invalidBlock = lesson.assignment.allowedBlocks.find((block) => !(SYMBOLIC_ACTIONS as readonly string[]).includes(block));
    if (invalidBlock) throw new Error(`Unsupported allowed block ${invalidBlock}.`);
    if (lesson.challenge.conditions.length) compiler.compile(lesson.challenge.conditions.map((condition, ordinal) => ({ id: `${lesson.ordinal}-${ordinal + 1}`, ordinal: ordinal + 1, rule_key: condition.ruleKey, rule_config: condition.ruleConfig })));
  });
}

export async function syncChallengeConditions(tx: Pick<Prisma.TransactionClient, "learning_challenge_conditions">, challengeId: string, conditions: readonly Condition[]): Promise<void> {
  const existing = await tx.learning_challenge_conditions.findMany({ where: { challenge_id: challengeId }, select: { id: true, ordinal: true } });
  const byOrdinal = new Map(existing.map((row) => [row.ordinal, row.id]));
  for (const [index, condition] of conditions.entries()) {
    const ordinal = index + 1;
    const data = { condition_type: "success", rule_key: condition.ruleKey, rule_config: JSON.parse(JSON.stringify(condition.ruleConfig)) as Prisma.InputJsonValue, description: condition.description, ordinal };
    const id = byOrdinal.get(ordinal);
    if (id) await tx.learning_challenge_conditions.update({ where: { id }, data });
    else await tx.learning_challenge_conditions.create({ data: { challenge_id: challengeId, ...data } });
  }
}

export async function seedCourse1(prisma: PrismaClient, organizationId: string, createdByUserId: string) {
  validateCourse1Blueprint(COURSE_1_BLUEPRINT);
  const [organization, creator] = await Promise.all([
    prisma.organizations.findUnique({ where: { id: organizationId }, select: { id: true } }),
    prisma.users.findUnique({ where: { id: createdByUserId }, select: { id: true } }),
  ]);
  if (!organization) throw new Error(`COURSE1_ORGANIZATION_ID does not identify an organization: ${organizationId}`);
  if (!creator) throw new Error(`COURSE1_CREATED_BY_USER_ID does not identify a user: ${createdByUserId}`);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.learning_courses.findFirst({ where: { organization_id: organizationId, title: COURSE_1_BLUEPRINT.title } });
    const course = existing
      ? await tx.learning_courses.update({ where: { id: existing.id }, data: { description: COURSE_1_BLUEPRINT.description, status: "published" } })
      : await tx.learning_courses.create({ data: { organization_id: organizationId, created_by: createdByUserId, title: COURSE_1_BLUEPRINT.title, description: COURSE_1_BLUEPRINT.description, status: "published" } });

    const competencies = new Map<string, string>();
    for (const item of COURSE_1_BLUEPRINT.competencies) {
      const competency = await tx.learning_competencies.upsert({ where: { code: item.code }, update: { title: item.title, description: item.description, domain: item.domain }, create: { ...item } });
      competencies.set(item.code, competency.id);
    }

    const lessons = new Map<number, string>();
    for (const item of COURSE_1_BLUEPRINT.lessons) {
      const lesson = await tx.learning_lessons.upsert({ where: { course_id_ordinal: { course_id: course.id, ordinal: item.ordinal } }, update: { title: item.title, content: item.content }, create: { course_id: course.id, ordinal: item.ordinal, title: item.title, content: item.content } });
      lessons.set(item.ordinal, lesson.id);
      const objective = await tx.learning_objectives.upsert({ where: { lesson_id_code: { lesson_id: lesson.id, code: item.objective.code } }, update: { description: item.objective.description, ordinal: 1 }, create: { lesson_id: lesson.id, code: item.objective.code, description: item.objective.description, ordinal: 1 } });
      await tx.learning_objective_competencies.upsert({ where: { objective_id_competency_id: { objective_id: objective.id, competency_id: competencies.get(item.objective.competencyCode)! } }, update: { weight: 1 }, create: { objective_id: objective.id, competency_id: competencies.get(item.objective.competencyCode)!, weight: 1 } });

      const foundAssignment = await tx.learning_assignments.findFirst({ where: { lesson_id: lesson.id, title: item.assignment.title }, include: { learning_challenges: true } });
      const foundChallenge = foundAssignment?.learning_challenges ?? null;
      const challengeData = { description: item.challenge.description, success_criteria: item.challenge.successCriteria, permitted_modes: ["blockly"], status: "published" };
      const challenge = foundChallenge ? await tx.learning_challenges.update({ where: { id: foundChallenge.id }, data: challengeData }) : await tx.learning_challenges.create({ data: { organization_id: organizationId, creator_user_id: createdByUserId, title: item.challenge.title, ...challengeData } });
      await syncChallengeConditions(tx, challenge.id, item.challenge.conditions);

      const assignmentData = { challenge_id: challenge.id, instructions: item.assignment.instructions, allowed_blocks: [...item.assignment.allowedBlocks], constraints: item.assignment.constraints };
      if (foundAssignment) await tx.learning_assignments.update({ where: { id: foundAssignment.id }, data: assignmentData });
      else await tx.learning_assignments.create({ data: { lesson_id: lesson.id, title: item.assignment.title, ...assignmentData } });
    }

    for (const item of COURSE_1_BLUEPRINT.lessons) if (item.prerequisiteOrdinal !== null) {
      await tx.learning_lesson_prerequisites.upsert({ where: { lesson_id_prerequisite_lesson_id: { lesson_id: lessons.get(item.ordinal)!, prerequisite_lesson_id: lessons.get(item.prerequisiteOrdinal)! } }, update: { required: true, minimum_score: null }, create: { lesson_id: lessons.get(item.ordinal)!, prerequisite_lesson_id: lessons.get(item.prerequisiteOrdinal)!, required: true } });
    }
    return { courseId: course.id, lessonCount: lessons.size };
  });
}

async function main(): Promise<void> {
  const organizationId = process.env.COURSE1_ORGANIZATION_ID;
  const createdByUserId = process.env.COURSE1_CREATED_BY_USER_ID;
  if (!organizationId || !createdByUserId) throw new Error("Set COURSE1_ORGANIZATION_ID and COURSE1_CREATED_BY_USER_ID before running seed:course1.");
  const prisma = new PrismaClient();
  try {
    const result = await seedCourse1(prisma, organizationId, createdByUserId);
    console.log(`Course 1 seeded: ${result.courseId} (${result.lessonCount} lessons).`);
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) void main();
