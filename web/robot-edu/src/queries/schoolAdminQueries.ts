export type SchoolTab = 'overview' | 'users' | 'classrooms';
export interface PeopleFilters { page: number; pageSize: number; search: string; role: 'all' | 'student' | 'instructor'; }
export interface CandidateFilters { page: number; pageSize: number; search: string; }

export const schoolAdminKeys = {
  root: ['school-admin'] as const,
  overview: (organizationId: string) => ['school-admin', organizationId, 'overview'] as const,
  peopleRoot: (organizationId: string) => ['school-admin', organizationId, 'people'] as const,
  people: (organizationId: string, filters: PeopleFilters) => ['school-admin', organizationId, 'people', filters] as const,
  classrooms: (organizationId: string) => ['school-admin', organizationId, 'classrooms'] as const,
  members: (organizationId: string, classroomId: string) => ['school-admin', organizationId, 'classrooms', classroomId, 'members'] as const,
  candidatesRoot: (organizationId: string, classroomId: string) => ['school-admin', organizationId, 'classrooms', classroomId, 'candidates'] as const,
  candidates: (organizationId: string, classroomId: string, filters: CandidateFilters) => ['school-admin', organizationId, 'classrooms', classroomId, 'candidates', filters] as const,
  offerings: (organizationId: string) => ['school-admin', organizationId, 'offerings'] as const,
  eligibleRobots: (organizationId: string, classroomId: string) => ['school-admin', organizationId, 'classrooms', classroomId, 'eligible-robots'] as const,
  robotResource: (organizationId: string, classroomId: string) => ['school-admin', organizationId, 'classrooms', classroomId, 'robot-resource'] as const,
};

export const importInvalidations = (organizationId: string) => [schoolAdminKeys.peopleRoot(organizationId), schoolAdminKeys.overview(organizationId)];
export const memberInvalidations = (organizationId: string, classroomId: string) => [schoolAdminKeys.members(organizationId, classroomId), schoolAdminKeys.candidatesRoot(organizationId, classroomId), schoolAdminKeys.classrooms(organizationId)];
export const classroomStudentImportInvalidations = (organizationId: string, classroomId: string) => [schoolAdminKeys.peopleRoot(organizationId), schoolAdminKeys.overview(organizationId), schoolAdminKeys.members(organizationId, classroomId), schoolAdminKeys.candidatesRoot(organizationId, classroomId), schoolAdminKeys.classrooms(organizationId)];
export const robotInvalidations = (organizationId: string, classroomId: string) => [schoolAdminKeys.classrooms(organizationId), schoolAdminKeys.robotResource(organizationId, classroomId)];
export const eligibleRobotsEnabled = (dialogOpen: boolean, classroomId: string) => dialogOpen && Boolean(classroomId);

export function schoolAdminEnabledQueries(input: { tab: SchoolTab; organizationId: string; selectedClassroomId?: string; createOpen?: boolean; memberOpen?: boolean }) {
  const active = Boolean(input.organizationId);
  const classrooms = active && input.tab === 'classrooms';
  const selected = classrooms && Boolean(input.selectedClassroomId);
  return {
    overview: active && input.tab === 'overview',
    people: active && input.tab === 'users',
    classrooms,
    roster: selected,
    offerings: classrooms && Boolean(input.createOpen),
    candidates: selected && Boolean(input.memberOpen),
  };
}
