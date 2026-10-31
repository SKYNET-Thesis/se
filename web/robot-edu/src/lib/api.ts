/** NestJS is the only application-data boundary for the browser. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1").replace(/\/$/, "");

export async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Cache-Control": "no-store" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? `API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export interface ApiCourse { id: string; title: string; description: string | null; status: string; }
export interface ApiCollection<T> { items: T[]; page: number; pageSize: number; total?: number; }

export type LessonProgressStatus = "completed" | "current" | "available" | "locked" | "in_progress";

export interface LessonLockReason {
  code: "PREREQUISITE_NOT_COMPLETED" | "PREREQUISITE_MINIMUM_SCORE_NOT_MET";
  prerequisiteLessonId: string;
  prerequisiteLessonTitle: string;
  message: string;
}

export interface LessonPrerequisite {
  lessonId: string;
  title: string;
  required: boolean;
  minimumScore: number | null;
}

export interface CoursePathLesson {
  id: string;
  ordinal: number;
  title: string;
  status: LessonProgressStatus;
  progressPercent: number;
  prerequisite: LessonPrerequisite[];
  lockReason: LessonLockReason | null;
  completedAt: string | null;
}

export interface CoursePathResponse {
  course: { id: string; title: string; status: string };
  progressPercent: number;
  currentLessonId: string | null;
  lessons: CoursePathLesson[];
}

export interface LessonObjective {
  code: string;
  description: string;
  competencyCode?: string | null;
  competencyTitle?: string | null;
}

export interface LessonConceptSection {
  title: string;
  content: string;
}

export interface LessonContent {
  version: number;
  summary: string;
  learningObjectives: string[];
  conceptSections: LessonConceptSection[];
  robotConcept: string;
  taskPreview: string;
  estimatedMinutes?: number;
  safetyNotes: string[];
  completionCriteria: string;
  objective?: string;
  lessonType?: string;
}

export interface KnowledgeCheckQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface LessonAssignmentConstraints {
  kind?: string;
  questions?: KnowledgeCheckQuestion[];
  target?: Record<string, unknown>;
  unlocksPhysicalLesson?: boolean;
  completionAuthority?: string;
}

export interface LessonAssignmentInfo {
  id: string;
  classroomAssignmentId: string;
  title: string;
  instructions: string;
  allowedBlocks: string[];
  constraints?: LessonAssignmentConstraints;
  challengeTitle?: string | null;
  challengeDescription?: string | null;
}

export interface LessonAttemptSummary {
  id: string;
  status: string;
  score: number | null;
  submittedAt?: string | null;
}

export interface LessonDetailResponse {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  ordinal: number;
  content: LessonContent;
  objectives: LessonObjective[];
  status: LessonProgressStatus;
  progressPercent: number;
  lockReason: LessonLockReason | null;
  prerequisites: LessonPrerequisite[];
  assignment: LessonAssignmentInfo | null;
  activeAttempt: LessonAttemptSummary | null;
  priorAttempt: LessonAttemptSummary | null;
  created_at: string;
}

export interface KnowledgeCheckAnswerInput {
  questionId: string;
  optionId: string;
}

export interface SubmitKnowledgeCheckDto {
  answers: KnowledgeCheckAnswerInput[];
}

export interface KnowledgeCheckSubmissionResult {
  attemptId: string;
  passed: boolean;
  score: number;
  completedLessonId: string | null;
  newlyUnlockedLessonIds: string[];
}

export async function apiRequest<T>(path: string, accessToken: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) { const payload = await response.json().catch(() => null) as { message?: string } | null; throw new ApiError(response.status, payload?.message ?? `API request failed (${response.status}).`); }
  return response.json() as Promise<T>;
}

export interface ApiClassroom { id: string; name: string; organization_id: string; allocated_robot?: ApiRobotResource | null; }
export interface ApiRobotResource { id: string; name: string; serialNo: string; modelName: string; status?: string; }
export interface ApiTeachingClassroom extends ApiClassroom { code: string; status: string; organization_name: string; student_count: number; assignment_count: number; }
export interface ApiMyLearning { classroom_assignment_id: string; title: string; lesson_id: string; lesson_title: string; classroom_name: string; course_title: string; attempt_id: string | null; attempt_status: string | null; learning_status: 'assigned'|'started'|'completed'; }
export interface ApiOrganizationMembership { membershipId?: string; organizationId: string; roleCode: string; status: string; permissionCodes?: string[]; }
export interface ApiAccessContext { systemRoleCodes: string[]; memberships: ApiOrganizationMembership[]; }
export interface ApiSchoolMember { id:string; full_name:string; email:string|null; status:string; membership_id:string; membership_status:string; role_code:string; employee_code?:string|null; student_code?:string|null; grade_level?:string|null; guardian_email?:string|null; account_state?:'active'|'invited'|'account_setup_pending'; }
export interface ApiSchoolOverview { studentsCount:number; teachersCount:number; classroomsCount:number; robotResourcesCount:number; accountSetupPendingCount:number; }
export interface ApiSchoolPerson { id:string; displayName:string; role:'student'|'instructor'; studentCode?:string|null; employeeCode?:string|null; gradeLevel?:string|null; email:string|null; accountState:'active'|'invited'|'account_setup_pending'; }
export interface ApiMemberCandidate { userId:string; displayName:string; organizationRole:'student'|'instructor'; schoolCode:string|null; accountState:'active'|'invited'|'account_setup_pending'; alreadyMember:boolean; }
export interface ApiPage<T> { items:T[]; page:number; pageSize:number; total:number; }
export type ApiImportErrorCode='VALIDATION_ERROR'|'DUPLICATE_USER'|'ACCOUNT_INVITE_FAILED'|'ACCOUNT_PROVISIONING_FAILED'|'DATABASE_WRITE_FAILED'|'NOT_AUTHORIZED'|'UNKNOWN_IMPORT_ERROR';
export interface ApiSchoolImportResult { processed:number; created:number; unchanged:number; failed:number; results:Array<{row:number;status:'created'|'unchanged'|'failed';code?:ApiImportErrorCode;message?:string;name?:string;schoolCode?:string}>; }
export interface ApiClassroomStudentPreviewRow { row:number;firstName:string;lastName:string;studentCode:string;gradeLevel:string;email:string|null;status:'new_student'|'existing_student'|'already_in_class'|'needs_review';errors:string[];warnings:string[]; }
export interface ApiClassroomStudentPreview { processed:number;newStudents:number;existingStudents:number;alreadyInClass:number;needsReview:number;rows:ApiClassroomStudentPreviewRow[]; }
export interface ApiClassroomStudentImportResult { processed:number;createdAndAdded:number;existingAdded:number;unchanged:number;failed:number;results:Array<{row:number;status:'created_and_added'|'existing_added'|'unchanged'|'failed';code?:ApiImportErrorCode;message?:string;name:string;studentCode?:string}>; }
export interface ApiSchoolClassroom { id:string; organization_id:string; offering_id:string; name:string; code:string; status:string; offering_title:string|null; student_count:number; teaching_staff_count:number; allocated_robot?:ApiRobotResource|null; }
export interface ApiOffering { id:string; code:string; title:string; status:string; }
export interface ApiDeliveryChallenge { id:string; title:string; }
export interface ApiDeliveryOption { course_id:string; course_title:string; lesson_id:string; lesson_title:string; title:string; instructions:string; challenge_id:string|null; challenges:ApiDeliveryChallenge[]; }
export interface ApiEnrollment { id: string; course_id: string; classroom_id: string | null; status: string; enrolled_at?: string; completed_at?: string | null; }
export interface ApiClassroomAssignment { id: string; classroom_id: string; assignment_id: string; lesson_id: string; lesson_title?:string; challenge_id: string | null; challenge_title?:string|null; title: string; instructions: string | null; allowed_blocks?: unknown; constraints?: unknown; status: string; available_from?:string|null; due_at?:string|null; close_at?:string|null; max_attempts?:number|null; published_by?:string|null; }
export interface ApiAttempt { id: string; classroom_assignment_id: string; attempt_number?: number; program_id?: string | null; status: string; started_at?: string; submitted_at?: string | null; }
export interface ApiProgram { id: string; title: string; workspace_json: Record<string, unknown>; robot_program: Record<string, unknown>; }
export interface ApiProgramVersion { id: string; version_number: number; robot_program: Record<string, unknown>; }
export interface ApiSubmission { id: string; program_version_id: string; status: string; assignment_id?:string; program_id?:string; submitted_at?:string|null; }
export interface ApiExperiment { id: string; status: string; execution_mode: string; input_snapshot?:{attemptId?:string;programVersionId?:string}; submission_id?:string; }
export interface ApiSymbolicRuleResult { ordinal: number; type: string; passed: boolean; expected: Record<string, unknown>; observed: Record<string, unknown>; evidence: Array<{ timelineIndex?: number }>; reason: string; code?: string; message?: string; }
export interface ApiSymbolicEvaluation { id: string; experimentId: string; programVersionId: string; evaluatorVersion: string; ruleSetSchemaVersion: number; ruleSetHash: string; verdict: "passed" | "failed"; ruleResults: ApiSymbolicRuleResult[]; metrics: { ruleCount: number; passedRuleCount: number }; createdAt: string; status?: "success" | "failed"; taskState?: "not_started" | "in_progress" | "success" | "failed"; robotState?: Record<string, unknown>; feedback?: { code: string; message: string; ruleResults: Array<{ ordinal: number; type: string; passed: boolean; code?: string; message?: string; reason: string }> }; evidence?: { experimentId: string; evaluationId: string; programVersionId: string }; }
export interface ApiFeedback { id: string; submission_id: string; content: string; feedback_type: string; created_at: string; }
export interface ApiRubricCriterion { id: string; title: string; description: string | null; maxPoints: number | string; ordinal: number; }
export interface ApiInstructorSubmission { id: string; assignment_id: string; learner_user_id: string; status: string; submitted_at: string | null; full_name?: string; assignment_title?:string; review_status?:string; rubric_criteria?: ApiRubricCriterion[]; overall_feedback?: string | null; }
export interface ApiTeacherExperimentEvidence {id:string;executionMode:string;method:string;status:string;startedAt:string|null;endedAt:string|null;createdAt:string;provenance:{programVersionId:string|null};result:Record<string,unknown>;metrics:Record<string,unknown>;events:Array<{index:number;type:string;occurredAt:string;state?:string|null;errorCode?:string|null}>;artifacts:Array<{id:string;type:string;mimeType:string|null;createdAt:string;availability:'unavailable'|'local_only'|'metadata_only'}>;controlSession:{id:string;state:string;startedAt:string|null;endedAt:string|null;robot:{id:string;name:string;model:string;serial:string}}|null;demonstration:{id:string;status:string;startedAt:string;endedAt:string|null;frameCount:number|null;checksum:string|null;durationS:number|null;artifactAvailability:'unavailable'|'local_only'|'metadata_only';segments:Array<{index:number;startMs:number;endMs:number;action:string|null;arm:string|null;object:string|null}>;reflection:{prompt:string;response:string|null;createdAt:string}|null;datasets:Array<{id:string;name:string;version:string;split:string;frozen:boolean;huggingFaceRepo:string|null;huggingFaceRevision:string|null}>}|null;modelMetadata:{evaluationRunId:string;status:string;outcome:string|null;createdAt:string;checkpoint:{id:string;version:string;step:number|null};model:{id:string;name:string;status:string}}|null;}
export interface ApiInstructorSubmissionDetail extends ApiInstructorSubmission { email?:string|null;program_version:{id:string;versionNumber:number;workspaceJson:Record<string,unknown>;robotProgram:Record<string,unknown>;validationResult:Record<string,unknown>;changeSummary?:string|null;createdAt:string}|null;experiment:{id:string;status:string;executionMode:string;createdAt:string;endedAt?:string|null}|null;experiments:ApiTeacherExperimentEvidence[];symbolic_evaluation:ApiSymbolicEvaluation|null;assessment:{id:string;overallFeedback:string|null;reviewedAt:string;scores:Array<{criterionId:string;awardedPoints:number;comment?:string|null}>}|null;feedback:Array<{id:string;content:string;createdAt:string}>; }
export type ApiRecord = Record<string, unknown>;
export interface ApiIdentity { id: string; fullName: string; email: string | null; status: string; signupMethod: string; emailVerifiedAt: string | null; createdAt: string; updatedAt: string; }
export interface ApiReflection { id: string; submission_id: string; prompt_key: string; prompt_text: string; response_text: string | null; created_at: string; }
export interface ApiVrLessonSession { id?: string; state: 'NOT_STARTED'|'STARTING'|'READY'|'WAITING_FOR_HEADSET'|'CONNECTED'|'RUNNING'|'STOPPING'|'STOPPED'|'FAILED'; mode: 'offline_fake_follower'; operatorUrl: string | null; error: string | null; createdAt?: string; updatedAt?: string; }

export const learnerApi = {
  enrollments: (token: string) => apiGet<ApiEnrollment[]>("/me/enrollments?page=1&pageSize=100", token),
  classrooms: (token: string) => apiGet<ApiCollection<ApiClassroom>>("/me/classrooms?page=1&pageSize=100", token),
  assignments: (classroomId: string, token: string) => apiGet<ApiClassroomAssignment[]>(`/classrooms/${classroomId}/assignments`, token),
  attempts: (token: string) => apiGet<ApiAttempt[]>("/me/attempts", token),
  myLearning: (token: string) => apiGet<ApiMyLearning[]>("/me/learning", token),
  createAttempt: (classroomAssignmentId: string, token: string) => apiRequest<ApiAttempt>(`/classroom-assignments/${classroomAssignmentId}/attempts`, token, "POST"),
  attempt: (attemptId: string, token: string) => apiGet<ApiAttempt>(`/me/attempts/${attemptId}`, token),
  program: (attemptId: string, token: string) => apiGet<ApiProgram>(`/me/attempts/${attemptId}/program`, token),
  createProgram: (attemptId: string, token: string, body: { title: string; workspaceJson: Record<string, unknown>; robotProgram: Record<string, unknown> }) => apiRequest<ApiProgram>(`/me/attempts/${attemptId}/program`, token, "POST", body),
  updateProgram: (programId: string, token: string, body: { title?: string; workspaceJson?: Record<string, unknown>; robotProgram?: Record<string, unknown> }) => apiRequest<ApiProgram>(`/me/programs/${programId}`, token, "PATCH", body),
  versions: (programId: string, token: string) => apiGet<ApiProgramVersion[]>(`/me/programs/${programId}/versions`, token),
  createVersion: (programId: string, token: string, changeSummary?: string) => apiRequest<ApiProgramVersion>(`/me/programs/${programId}/versions`, token, "POST", { changeSummary }),
  submit: (attemptId: string, token: string, programVersionId: string, reflection?: string) => apiRequest<ApiSubmission>(`/me/attempts/${attemptId}/submission`, token, "POST", { programVersionId, reflection }),
  createSchematic: (attemptId: string, token: string, programVersionId: string) => apiRequest<ApiExperiment>(`/me/attempts/${attemptId}/experiments`, token, "POST", { programVersionId, executionMode: "schematic" }),
  runSchematic: (experimentId: string, token: string) => apiRequest<Record<string, unknown>>(`/me/experiments/${experimentId}/run-schematic`, token, "POST"),
  schematicResult: (experimentId: string, token: string) => apiGet<Record<string, unknown>[]>(`/me/experiments/${experimentId}/result`, token),
  evaluateSymbolic: (experimentId: string, token: string) => apiRequest<ApiSymbolicEvaluation>(`/me/experiments/${experimentId}/evaluate-symbolic`, token, "POST"),
  symbolicEvaluation: (evaluationId: string, token: string) => apiGet<ApiSymbolicEvaluation>(`/me/symbolic-evaluations/${evaluationId}`, token),
  submissions: (token:string) => apiGet<ApiSubmission[]>("/me/submissions",token),
  experiments: (token:string) => apiGet<ApiExperiment[]>("/me/experiments",token),
  symbolicEvaluations: (token:string) => apiGet<ApiSymbolicEvaluation[]>("/me/symbolic-evaluations",token),
  artifacts: (experimentId: string, token: string) => apiGet<Record<string, unknown>[]>(`/me/experiments/${experimentId}/artifacts`, token),
  myFeedback: (submissionId: string, token: string) => apiGet<ApiFeedback[]>(`/me/submissions/${submissionId}/feedback`, token),
  createReflection: (submissionId: string, token: string, body: { promptKey: string; promptText: string; responseText: string }) => apiRequest<Record<string, unknown>>(`/me/submissions/${submissionId}/reflections`, token, "POST", body),
  coursePath: (courseId: string, token: string) => progressionApi.coursePath(courseId, token),
  coursePaths: (token: string) => progressionApi.coursePaths(token),
  submitKnowledgeCheck: (attemptId: string, dto: SubmitKnowledgeCheckDto, token: string) =>
    progressionApi.submitKnowledgeCheck(attemptId, dto, token),
};

export const progressionApi = {
  coursePath: (courseId: string, token: string) => apiGet<CoursePathResponse>(`/me/courses/${courseId}/path`, token),
  coursePaths: async (token: string): Promise<CoursePathResponse[]> => {
    const coursesRes = await catalogApi.courses(token, 1, 50).catch(() => ({ items: [] as ApiCourse[] }));
    let courseIds = coursesRes.items.map((c) => c.id);
    if (!courseIds.length) {
      const enrollments = await learnerApi.enrollments(token).catch(() => [] as ApiEnrollment[]);
      courseIds = enrollments.filter((e) => e.status === "active" && e.course_id).map((e) => e.course_id);
    }
    if (!courseIds.length) return [];
    const uniqueIds = Array.from(new Set(courseIds));
    const paths = await Promise.all(
      uniqueIds.map((id) => progressionApi.coursePath(id, token).catch(() => null))
    );
    return paths.filter((p): p is CoursePathResponse => Boolean(p));
  },
  submitKnowledgeCheck: (attemptId: string, dto: SubmitKnowledgeCheckDto, token: string) =>
    apiRequest<KnowledgeCheckSubmissionResult>(`/me/attempts/${attemptId}/knowledge-check`, token, "POST", dto),
};

export const instructorApi = {
  classrooms: learnerApi.classrooms,
  teachingClassrooms: (token: string) => apiGet<ApiTeachingClassroom[]>("/me/teaching-classrooms", token),
  submissions: (classroomId: string, token: string) => apiGet<ApiInstructorSubmission[]>(`/classrooms/${classroomId}/submissions`, token),
  submission: (submissionId: string, token: string) => apiGet<ApiInstructorSubmissionDetail>(`/submissions/${submissionId}`, token),
  assess: (submissionId: string, token: string, body: { overallFeedback?: string; scores: { criterionId: string; awardedPoints: number; comment?: string }[] }) => apiRequest<ApiInstructorSubmission[]>(`/submissions/${submissionId}/assessment`, token, "POST", body),
  feedback: (submissionId: string, token: string, content: string) => apiRequest<ApiFeedback>(`/submissions/${submissionId}/feedback`, token, "POST", { content }),
};

/** Typed domain groups are the canonical browser contract.  `learnerApi` and
 * `instructorApi` above remain compatibility aliases for already-wired pages. */
export const identityApi = {
  me: (token: string) => apiGet<ApiIdentity>("/me", token),
  roles: (token: string) => apiGet<ApiAccessContext>("/me/roles", token),
  permissions: (token: string) => apiGet<ApiRecord[]>("/me/permissions", token),
  memberships: (token: string) => apiGet<ApiOrganizationMembership[]>("/me/memberships", token),
  updateProfile: (token: string, fullName: string) => apiRequest<ApiIdentity>("/me/profile", token, "PATCH", { fullName }),
};
export const educationAdminApi = {
  overview: (organizationId:string,token:string) => apiGet<ApiSchoolOverview>(`/education-admin/organizations/${organizationId}/overview`,token),
  people: (organizationId:string,token:string,filters:{page:number;pageSize:number;search?:string;role?:'student'|'instructor'}) => { const query=new URLSearchParams({page:String(filters.page),pageSize:String(filters.pageSize)});if(filters.search)query.set('search',filters.search);if(filters.role)query.set('role',filters.role);return apiGet<ApiPage<ApiSchoolPerson>>(`/education-admin/organizations/${organizationId}/people?${query}`,token); },
  offerings: (organizationId:string,token:string) => apiGet<ApiOffering[]>(`/education-admin/organizations/${organizationId}/offerings`,token),
  members: (organizationId:string, token:string) => apiGet<ApiSchoolMember[]>(`/education-admin/organizations/${organizationId}/members`, token),
  classrooms: (organizationId:string, token:string) => apiGet<ApiSchoolClassroom[]>(`/education-admin/organizations/${organizationId}/classrooms`, token),
  classroomMembers: (organizationId:string, classroomId:string, token:string) => apiGet<ApiRecord[]>(`/education-admin/organizations/${organizationId}/classrooms/${classroomId}/members`, token),
  memberCandidates: (organizationId:string,classroomId:string,token:string,filters:{page:number;pageSize:number;search?:string}) => { const query=new URLSearchParams({page:String(filters.page),pageSize:String(filters.pageSize)});if(filters.search)query.set('search',filters.search);return apiGet<ApiPage<ApiMemberCandidate>>(`/education-admin/organizations/${organizationId}/classrooms/${classroomId}/member-candidates?${query}`,token); },
  createClassroom: (organizationId:string, token:string, body:ApiRecord) => apiRequest<ApiSchoolClassroom>(`/education-admin/organizations/${organizationId}/classrooms`,token,'POST',body),
  importUsers: (organizationId:string,token:string,body:ApiRecord) => apiRequest<ApiSchoolImportResult>(`/education-admin/organizations/${organizationId}/user-imports`,token,'POST',body),
  previewClassroomStudentImport: (organizationId:string,classroomId:string,token:string,body:ApiRecord) => apiRequest<ApiClassroomStudentPreview>(`/education-admin/organizations/${organizationId}/classrooms/${classroomId}/student-imports/preview`,token,'POST',body),
  confirmClassroomStudentImport: (organizationId:string,classroomId:string,token:string,body:ApiRecord) => apiRequest<ApiClassroomStudentImportResult>(`/education-admin/organizations/${organizationId}/classrooms/${classroomId}/student-imports`,token,'POST',body),
  upsertMember: (organizationId:string,classroomId:string,token:string,body:ApiRecord) => apiRequest<ApiRecord>(`/education-admin/organizations/${organizationId}/classrooms/${classroomId}/members`,token,'POST',body),
  eligibleRobots: (classroomId:string,token:string) => apiGet<ApiRobotResource[]>(`/education-admin/classrooms/${classroomId}/eligible-robots`,token),
  allocateRobot: (classroomId:string,token:string,robotId:string) => apiRequest<ApiRecord>(`/education-admin/classrooms/${classroomId}/robot-allocation`,token,'PUT',{robotId}),
};
export const catalogApi = {
  courses: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiCourse>>(`/courses?page=${page}&pageSize=${pageSize}`, token),
  course: (courseId: string, token: string) => apiGet<ApiCourse>(`/courses/${courseId}`, token),
  lessons: (courseId: string, token: string) => apiGet<ApiRecord[]>(`/courses/${courseId}/lessons`, token),
  lesson: (lessonId: string, token: string) => apiGet<ApiRecord>(`/lessons/${lessonId}`, token),
  lessonDetail: (lessonId: string, token: string) => apiGet<LessonDetailResponse>(`/lessons/${lessonId}`, token),
  levels: (token: string) => apiGet<ApiRecord[]>("/learning-levels", token),
  competencies: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/competencies?page=${page}&pageSize=${pageSize}`, token),
  myCompetencies: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/me/competencies?page=${page}&pageSize=${pageSize}`, token),
  offerings: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/course-offerings?page=${page}&pageSize=${pageSize}`, token),
  challenges: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/challenges?page=${page}&pageSize=${pageSize}`, token),
  challenge: (id: string, token: string) => apiGet<ApiRecord>(`/challenges/${id}`, token),
  challengeObjects: (id: string, token: string) => apiGet<ApiRecord[]>(`/challenges/${id}/objects`, token),
  challengeConditions: (id: string, token: string) => apiGet<ApiRecord[]>(`/challenges/${id}/conditions`, token),
};
export const classroomApi = {
  mine: learnerApi.classrooms,
  detail: (id: string, token: string) => apiGet<ApiClassroom>(`/classrooms/${id}`, token),
  course: (id: string, token: string) => apiGet<ApiRecord>(`/classrooms/${id}/course`, token),
  members: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/members`, token),
  students: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/students`, token),
  instructors: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/instructors`, token),
  summary: (id: string, token: string) => apiGet<ApiRecord>(`/classrooms/${id}/summary`, token),
  dashboard: (id: string, token: string) => apiGet<ApiRecord>(`/classrooms/${id}/dashboard`, token),
  progressSummary: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/progress-summary`, token),
  submissionSummary: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/submission-summary`, token),
  activity: (id: string, token: string) => apiGet<ApiRecord[]>(`/classrooms/${id}/activity`, token),
};
export const organizationApi = {
  detail: (id: string, token: string) => apiGet<ApiRecord>(`/organizations/${id}`, token),
  classrooms: (id: string, token: string) => apiGet<ApiClassroom[]>(`/organizations/${id}/classrooms`, token),
};
export const assignmentApi = {
  list: learnerApi.assignments,
  detail: (id: string, token: string) => apiGet<ApiClassroomAssignment>(`/classroom-assignments/${id}`, token),
  assignment: (id: string, token: string) => apiGet<ApiRecord>(`/assignments/${id}`, token),
  rubric: (id: string, token: string) => apiGet<ApiRubricCriterion[]>(`/assignments/${id}/rubric`, token),
  challengeAssignments: (id: string, token: string) => apiGet<ApiRecord[]>(`/challenges/${id}/assignments`, token),
  create: (classroomId: string, token: string, body: ApiRecord) => apiRequest<ApiRecord>(`/classrooms/${classroomId}/assignments`, token, "POST", body),
  deliveryOptions: (classroomId:string,token:string) => apiGet<ApiDeliveryOption[]>(`/classrooms/${classroomId}/delivery-options`,token),
  update: (classroomId: string, assignmentId: string, token: string, body: ApiRecord) => apiRequest<ApiRecord>(`/classrooms/${classroomId}/assignments/${assignmentId}`, token, "PATCH", body),
  publish: (classroomId:string,assignmentId:string,token:string) => apiRequest<ApiClassroomAssignment>(`/classrooms/${classroomId}/assignments/${assignmentId}/publish`,token,"POST"),
};
export const attemptApi = { list: learnerApi.attempts, detail: learnerApi.attempt, create: learnerApi.createAttempt, workspace: (id: string, token: string) => apiGet<ApiRecord>(`/me/attempts/${id}/workspace`, token) };
export const programApi = { getForAttempt: learnerApi.program, create: learnerApi.createProgram, update: learnerApi.updateProgram, versions: learnerApi.versions, createVersion: learnerApi.createVersion, submit: learnerApi.submit };
export const submissionApi = {
  mine: (token: string) => apiGet<ApiSubmission[]>("/me/submissions", token),
  detail: (id: string, token: string) => apiGet<ApiRecord>(`/me/submissions/${id}`, token),
};
export const experimentApi = { createSchematic: learnerApi.createSchematic, runSchematic: learnerApi.runSchematic, result: learnerApi.schematicResult, artifacts: learnerApi.artifacts, mine: (token: string) => apiGet<ApiExperiment[]>("/me/experiments", token), detail: (id: string, token: string) => apiGet<ApiExperiment>(`/me/experiments/${id}`, token) };
export const symbolicEvaluationApi = { evaluate: learnerApi.evaluateSymbolic, detail: learnerApi.symbolicEvaluation, mine: (token: string) => apiGet<ApiSymbolicEvaluation[]>("/me/symbolic-evaluations", token) };
export const assessmentApi = { classroomSubmissions: instructorApi.submissions, detail: instructorApi.submission, assess: instructorApi.assess };
export const feedbackApi = { mine: learnerApi.myFeedback, instructor: (submissionId: string, token: string) => apiGet<ApiFeedback[]>(`/submissions/${submissionId}/feedback`, token), create: instructorApi.feedback };
export const reflectionApi = { list: (submissionId: string, token: string) => apiGet<ApiReflection[]>(`/me/submissions/${submissionId}/reflections`, token), create: learnerApi.createReflection };
export const vrLessonApi = { status: (attemptId:string, token:string) => apiGet<ApiVrLessonSession>(`/me/attempts/${attemptId}/vr-session`, token), start: (attemptId:string, token:string) => apiRequest<ApiVrLessonSession>(`/me/attempts/${attemptId}/vr-session`, token, 'POST'), stop: (sessionId:string, token:string) => apiRequest<ApiVrLessonSession>(`/me/vr-sessions/${sessionId}/stop`, token, 'POST'), complete: (sessionId:string, token:string, reflection:Record<string,string>) => apiRequest<ApiVrLessonSession>(`/me/vr-sessions/${sessionId}/complete`, token, 'POST', { reflection }) };
export const demonstrationApi = { mine: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/me/demonstrations?page=${page}&pageSize=${pageSize}`, token), detail: (id: string, token: string) => apiGet<ApiRecord>(`/me/demonstrations/${id}`, token), segments: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/demonstrations/${id}/segments`, token), annotations: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/demonstrations/${id}/annotations`, token), observationConfiguration: (id: string, token: string) => apiGet<ApiRecord>(`/me/demonstrations/${id}/observation-configuration`, token), datasetVersions: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/demonstrations/${id}/dataset-versions`, token) };
export const datasetApi = { mine: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/me/dataset-versions?page=${page}&pageSize=${pageSize}`, token), detail: (id: string, token: string) => apiGet<ApiRecord>(`/me/dataset-versions/${id}`, token), summary: (id: string, token: string) => apiGet<ApiRecord>(`/me/dataset-versions/${id}/summary`, token), episodes: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/dataset-versions/${id}/episodes`, token), episode: (datasetId: string, episodeId: string, token: string) => apiGet<ApiRecord>(`/me/dataset-versions/${datasetId}/episodes/${episodeId}`, token), trainingRuns: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/dataset-versions/${id}/training-runs`, token) };
export const modelApi = { trainingRuns: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/me/training-runs?page=${page}&pageSize=${pageSize}`, token), trainingRun: (id: string, token: string) => apiGet<ApiRecord>(`/me/training-runs/${id}`, token), trainingMetrics: (id: string, token: string) => apiGet<ApiRecord>(`/me/training-runs/${id}/metrics`, token), trainingDataset: (id: string, token: string) => apiGet<ApiRecord>(`/me/training-runs/${id}/dataset-version`, token), trainingCheckpoints: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/training-runs/${id}/checkpoints`, token), trainingCheckpoint: (runId: string, checkpointId: string, token: string) => apiGet<ApiRecord>(`/me/training-runs/${runId}/checkpoints/${checkpointId}`, token), models: (token: string, page = 1, pageSize = 20) => apiGet<ApiCollection<ApiRecord>>(`/ai-models?page=${page}&pageSize=${pageSize}`, token), model: (id: string, token: string) => apiGet<ApiRecord>(`/ai-models/${id}`, token), checkpoints: (id: string, token: string) => apiGet<ApiRecord[]>(`/ai-models/${id}/checkpoints`, token), checkpointModel: (id: string, token: string) => apiGet<ApiRecord>(`/model-checkpoints/${id}/model`, token) };
export const vlaProvenanceApi = { forExperiment: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/experiments/${id}/vla-interactions`, token), detail: (id: string, token: string) => apiGet<ApiRecord>(`/me/vla-interactions/${id}`, token), summary: (id: string, token: string) => apiGet<ApiRecord>(`/me/vla-interactions/${id}/summary`, token), experiment: (id: string, token: string) => apiGet<ApiRecord>(`/me/vla-interactions/${id}/experiment`, token), steps: (id: string, token: string) => apiGet<ApiRecord[]>(`/me/vla-interactions/${id}/action-steps`, token) };
export const dashboardApi = { mine: (token: string) => apiGet<ApiRecord>("/me/dashboard", token), learningSummary: (token: string) => apiGet<ApiRecord>("/me/learning-summary", token), recentActivity: (token: string) => apiGet<ApiRecord[]>("/me/recent-activity", token) };
export const runtimeApi = { health: (token: string) => apiGet<ApiRecord>("/runtime/health", token), status: (token: string) => apiGet<ApiRecord>("/runtime/status", token) };
/** Future Nest-only robot execution boundary. It deliberately does not expose
 * a CHECKIK URL, runtime token, serial port, or canonical program payload. */
export const robotExecutionApi = {
  eligibility: (token: string, attemptId: string) => apiGet<ApiRecord>(`/me/attempts/${attemptId}/physical-execution-eligibility`, token),
  active: (token: string, attemptId: string) => apiGet<ApiRecord | null>(`/me/attempts/${attemptId}/physical-executions/active`, token),
  execute: (token: string, attemptId: string) => apiRequest<ApiRecord>(`/me/attempts/${attemptId}/physical-executions/start`, token, "POST"),
  execution: (token: string, executionId: string) => apiGet<ApiRecord>(`/me/physical-executions/${executionId}`, token),
  stop: (token: string, executionId: string) => apiRequest<ApiRecord>(`/me/physical-executions/${executionId}/stop`, token, "POST"),
};
