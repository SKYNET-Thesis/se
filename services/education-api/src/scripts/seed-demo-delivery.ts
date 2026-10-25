import { PrismaClient } from "@prisma/client";
import { provisionDemoPhysicalPolicy } from "./demo-physical-policy";

const prisma = new PrismaClient();
const emails = { admin: "admin@vista.demo", instructor: "instructor@vista.demo", student: "student@vista.demo" };

async function user(email: string) {
  const row = await prisma.users.findFirst({ where: { email }, select: { id: true } });
  if (!row) throw new Error(`Missing ${email}; run seed:demo-identities first.`);
  return row.id;
}

async function main() {
  const [adminId, instructorId, studentId] = await Promise.all([user(emails.admin), user(emails.instructor), user(emails.student)]);
  const roles = await prisma.roles.findMany({ where: { code: { in: ["system_admin", "instructor", "student"] } }, select: { id: true, code: true } });
  const role = Object.fromEntries(roles.map((item) => [item.code, item.id]));
  if (!role.system_admin || !role.instructor || !role.student) throw new Error("Required demo roles are missing.");

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organizations.findFirst({ where: { name: "VISTA Academy", type: "institution" } })
      ?? await tx.organizations.create({ data: { name: "VISTA Academy", type: "institution", segment: "education", status: "active" } });
    await tx.user_system_roles.createMany({ data: [{ user_id: adminId, role_id: role.system_admin }], skipDuplicates: true });
    const instructorMembership = await tx.memberships.upsert({ where: { user_id_organization_id: { user_id: instructorId, organization_id: organization.id } }, update: { role_id: role.instructor, status: "active" }, create: { user_id: instructorId, organization_id: organization.id, role_id: role.instructor, status: "active" } });
    const studentMembership = await tx.memberships.upsert({ where: { user_id_organization_id: { user_id: studentId, organization_id: organization.id } }, update: { role_id: role.student, status: "active" }, create: { user_id: studentId, organization_id: organization.id, role_id: role.student, status: "active" } });
    const course = await tx.learning_courses.findFirst({ where: { organization_id: organization.id, title: "Robot Discovery" } })
      ?? await tx.learning_courses.create({ data: { organization_id: organization.id, title: "Robot Discovery", description: "VISTA demo robotics course", status: "published", created_by: adminId } });
    const offering = await tx.learning_course_offerings.upsert({ where: { organization_id_code: { organization_id: organization.id, code: "ROBOT-DISCOVERY-DEMO" } }, update: { status: "active" }, create: { organization_id: organization.id, course_id: course.id, code: "ROBOT-DISCOVERY-DEMO", title: "Robot Discovery", status: "active", created_by: adminId } });
    const classroom = await tx.learning_classrooms.upsert({ where: { organization_id_code: { organization_id: organization.id, code: "ROBOTICS-A" } }, update: { status: "active" }, create: { organization_id: organization.id, offering_id: offering.id, name: "Robotics Class A", code: "ROBOTICS-A", status: "active", created_by: adminId } });
    await tx.learning_classroom_members.upsert({ where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: instructorId } }, update: { membership_id: instructorMembership.id, classroom_role: "teacher", status: "active" }, create: { classroom_id: classroom.id, user_id: instructorId, membership_id: instructorMembership.id, classroom_role: "teacher", status: "active" } });
    await tx.learning_classroom_members.upsert({ where: { classroom_id_user_id: { classroom_id: classroom.id, user_id: studentId } }, update: { membership_id: studentMembership.id, classroom_role: "student", status: "active" }, create: { classroom_id: classroom.id, user_id: studentId, membership_id: studentMembership.id, classroom_role: "student", status: "active" } });
    const lesson = await tx.learning_lessons.upsert({ where: { course_id_ordinal: { course_id: course.id, ordinal: 1 } }, update: { title: "Open & Close Gripper", content: { summary: "Choose the left arm, open its gripper, wait one second, then close it." } }, create: { course_id: course.id, ordinal: 1, title: "Open & Close Gripper", content: { summary: "Choose the left arm, open its gripper, wait one second, then close it." } } });
    const challenge = await tx.learning_challenges.findFirst({ where: { organization_id: organization.id, title: "Gripper Sequence Challenge" } }) ?? await tx.learning_challenges.create({ data: { organization_id: organization.id, creator_user_id: adminId, title: "Gripper Sequence Challenge", description: "Open the left gripper, wait at least one second, then close it.", status: "published" } });
    await tx.learning_challenges.update({ where: { id: challenge.id }, data: { description: "Open the left gripper, wait at least one second, then close it.", status: "published" } });
    await tx.learning_challenge_conditions.deleteMany({ where: { challenge_id: challenge.id } });
    await tx.learning_challenge_conditions.createMany({ data: [
      { challenge_id: challenge.id, condition_type: "success", rule_key: "arm_selected", rule_config: { arm: "left" }, ordinal: 1 },
      { challenge_id: challenge.id, condition_type: "success", rule_key: "action_present", rule_config: { action: "gripper.open" }, ordinal: 2 },
      { challenge_id: challenge.id, condition_type: "success", rule_key: "ordered_actions", rule_config: { actions: ["gripper.open", "wait", "gripper.close"] }, ordinal: 3 },
      { challenge_id: challenge.id, condition_type: "success", rule_key: "symbolic_duration", rule_config: { comparator: "gte", durationMs: 1000 }, ordinal: 4 },
      { challenge_id: challenge.id, condition_type: "success", rule_key: "final_gripper_state", rule_config: { arm: "left", state: "closed" }, ordinal: 5 },
    ] });
    const assignment = await tx.learning_assignments.findFirst({ where: { lesson_id: lesson.id, title: "Gripper Sequence Challenge" } });
    const delivery = assignment
      ? await tx.learning_assignments.update({ where: { id: assignment.id }, data: { challenge_id: challenge.id, instructions: "Select the left arm. Open its gripper, wait at least one second, then close it." } })
      : await tx.learning_assignments.create({ data: { lesson_id: lesson.id, challenge_id: challenge.id, title: "Gripper Sequence Challenge", instructions: "Select the left arm. Open its gripper, wait at least one second, then close it." } });
    await tx.learning_classroom_assignments.upsert({ where: { classroom_id_assignment_id: { classroom_id: classroom.id, assignment_id: delivery.id } }, update: { status: "published", published_by: instructorId }, create: { classroom_id: classroom.id, assignment_id: delivery.id, status: "published", published_by: instructorId } });
    const baseSafetyProfile = await tx.safety_profiles.findUnique({
      where: { name: "student-sandbox" },
      select: { max_speed_pct: true, workspace_limit: true, max_session_minutes: true, require_estop_ack: true },
    });
    if (!baseSafetyProfile) throw new Error("Required student-sandbox safety profile is missing.");
    const physicalPolicy = await provisionDemoPhysicalPolicy(tx, {
      studentMembershipId: studentMembership.id,
      assignmentId: delivery.id,
      baseSafetyProfile,
    });
    const reachLesson = await tx.learning_lessons.upsert({ where: { course_id_ordinal: { course_id: course.id, ordinal: 2 } }, update: { title: "Reach a Target", content: { summary: "Learn X, Y, Z by matching Target A in the Learning Preview Coordinate Frame." } }, create: { course_id: course.id, ordinal: 2, title: "Reach a Target", content: { summary: "Learn X, Y, Z by matching Target A in the Learning Preview Coordinate Frame." } } });
    const reachChallenge = await tx.learning_challenges.findFirst({ where: { organization_id: organization.id, title: "Reach Target A" } }) ?? await tx.learning_challenges.create({ data: { organization_id: organization.id, creator_user_id: adminId, title: "Reach Target A", description: "Declare a left-arm learning preview position that matches Target A.", status: "published" } });
    const target = { x: 240, y: 220, z: 120 };
    await tx.learning_challenges.update({ where: { id: reachChallenge.id }, data: { description: "Declare a left-arm learning preview position that matches Target A.", status: "published" } });
    await tx.learning_challenge_objects.upsert({ where: { challenge_id_object_key: { challenge_id: reachChallenge.id, object_key: "target-a" } }, update: { object_type: "learning_preview_target", label: "Target A", target_pose: { frame: "learning_preview_v1", arm: "left", position: target }, metadata: { coordinateFrame: "learning_preview_v1" } }, create: { challenge_id: reachChallenge.id, object_key: "target-a", object_type: "learning_preview_target", label: "Target A", target_pose: { frame: "learning_preview_v1", arm: "left", position: target }, metadata: { coordinateFrame: "learning_preview_v1" } } });
    await tx.learning_challenge_conditions.deleteMany({ where: { challenge_id: reachChallenge.id } });
    await tx.learning_challenge_conditions.create({ data: { challenge_id: reachChallenge.id, condition_type: "success", rule_key: "preview_target_match", rule_config: { frame: "learning_preview_v1", arm: "left", position: target }, ordinal: 1 } });
    const reachAssignment = await tx.learning_assignments.findFirst({ where: { lesson_id: reachLesson.id, title: "Reach a Target" } });
    const reachDelivery = reachAssignment ? await tx.learning_assignments.update({ where: { id: reachAssignment.id }, data: { challenge_id: reachChallenge.id, instructions: "Select the left arm and set X, Y, Z to match Target A in the learning preview." } }) : await tx.learning_assignments.create({ data: { lesson_id: reachLesson.id, challenge_id: reachChallenge.id, title: "Reach a Target", instructions: "Select the left arm and set X, Y, Z to match Target A in the learning preview." } });
    await tx.learning_classroom_assignments.upsert({ where: { classroom_id_assignment_id: { classroom_id: classroom.id, assignment_id: reachDelivery.id } }, update: { status: "published", published_by: instructorId }, create: { classroom_id: classroom.id, assignment_id: reachDelivery.id, status: "published", published_by: instructorId } });
    const vrLesson = await tx.learning_lessons.upsert({ where: { course_id_ordinal: { course_id: course.id, ordinal: 3 } }, update: { title: "VR Robot Control", content: { summary: "Use immersive controls to understand how human hand and controller motion can command a robot arm." } }, create: { course_id: course.id, ordinal: 3, title: "VR Robot Control", content: { summary: "Use immersive controls to understand how human hand and controller motion can command a robot arm." } } });
    const vrChallenge = await tx.learning_challenges.findFirst({ where: { organization_id: organization.id, title: "VR Teleoperation Demo" } }) ?? await tx.learning_challenges.create({ data: { organization_id: organization.id, creator_user_id: adminId, title: "VR Teleoperation Demo", description: "Start an offline/fake-follower VR learning session and reflect on safe control.", status: "published" } });
    const vrAssignment = await tx.learning_assignments.findFirst({ where: { lesson_id: vrLesson.id, title: "VR Robot Control" } });
    const vrDelivery = vrAssignment ? await tx.learning_assignments.update({ where: { id: vrAssignment.id }, data: { challenge_id: vrChallenge.id, instructions: "Learn the safety controls, open the offline VR experience, observe the fake follower, then reflect." } }) : await tx.learning_assignments.create({ data: { lesson_id: vrLesson.id, challenge_id: vrChallenge.id, title: "VR Robot Control", instructions: "Learn the safety controls, open the offline VR experience, observe the fake follower, then reflect." } });
    await tx.learning_classroom_assignments.upsert({ where: { classroom_id_assignment_id: { classroom_id: classroom.id, assignment_id: vrDelivery.id } }, update: { status: "published", published_by: instructorId }, create: { classroom_id: classroom.id, assignment_id: vrDelivery.id, status: "published", published_by: instructorId } });
    const demoLesson = await tx.learning_lessons.upsert({ where: { course_id_ordinal: { course_id: course.id, ordinal: 4 } }, update: { title: "Teach by Demonstration", content: { summary: "Record one observation and action episode from the offline LeKiwi learning session." } }, create: { course_id: course.id, ordinal: 4, title: "Teach by Demonstration", content: { summary: "Record one observation and action episode from the offline LeKiwi learning session." } } });
    await tx.benchmark_tasks.upsert({where:{code:"C3_DEMONSTRATION"},update:{active:true},create:{code:"C3_DEMONSTRATION",name:"C3 Demonstration Episode",object_type:"robot_state",target_container:"none",pass_criterion:"artifact_finalized",instruction_template:"Record one observation/action demonstration."}});
    const demoChallenge = await tx.learning_challenges.findFirst({ where: { organization_id: organization.id, title: "Record One Demonstration Episode" } }) ?? await tx.learning_challenges.create({ data: { organization_id: organization.id, creator_user_id: adminId, title: "Record One Demonstration Episode", description: "Record observation and post-safety action while teleoperating the fake follower.", status: "published" } });
    const demoAssignment = await tx.learning_assignments.findFirst({ where: { lesson_id: demoLesson.id, title: "Teach by Demonstration" } });
    const demoDelivery = demoAssignment ? await tx.learning_assignments.update({ where: { id: demoAssignment.id }, data: { challenge_id: demoChallenge.id, instructions: "Prepare the offline VR session, record one demonstration episode, review observation versus action, then reflect." } }) : await tx.learning_assignments.create({ data: { lesson_id: demoLesson.id, challenge_id: demoChallenge.id, title: "Teach by Demonstration", instructions: "Prepare the offline VR session, record one demonstration episode, review observation versus action, then reflect." } });
    await tx.learning_classroom_assignments.upsert({ where: { classroom_id_assignment_id: { classroom_id: classroom.id, assignment_id: demoDelivery.id } }, update: { status: "published", published_by: instructorId }, create: { classroom_id: classroom.id, assignment_id: demoDelivery.id, status: "published", published_by: instructorId } });
    return { organization, classroom, physicalPolicy };
  }, { timeout: 15000 });
  console.log(`VISTA Academy: ${result.organization.id}`); console.log(`Robotics Class A: ${result.classroom.id}`);
  console.log(`Blockly Control Mode: ${result.physicalPolicy.controlModeId}`);
  console.log(`Student Blockly Safety Profile: ${result.physicalPolicy.safetyProfileId}`);
  console.log(`Gripper rubric criterion: ${result.physicalPolicy.rubricCriterionId}`);
}
void main().finally(() => prisma.$disconnect());
